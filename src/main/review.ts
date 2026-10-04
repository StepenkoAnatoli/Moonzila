import { randomUUID } from 'node:crypto';
import { open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ControlSchema, engineFailureCode, type Control } from '../engine/control';
import { ResearchContextSchema, ResearchRecoverySchema, ResearchTransitionReplySchema, type ResearchVerification } from '../engine/research';
import { ResearchReviewBeginReplySchema, ResearchReviewContextSchema, ReviewPreflightResultSchema, type ResearchReviewContext, type ReviewedPackage, type ReviewToolResult, type ReviewWorkspace } from '../engine/review-contract';
import type { Binding, Receipt, Result } from '../adapters/research-kit/contracts';
import type { ReviewIdentity, ReviewLaunch, ReviewTool } from '../adapters/research-kit/adapter';
import { privateDirectory } from '../models/artifact-files';
import type { OwnedResult } from '../tools/commands';
import type { Research, Run, RunEvent } from '../shared';
import { acceptsTree, containedFolder, copyWorkspace, foldAccepted, foldExpected, materialise, readPackage, removeJournalTemps, reviewDigest, reviewFolder, sameInventory, treeInventory, type Inventory } from './review-workspace';

/** What the supervisor needs from the Research Kit adapter (`ResearchKit` implements it). */
export interface ReviewKit {
  prepareReview(signal?: AbortSignal): Promise<ReviewLaunch>;
  verifyRetained(artifactSha256: string, binding: Binding, signal?: AbortSignal, admit?: () => Promise<void>): Promise<{ receipt: Receipt; bytes: Buffer }>;
  validate(file: string, binding: Binding, signal?: AbortSignal, admit?: () => Promise<void>): Promise<Result>;
  readVerified(id: string, binding: Binding): Promise<Buffer>;
  discardReview(names: readonly string[]): Promise<void>;
}
export interface ReviewDeps {
  control(control: Control): Promise<unknown>;
  kit: ReviewKit | null;
  /** The run capability main holds for a run: its stop signal, or RUN_CANCELLED when main holds none for this epoch. */
  runSignal(runId: string, epoch: string): AbortSignal;
  redact(text: string): Promise<string>;
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
  /** Pause before re-reading a held or waiting job (default 1 s). */
  retryDelayMs?: number;
}

type Transition = { to: 'packaging' | 'approved' | 'not_ready' | 'cancelled'; expectedRevision: number; cause: string; failure?: string; reviewDigest?: string; reviewedPackage?: ReviewedPackage };
type StopReason = 'cancel' | 'hold' | 'quit';
interface Job { id: string; projectId: string; child?: AbortController; reason?: StopReason; wake: AbortController; pending?: Control; stale: number }
/** A step's verdict, in job vocabulary: what to record, or nothing (re-read, the job moved on). */
type Verdict = { failure: string; cause: string; reviewedPackage?: ReviewedPackage } | null;

const LIVE_RUN: ReadonlySet<string> = new Set(['queued', 'running', 'awaiting_approval', 'cancelling']);
const MAX_BRIEF = 1024 * 1024;
/**
 * Workspace files the kit's brief.mjs replaces (pinned kit, lib/brief.mjs renderBrief via lib/core.mjs writeBytes: a
 * scratch dotfile renamed over the target; with --force also a new BRIEF.md.bak-<date>). preflight.mjs writes nothing in
 * the project; create writes only its --output, outside the workspace.
 */
const BRIEF_WRITES: ReadonlySet<string> = new Set(['research/BRIEF.md']);
const MAX_DETAIL = 1024;
const MAX_FINDINGS = 200;
/** Ordinary request failures `research.review.start` may return; anything else from the kit is mapped first. */
const ADMISSION_ERRORS: Record<string, string> = { PROJECT_UNTRUSTED: 'PROJECT_UNTRUSTED', PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND', RESEARCH_NOT_ALLOWED: 'RESEARCH_NOT_ALLOWED' };
/** A link at or above the workspace root (containedFolder): the step never reads, packages or writes through it. */
const NOT_CONTAINED = { failure: 'REVIEW_WORKSPACE_CHANGED', cause: 'WORKSPACE_NOT_CONTAINED' } as const;
const PreflightOutputSchema = z.object({
  pass: z.boolean(), counts: z.object({ pass: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), warn: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), fail: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict(),
  evidencePolicy: z.string().max(32), findings: z.array(z.object({ severity: z.enum(['pass', 'warn', 'fail']), check: z.string().max(128), rule: z.string().max(128), detail: z.string() }).strip()).max(100_000),
}).strip();
type PreflightOutput = z.infer<typeof PreflightOutputSchema>;

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', done); resolve(); }, ms);
    const done = () => { clearTimeout(timer); resolve(); };
    signal.addEventListener('abort', done, { once: true });
  });
}
const message = (error: unknown) => (error instanceof Error ? error.message : '');

/** The binding a receipt is checked against: the job's journaled verification, never the package's own manifest. */
export function reviewBinding(projectId: string, researchId: string, verification: ResearchVerification, jobRevision: number): Binding {
  return { projectId, projectRevision: verification.projectRevision, jobId: researchId, jobRevision, clientRef: verification.clientRef, repository: verification.repository,
    ref: verification.ref, commit: verification.commit, workflow: verification.workflow, workflowRunId: Number(verification.workflowRunId), runAttempt: verification.runAttempt };
}
/**
 * The preflight child's verdict, or null when it is not one: the whole output must parse as the kit's `--json` object,
 * with exit 0 exactly when `pass` and 1 exactly when not. A crash also exits 1, with no JSON, so exit 1 alone is nothing.
 */
export function classifyPreflight(run: OwnedResult): PreflightOutput | null {
  if (run.status !== 'exited' || run.truncated || run.timedOut || run.cancelled) return null;
  let parsed: PreflightOutput;
  try { parsed = PreflightOutputSchema.parse(JSON.parse(run.output)); } catch { return null; }
  return run.code === (parsed.pass ? 0 : 1) ? parsed : null;
}
/** Why a child gave no usable result, in packaging's cause vocabulary. */
function launchCause(run: OwnedResult): string | null {
  if (run.timedOut) return 'OWNED_TIMEOUT';
  if (run.truncated) return 'KIT_OUTPUT_LIMIT';
  if (run.status !== 'exited' || run.code === null) return 'HELPER_FAILED';
  return null;
}
/** packaging's outcome for a validated package that is not research-ready (spec "Packaging", step 6). */
export function notReadyFailure(state: Result['state']): string {
  if (state === 'PREFLIGHT_BLOCKED') return 'REVIEW_GATE_FAILED';
  if (state === 'REVIEW_IN_PROGRESS' || state === 'REVIEW_REQUIRED') return 'REVIEW_INCOMPLETE';
  return 'REVIEW_PACKAGE_INVALID';
}

/** Validation errors that are this machine's (storage, bounds, the validator's own output), never a verdict on the package. */
const MACHINE_FAULTS: ReadonlySet<string> = new Set(['STORAGE_LIMIT', 'TIMEOUT', 'OUTPUT_LIMIT', 'VALIDATOR_OUTPUT', 'STALE_VERIFICATION']);
/**
 * packaging's outcome for a validation of the produced bytes that gave no receipt (spec "Packaging", step 4). Only the
 * package's own faults (ARTIFACT_INVALID, INPUT_LIMIT, IDENTITY_MISMATCH, a non-PASS verdict) are REVIEW_PACKAGE_INVALID;
 * an invalid installation is RESEARCH_KIT_UNAVAILABLE, and any other fault of this machine REVIEW_PACKAGING_FAILED.
 */
export function validationFailure(result: Pick<Result, 'status' | 'error'>): { failure: string; cause: string } {
  if (result.error === 'INSTALLATION_INVALID') return { failure: 'RESEARCH_KIT_UNAVAILABLE', cause: 'INSTALLATION_INVALID' };
  if (result.error !== null && MACHINE_FAULTS.has(result.error)) return { failure: 'REVIEW_PACKAGING_FAILED', cause: result.error };
  return { failure: 'REVIEW_PACKAGE_INVALID', cause: result.error ?? `VALIDATOR_${result.status}` };
}

/**
 * The review supervisor (plan Task 5, B3): `research.review.start`, the private workspace, the kit tools served to the
 * engine, the freeze, packaging and validation of the new package, recovery adoption and cancel. Main owns the
 * workspace, every kit child and the verified bytes; the engine owns the jobs and the review run. Every commit is
 * planned from freshly read context and keeps one request id until the engine answers.
 */
export class ReviewSupervisor {
  private readonly jobs = new Map<string, Job>();
  private readonly drivers = new Map<string, Promise<void>>();
  /** Jobs whose driver stopped on a commit the engine refused for good: owned until the next app start. */
  private readonly heldIds = new Set<string>();
  private readonly starting = new Map<string, Promise<unknown>>();
  /** Review run id -> job id, for runs this process began. */
  private readonly runs = new Map<string, string>();
  private readonly holds = new Map<string, number>();
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly retry: number;
  private readyWaiters = new Set<() => void>();
  private closing = false;

  constructor(private readonly deps: ReviewDeps) {
    this.sleep = deps.sleep ?? defaultSleep; this.retry = deps.retryDelayMs ?? 1000;
  }

  ownedIds(): string[] { return [...new Set([...this.jobs.keys(), ...this.heldIds, ...this.starting.keys()])]; }
  busy(): boolean { return this.jobs.size > 0 || this.starting.size > 0; }

  // ---------------------------------------------------------------- starting a review

  /** `research.review.start`, serialized per job. Returns the engine's `{research, run}`; main installs the run capability. */
  start(researchId: string, profileId: string): Promise<{ research: Research; run: Run }> {
    if (this.closing) return Promise.reject(new Error('ENGINE_UNAVAILABLE'));
    const previous = this.starting.get(researchId) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(() => this.startOwned(researchId, profileId));
    this.starting.set(researchId, task);
    void task.catch(() => {}).finally(() => { if (this.starting.get(researchId) === task) this.starting.delete(researchId); });
    return task;
  }

  private async startOwned(researchId: string, profileId: string): Promise<{ research: Research; run: Run }> {
    if (this.jobs.has(researchId) || this.heldIds.has(researchId)) throw new Error('REVIEW_NOT_AVAILABLE');
    const ctx = await this.reviewContext(researchId);
    if (ctx.status !== 'collected' && ctx.status !== 'not_ready') throw new Error('REVIEW_NOT_AVAILABLE');
    if (ctx.admission !== null) throw new Error(ADMISSION_ERRORS[ctx.admission] ?? 'REVIEW_NOT_AVAILABLE');
    const kit = this.deps.kit; if (!kit) throw new Error('RESEARCH_KIT_UNAVAILABLE');
    if (!ctx.verification) throw new Error('REVIEW_NOT_AVAILABLE');
    const { projectId } = await this.job(researchId);
    let bytes: Buffer;
    try { ({ bytes } = await kit.verifyRetained(ctx.verification.artifactSha256, reviewBinding(projectId, researchId, ctx.verification, ctx.verification.jobRevision))); }
    catch (error) { throw new Error(message(error) === 'INSTALLATION_INVALID' ? 'RESEARCH_KIT_UNAVAILABLE' : 'STALE_VERIFICATION', { cause: error }); }
    let base: Inventory;
    try { ({ base } = await readPackage(bytes)); } catch { throw new Error('STALE_VERIFICATION'); }
    let launch: ReviewLaunch;
    try { launch = await kit.prepareReview(); } catch { throw new Error('RESEARCH_KIT_UNAVAILABLE'); }
    const folder = reviewFolder(launch.root, researchId);
    // Only a contained workspace is continued; a link at the workspace root is replaced by materialisation (which removes
    // the link itself, never its destination), and a link at storage/review/<id> refuses the start.
    const kept = ctx.status === 'not_ready' && await this.contained(launch.root, researchId) && await this.keeps(folder.project, base, ctx.changes);
    let workspace: ReviewWorkspace = kept ? 'continued' : 'fresh';
    for (let attempt = 0; ; attempt++) {
      if (workspace === 'fresh') await this.materialise(bytes, folder.job);
      if (!(await this.contained(launch.root, researchId))) throw new Error('PATH_OUTSIDE_PROJECT');
      // One request id per planned begin, kept across the engine's restarts: a begin committed whose reply was lost replays.
      const control = ControlSchema.parse({ method: 'research.review.begin', requestId: randomUUID(), researchId, profileId, workspace });
      let retried = false;
      try {
        const reply = ResearchReviewBeginReplySchema.parse(await this.engine(() => this.deps.control(control), () => { retried = true; }));
        this.runs.set(reply.run.id, researchId);
        // After an engine restart the reply may be a replay naming a run the new engine interrupted at its start: the job
        // is then left reviewing under a terminal run, and recovery skipped it while this start owned it. Checked once the
        // reply is returned, so the run's capability is installed before its first step, as for any start.
        if (retried) void Promise.resolve().then(() => this.afterReplay(researchId, reply.run.id)).catch(() => {});
        return reply;
      } catch (error) {
        // The engine found an earlier review write it cannot reconcile with the kept workspace: rebuild from the package.
        if (engineFailureCode(error) === 'REVIEW_WORKSPACE_CHANGED' && workspace === 'continued' && attempt === 0) { workspace = 'fresh'; continue; }
        throw error;
      }
    }
  }
  /** Owns a job left reviewing under the begun run once that run is terminal; the driver then ends it (REVIEW_INTERRUPTED). */
  private async afterReplay(researchId: string, runId: string): Promise<void> {
    const now = await this.reviewContext(researchId);
    if (now.status === 'reviewing' && now.reviewRunId === runId && (now.reviewRunStatus === null || !(LIVE_RUN.has(now.reviewRunStatus) || now.reviewRunStatus === 'awaiting_review'))) this.own(researchId);
  }
  private async materialise(bytes: Buffer, job: string): Promise<void> {
    try { await materialise(bytes, job); }
    catch (error) {
      const code = message(error);
      // privateDirectory refuses a link or a non-folder on the way to the job folder (ARTIFACT_PATH).
      throw new Error(code === 'REVIEW_WORKSPACE_TOO_LARGE' ? 'REVIEW_WORKSPACE_TOO_LARGE' : code === 'ARTIFACT_PATH' ? 'PATH_OUTSIDE_PROJECT' : 'STALE_VERIFICATION', { cause: error });
    }
  }
  /** True when storage/review/<id>/project is contained (`containedFolder`): no link at or above it, its realpath the derived one. */
  private async contained(reviewRoot: string, researchId: string): Promise<boolean> {
    return containedFolder(reviewRoot, researchId, { project: true }).then(() => true, () => false);
  }
  /**
   * A retry may continue the kept workspace when its tree is one the journal allows: the completed fold, with either the
   * before or the after hash for a path an `unknown` write touched (a crash between its rename and its record). Begin then
   * reconciles each unknown write against the workspace (spec "Crash windows"; breaker F1).
   */
  private async keeps(project: string, base: Inventory, changes: ResearchReviewContext['changes']): Promise<boolean> {
    let accepted: ReturnType<typeof foldAccepted>;
    try { accepted = foldAccepted(base, changes); } catch { return false; }
    try { await removeJournalTemps(project); return acceptsTree(await treeInventory(project), accepted); } catch { return false; }
  }
  /** True when the workspace's tree, after the journal's temporary files are deleted, equals `expected` exactly. */
  private async verifies(project: string, expected: Inventory | null): Promise<boolean> {
    if (!expected) return false;
    try { await removeJournalTemps(project); return sameInventory(await treeInventory(project), expected); } catch { return false; }
  }

  // ---------------------------------------------------------------- the kit tools

  /**
   * `research_preflight` and `research_draft_brief` for a review run this process began. The run capability and the run
   * context (the job `reviewing`, naming this run, admission unchanged) are checked before and after the child.
   */
  async reviewTool(runId: string, name: 'research_preflight' | 'research_draft_brief', input: { force?: true }, epoch: string): Promise<ReviewToolResult> {
    const researchId = this.runs.get(runId); if (!researchId || this.closing) throw new Error('RUN_CANCELLED');
    const signal = this.deps.runSignal(runId, epoch);
    const kit = this.deps.kit; if (!kit) throw new Error('RESEARCH_KIT_UNAVAILABLE');
    const live = async () => {
      if (signal.aborted) throw new Error('RUN_CANCELLED');
      let ctx: ResearchReviewContext;
      try { ctx = await this.reviewContext(researchId); } catch { throw new Error('RUN_CANCELLED'); }
      if (ctx.status !== 'reviewing' || ctx.reviewRunId !== runId || ctx.reviewRunStatus !== 'running' || ctx.admission !== null || signal.aborted) throw new Error('RUN_CANCELLED');
    };
    await live();
    if (name === 'research_preflight' && input.force) throw new Error('REVIEW_TOOL_FAILED');
    let launch: ReviewLaunch;
    try { launch = await kit.prepareReview(signal); } catch (error) { throw new Error(signal.aborted ? 'RUN_CANCELLED' : message(error) === 'CANCELLED' ? 'RUN_CANCELLED' : 'RESEARCH_KIT_UNAVAILABLE', { cause: error }); }
    const folder = reviewFolder(launch.root, researchId);
    if (!(await this.contained(launch.root, researchId))) throw new Error('REVIEW_TOOL_FAILED');
    // In each child's guarded start too: a link swapped in after the check above.
    const check = async () => { await live(); if (!(await this.contained(launch.root, researchId))) throw new Error('REVIEW_TOOL_FAILED'); };
    const attempt = randomUUID(); const temp = join(folder.job, `temp-${attempt}`); const scratch = join(folder.job, `scratch-${attempt}`);
    try {
      let tree: Inventory;
      try { tree = await treeInventory(folder.project); } catch { throw new Error('REVIEW_TOOL_FAILED'); }
      await privateDirectory(temp);
      if (name === 'research_preflight') {
        const run = await this.runTool(launch, { tool: 'preflight' }, { cwd: folder.project, temp, locks: tree.map(entry => join(folder.project, ...entry.path.split('/'))), check, signal });
        await live();
        const verdict = classifyPreflight(run); if (!verdict) throw new Error('REVIEW_TOOL_FAILED');
        const findings = [];
        for (const finding of verdict.findings.slice(0, MAX_FINDINGS)) findings.push({ severity: finding.severity, check: await this.deps.redact(finding.check), rule: await this.deps.redact(finding.rule), detail: (await this.deps.redact(finding.detail)).slice(0, MAX_DETAIL) });
        return ReviewPreflightResultSchema.parse({ tool: 'research_preflight', pass: verdict.pass, counts: verdict.counts, evidencePolicy: await this.deps.redact(verdict.evidencePolicy), findings });
      }
      // The brief is drafted in a scratch copy: its write goes through the journal as an approved edit, never straight here.
      let copy: string;
      try { copy = await copyWorkspace(folder.project, tree, scratch); } catch { throw new Error('REVIEW_TOOL_FAILED'); }
      // Read locks cover what the kit reads, never what it writes: the helper's locks share only reading, so on Windows a
      // lock on research/BRIEF.md would deny brief.mjs's rename over it (lib/core.mjs writeBytes) and drafting would fail.
      const locks = tree.filter(entry => !BRIEF_WRITES.has(entry.path)).map(entry => join(copy, ...entry.path.split('/')));
      const run = await this.runTool(launch, { tool: 'brief', force: input.force === true }, { cwd: copy, temp, locks, check, signal });
      await live();
      if (launchCause(run) || run.cancelled) throw new Error('REVIEW_TOOL_FAILED');
      if (run.code === 1) throw new Error('BRIEF_NOT_DRAFTED');
      if (run.code !== 0) throw new Error('REVIEW_TOOL_FAILED');
      const content = await readBrief(join(copy, 'research', 'BRIEF.md'));
      // The drafted text becomes an exact approval: a redaction would change its bytes, so a secret in it refuses instead.
      if (await this.deps.redact(content) !== content) throw new Error('REVIEW_TOOL_FAILED');
      return { tool: 'research_draft_brief', content };
    } finally {
      await rm(scratch, { recursive: true, force: true }).catch(() => {});
      await rm(temp, { recursive: true, force: true }).catch(() => {});
    }
  }
  private async runTool(launch: ReviewLaunch, tool: ReviewTool, options: Parameters<ReviewLaunch['run']>[1]): Promise<OwnedResult> {
    try { return await launch.run(tool, options); }
    catch (error) {
      const code = message(error);
      if (code === 'RUN_CANCELLED' || options.signal.aborted) throw new Error('RUN_CANCELLED', { cause: error });
      throw new Error(code === 'INSTALLATION_INVALID' ? 'RESEARCH_KIT_UNAVAILABLE' : 'REVIEW_TOOL_FAILED', { cause: error });
    }
  }

  // ---------------------------------------------------------------- events, recovery, holds

  /** Run events from the engine: a review run that gave its final answer is frozen and packaged. */
  runEvent(event: RunEvent): void {
    const researchId = this.runs.get(event.runId); if (!researchId) return;
    if (event.type === 'run.status' && event.payload.status === 'awaiting_review') this.own(researchId);
    if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled' || event.type === 'run.interrupted') this.runs.delete(event.runId);
  }
  /** A research notice: a job that left packaging (cancel, Stop, a recorded outcome) stops its child and re-reads. */
  observe(research: Research): void {
    const job = this.jobs.get(research.id);
    if (job && research.status !== 'packaging' && research.status !== 'reviewing') this.stop(job, 'cancel');
    // A finished review job, to discard its folder; a cancelling one, to commit cancelled once no run is live (a run that
    // was interrupted has no end that would do it).
    if (!job && research.reviewRunId !== undefined && (research.status === 'approved' || research.status === 'cancelled' || research.status === 'cancelling') && !this.starting.has(research.id) && !this.heldIds.has(research.id)) this.own(research.id);
  }
  /**
   * The review part of `research.recover`'s reply: freeze and package what nobody owns, and discard the job folders
   * the engine named. A folder is removed only when the engine named it, so a live workspace is never deleted.
   */
  async recovered(recovery: z.infer<typeof ResearchRecoverySchema>): Promise<void> {
    for (const id of [...recovery.freeze, ...recovery.packaging]) if (!this.closing) this.own(id);
    const owned = new Set(this.ownedIds());
    const discard = recovery.reviewDiscard.filter(name => !owned.has(name));
    if (discard.length && this.deps.kit) await this.deps.kit.discardReview(discard).catch(() => {});
  }
  engineReady(): void { for (const waiter of this.readyWaiters) waiter(); this.readyWaiters.clear(); for (const job of this.jobs.values()) this.wakeJob(job); }
  /** Trust revocation or a policy change: stop the project's create child; each job re-reads its admission at release. */
  hold(projectId: string): () => void {
    this.holds.set(projectId, (this.holds.get(projectId) ?? 0) + 1);
    for (const job of this.jobs.values()) if (job.projectId === projectId) this.stop(job, 'hold');
    let released = false;
    return () => {
      if (released) return; released = true;
      const count = (this.holds.get(projectId) ?? 1) - 1;
      if (count > 0) this.holds.set(projectId, count); else this.holds.delete(projectId);
      for (const job of this.jobs.values()) if (job.projectId === projectId) this.wakeJob(job);
    };
  }
  /** Quit: no new work; every child is stopped (the job is recovered at the next start) and the drivers end. */
  async close(): Promise<void> {
    this.closing = true;
    for (const job of this.jobs.values()) this.stop(job, 'quit');
    await Promise.allSettled([...this.drivers.values(), ...this.starting.values()]);
  }

  // ---------------------------------------------------------------- ownership and engine access

  private own(id: string): void {
    if (this.jobs.has(id) || this.heldIds.has(id) || this.closing) return;
    const job: Job = { id, projectId: '', wake: new AbortController(), stale: 0 };
    this.jobs.set(id, job);
    const driver = this.drive(job).catch(() => {}).finally(() => { this.jobs.delete(id); this.drivers.delete(id); });
    this.drivers.set(id, driver);
  }
  private stop(job: Job, reason: StopReason) { if (job.child) { job.reason ??= reason; job.child.abort(); } this.wakeJob(job); }
  private wakeJob(job: Job) { job.wake.abort(); job.wake = new AbortController(); }
  private held(projectId: string) { return (this.holds.get(projectId) ?? 0) > 0; }

  /** Retries only an engine that is restarting; every other failure is the caller's. */
  private async engine<T>(call: () => Promise<T>, onRetry?: () => void): Promise<T> {
    let delay = this.retry;
    for (;;) {
      try { return await call(); }
      catch (error) {
        if (engineFailureCode(error) !== 'ENGINE_UNAVAILABLE' || this.closing) throw error;
        onRetry?.();
        const timer = new AbortController();
        await Promise.race([new Promise<void>(resolve => this.readyWaiters.add(resolve)), this.sleep(delay, timer.signal)]); timer.abort();
        delay = Math.min(delay * 2, 60_000);
      }
    }
  }
  private async reviewContext(researchId: string): Promise<ResearchReviewContext> {
    return ResearchReviewContextSchema.parse(await this.engine(() => this.deps.control({ method: 'research.review.context', researchId })));
  }
  private async job(researchId: string) {
    return ResearchContextSchema.parse(await this.engine(() => this.deps.control({ method: 'research.context', researchId }))).research;
  }

  /**
   * Records a step planned from the context just read. The request id is kept until the engine answers, so a reply lost
   * to an engine restart replays instead of applying twice. A stale or refused step is re-read by the caller.
   */
  private async commit(job: Job, transition: Transition): Promise<'done' | 'held'> {
    job.pending ??= ControlSchema.parse({ method: 'research.transition', requestId: randomUUID(), researchId: job.id, ...transition });
    try {
      ResearchTransitionReplySchema.parse(await this.engine(() => this.deps.control(job.pending!)));
      job.pending = undefined; job.stale = 0; return 'done';
    } catch (error) {
      job.pending = undefined;
      const code = engineFailureCode(error);
      // The job moved (a cancel, a Stop, a live run): re-read, a bounded number of times in a row.
      if (['STALE_REVISION', 'RESEARCH_TRANSITION_INVALID', 'RUN_ACTIVE'].includes(code) && ++job.stale < 5) return 'done';
      return 'held';
    }
  }

  // ---------------------------------------------------------------- the driver

  private async drive(job: Job): Promise<void> {
    try { job.projectId = (await this.job(job.id)).projectId; } catch { return; }
    for (;;) {
      if (this.closing) return;
      let ctx: ResearchReviewContext;
      try { ctx = await this.reviewContext(job.id); } catch { return; }
      let transition: Transition | null;
      if (ctx.status === 'reviewing') {
        // A live run is the engine's; a terminal one under a job still reviewing was interrupted (the run's own end would
        // have moved the job), and nothing else ends it while main owns the job: not_ready, as recovery would record.
        if (ctx.reviewRunStatus !== null && LIVE_RUN.has(ctx.reviewRunStatus)) return;
        if (ctx.reviewRunStatus !== 'awaiting_review') transition = { to: 'not_ready', expectedRevision: ctx.revision, cause: 'RECOVERED', failure: 'REVIEW_INTERRUPTED' };
        // The freeze's own children are admitted like packaging's: a changed admission ends the review, a hold waits.
        else if (ctx.admission !== null) transition = { to: 'not_ready', expectedRevision: ctx.revision, cause: 'ADMISSION_CHANGED', failure: ctx.admission };
        else if (this.held(job.projectId)) { await this.sleep(this.retry, job.wake.signal); continue; }
        else transition = await this.step(job, signal => this.freeze(job, ctx, signal));
      } else if (ctx.status === 'packaging') {
        if (ctx.admission !== null) transition = { to: 'not_ready', expectedRevision: ctx.revision, cause: 'ADMISSION_CHANGED', failure: ctx.admission };
        else if (this.held(job.projectId)) { await this.sleep(this.retry, job.wake.signal); continue; }
        else transition = await this.step(job, signal => this.package(job, ctx, signal));
      } else if (ctx.status === 'cancelling') {
        // A live review run is the engine's to finish first; it then commits the cancel itself.
        if (ctx.reviewRunStatus !== null && LIVE_RUN.has(ctx.reviewRunStatus)) return;
        transition = { to: 'cancelled', expectedRevision: ctx.revision, cause: 'REVIEW_CANCELLED' };
      } else {
        if ((ctx.status === 'approved' || ctx.status === 'cancelled') && this.deps.kit) await this.deps.kit.discardReview([job.id]).catch(() => {});
        return;
      }
      // Nothing to record (a stopped child, a job that moved): pause until woken, then re-read.
      if (!transition) { await this.sleep(this.retry, job.wake.signal); continue; }
      if (await this.commit(job, transition) === 'held') { this.heldIds.add(job.id); return; }
    }
  }

  /** The verified collected package's base inventory and the source values Q8 carries; or the failure to record. */
  private async collected(job: Job, ctx: ResearchReviewContext, signal: AbortSignal): Promise<{ base: Inventory; identity: ReviewIdentity } | Verdict> {
    const kit = this.deps.kit; if (!kit) return { failure: 'RESEARCH_KIT_UNAVAILABLE', cause: 'NO_INSTALLATION' };
    const verification = ctx.verification; if (!verification) return { failure: 'REVIEW_PACKAGING_FAILED', cause: 'NO_VERIFICATION' };
    let bytes: Buffer;
    try { ({ bytes } = await kit.verifyRetained(verification.artifactSha256, reviewBinding(job.projectId, job.id, verification, verification.jobRevision), signal, this.admit(job, ctx, signal))); }
    catch (error) {
      const code = message(error);
      if (code === 'CANCELLED' || signal.aborted) return null;
      return code === 'INSTALLATION_INVALID' ? { failure: 'RESEARCH_KIT_UNAVAILABLE', cause: 'INSTALLATION_INVALID' } : { failure: 'REVIEW_PACKAGING_FAILED', cause: 'STALE_VERIFICATION' };
    }
    try {
      const view = await readPackage(bytes);
      return { base: view.base, identity: { clientRef: verification.clientRef, repository: verification.repository, ref: verification.ref, commit: verification.commit, workflow: verification.workflow,
        workflowRunId: Number(verification.workflowRunId), runAttempt: verification.runAttempt, ...view.source } };
    } catch { return { failure: 'REVIEW_PACKAGING_FAILED', cause: 'STALE_VERIFICATION' }; }
  }

  /**
   * Step 1, the freeze: the workspace must equal fold(base, review changes) exactly, and the brief must not be stale
   * (Decisions, Q10 b). Then `reviewing -> packaging {reviewDigest}`.
   */
  private async freeze(job: Job, ctx: ResearchReviewContext, signal: AbortSignal): Promise<Transition | null> {
    const fail = (verdict: NonNullable<Verdict>): Transition => ({ to: 'not_ready', expectedRevision: ctx.revision, ...verdict });
    const source = await this.collected(job, ctx, signal); if (source === null) return null;
    if ('failure' in source) return fail(source);
    const launch = await this.launch(); if ('failure' in launch) return fail(launch);
    const folder = reviewFolder(launch.root, job.id);
    if (!(await this.contained(launch.root, job.id))) return fail(NOT_CONTAINED);
    const expected = foldOrNull(source.base, ctx.changes);
    const frozen = expected && await this.verifies(folder.project, expected) ? expected : null;
    if (!frozen) return fail({ failure: 'REVIEW_WORKSPACE_CHANGED', cause: 'INVENTORY_MISMATCH' });
    // The kit's own verdict on the frozen tree, read only for `hygiene/brief-stale`: the gate itself is applied by create.
    let verdict: PreflightOutput | null = null; let cause = 'HELPER_FAILED';
    for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
      const temp = join(folder.job, `temp-${randomUUID()}`);
      const admit = this.admit(job, ctx, signal);
      try {
        await privateDirectory(temp);
        const run = await launch.run({ tool: 'preflight' }, { cwd: folder.project, temp, locks: frozen.map(entry => join(folder.project, ...entry.path.split('/'))), check: async () => {
          await containedFolder(launch.root, job.id, { project: true });
          if (!sameInventory(await treeInventory(folder.project), frozen)) throw new Error('REVIEW_WORKSPACE_CHANGED');
          await admit();
        }, signal });
        if (signal.aborted || run.cancelled) return null;
        verdict = classifyPreflight(run); cause = launchCause(run) ?? 'KIT_PREFLIGHT_OUTPUT';
      } catch (error) {
        if (signal.aborted) return null;
        const code = message(error);
        if (code === 'CANCELLED') return null;
        if (code === 'PATH_OUTSIDE_PROJECT') return fail(NOT_CONTAINED);
        if (code === 'REVIEW_WORKSPACE_CHANGED') return fail({ failure: 'REVIEW_WORKSPACE_CHANGED', cause: 'INVENTORY_MISMATCH' });
        if (code === 'INSTALLATION_INVALID') return fail({ failure: 'RESEARCH_KIT_UNAVAILABLE', cause: 'INSTALLATION_INVALID' });
        cause = 'HELPER_FAILED';
      } finally { await rm(temp, { recursive: true, force: true }).catch(() => {}); }
    }
    if (!verdict) return fail({ failure: 'REVIEW_PACKAGING_FAILED', cause });
    if (verdict.findings.some(finding => finding.check === 'hygiene' && finding.rule === 'brief-stale')) return fail({ failure: 'REVIEW_INCOMPLETE', cause: 'BRIEF_STALE' });
    if (!(await this.verifies(folder.project, frozen))) return fail({ failure: 'REVIEW_WORKSPACE_CHANGED', cause: 'INVENTORY_MISMATCH' });
    return { to: 'packaging', expectedRevision: ctx.revision, cause: 'WORKSPACE_FROZEN', reviewDigest: reviewDigest(frozen) };
  }
  /**
   * One step (the freeze, or packaging) under one abort signal shared by all its kit children: a notice that the job left
   * the step's state, a hold and quit abort it (`stop`).
   */
  private async step(job: Job, run: (signal: AbortSignal) => Promise<Transition | null>): Promise<Transition | null> {
    const child = new AbortController(); job.child = child; job.reason = undefined;
    try { return await run(child.signal); } finally { if (job.child === child) job.child = undefined; }
  }
  /**
   * The check inside every freeze and packaging child's guarded start, after the read locks are held and before the child
   * exists: the job must still be in the state the step was planned from (status, revision, the run, a null admission),
   * with no hold on its project, the step not stopped and main not quitting. Otherwise `CANCELLED`, and the driver re-reads.
   */
  private admit(job: Job, ctx: ResearchReviewContext, signal: AbortSignal): () => Promise<void> {
    const stopped = () => signal.aborted || this.closing || this.held(job.projectId);
    return async () => {
      if (stopped()) throw new Error('CANCELLED');
      let now: ResearchReviewContext;
      try { now = await this.reviewContext(job.id); } catch { throw new Error('CANCELLED'); }
      if (now.status !== ctx.status || now.revision !== ctx.revision || now.admission !== null || now.reviewRunId !== ctx.reviewRunId
        || (ctx.status === 'reviewing' && now.reviewRunStatus !== 'awaiting_review') || stopped()) throw new Error('CANCELLED');
    };
  }
  private async launch(signal?: AbortSignal): Promise<ReviewLaunch | NonNullable<Verdict>> {
    const kit = this.deps.kit; if (!kit) return { failure: 'RESEARCH_KIT_UNAVAILABLE', cause: 'NO_INSTALLATION' };
    try { return await kit.prepareReview(signal); } catch { return { failure: 'RESEARCH_KIT_UNAVAILABLE', cause: 'INSTALLATION_INVALID' }; }
  }

  /**
   * Steps 2 to 6: `create` over the frozen workspace, the exit, validation of the produced bytes with the job's binding,
   * inventory equality, and the outcome. A child stopped by this supervisor records nothing; the driver re-reads.
   */
  private async package(job: Job, ctx: ResearchReviewContext, signal: AbortSignal): Promise<Transition | null> {
    const fail = (verdict: NonNullable<Verdict>): Transition => ({ to: 'not_ready', expectedRevision: ctx.revision, ...verdict });
    const source = await this.collected(job, ctx, signal); if (source === null) return null;
    if ('failure' in source) return fail(source);
    const launch = await this.launch(); if ('failure' in launch) return fail(launch);
    const folder = reviewFolder(launch.root, job.id);
    if (!(await this.contained(launch.root, job.id))) return fail(NOT_CONTAINED);
    // A restart between the freeze and create: the workspace must still be the one whose digest was frozen.
    let frozen: Inventory;
    try { await removeJournalTemps(folder.project); frozen = await treeInventory(folder.project); } catch { return fail({ failure: 'REVIEW_WORKSPACE_CHANGED', cause: 'INVENTORY_MISMATCH' }); }
    if (reviewDigest(frozen) !== ctx.reviewDigest) return fail({ failure: 'REVIEW_WORKSPACE_CHANGED', cause: 'INVENTORY_MISMATCH' });
    const kit = this.deps.kit!;
    const binding = reviewBinding(job.projectId, job.id, ctx.verification!, ctx.revision);
    let cause = 'HELPER_FAILED';
    const admit = this.admit(job, ctx, signal);
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = randomUUID(); const out = join(folder.job, `out-${id}`); const temp = join(folder.job, `temp-${id}`); const output = join(out, 'reviewed.zip');
      try {
        await privateDirectory(out); await privateDirectory(temp);
        let run: OwnedResult;
        try {
          run = await launch.run({ tool: 'create', root: folder.project, output, identity: source.identity }, {
            cwd: temp, temp, locks: frozen.map(entry => join(folder.project, ...entry.path.split('/'))), signal,
            // Under the read locks, before the child exists: every frozen file rehashed, the folders listed, the job re-read.
            check: async () => {
              await containedFolder(launch.root, job.id, { project: true });
              let now: Inventory;
              try { now = await treeInventory(folder.project); } catch { throw new Error('REVIEW_WORKSPACE_CHANGED'); }
              if (!sameInventory(now, frozen)) throw new Error('REVIEW_WORKSPACE_CHANGED');
              await admit();
            },
          });
        } catch (error) {
          if (signal.aborted) return null;
          const code = message(error);
          if (code === 'REVIEW_WORKSPACE_CHANGED') return fail({ failure: 'REVIEW_WORKSPACE_CHANGED', cause: 'INVENTORY_MISMATCH' });
          if (code === 'CANCELLED') return null;
          if (code === 'PATH_OUTSIDE_PROJECT') return fail(NOT_CONTAINED);
          if (code === 'INSTALLATION_INVALID') return fail({ failure: 'RESEARCH_KIT_UNAVAILABLE', cause: 'INSTALLATION_INVALID' });
          cause = 'HELPER_FAILED'; continue;
        }
        if (signal.aborted || run.cancelled) return null;
        const launchFailure = launchCause(run);
        if (launchFailure) { cause = launchFailure; continue; }
        // create can exit non-zero after writing its output: the output is deleted on every non-zero exit (finally).
        if (run.code !== 0) {
          const exitCause = run.code !== null && run.code >= 0 && run.code <= 255 ? `KIT_CREATE_EXIT_${run.code}` : 'KIT_CREATE_EXIT_OTHER';
          return fail({ failure: run.code === 3 ? 'REVIEW_PACKAGE_BLOCKED' : 'REVIEW_PACKAGE_INVALID', cause: exitCause });
        }
        return await this.outcome(ctx, kit, output, binding, frozen, signal, admit);
      } finally {
        await rm(out, { recursive: true, force: true }).catch(() => {});
        await rm(temp, { recursive: true, force: true }).catch(() => {});
      }
    }
    return fail({ failure: 'REVIEW_PACKAGING_FAILED', cause });
  }
  /** Steps 4 to 6 over the bytes `create` wrote. Exit 0 is never readiness: only validation of those bytes counts. */
  private async outcome(ctx: ResearchReviewContext, kit: ReviewKit, output: string, binding: Binding, frozen: Inventory, signal: AbortSignal, admit: () => Promise<void>): Promise<Transition | null> {
    const fail = (verdict: NonNullable<Verdict>): Transition => ({ to: 'not_ready', expectedRevision: ctx.revision, ...verdict });
    const result = await kit.validate(output, binding, signal, admit);
    if (signal.aborted || result.error === 'CANCELLED') return null;
    if (result.status !== 'PASS' || !result.receipt) return fail(validationFailure(result));
    const reviewedPackage: ReviewedPackage = { sha256: result.receipt.artifactSha256, validatorRevision: result.receipt.validatorRevision, boundRevision: ctx.revision };
    let produced: Inventory;
    try { produced = (await readPackage(await kit.readVerified(result.receipt.id, binding))).base; }
    catch { return fail({ failure: 'REVIEW_PACKAGE_INVALID', cause: 'STALE_VERIFICATION', reviewedPackage }); }
    // A file added or changed while create ran: read locks on the existing files cannot prevent it, equality catches it.
    if (!sameInventory(produced, frozen)) return fail({ failure: 'REVIEW_PACKAGE_MISMATCH', cause: 'INVENTORY_MISMATCH', reviewedPackage });
    if (result.researchReady && result.state === 'APPROVED_BRIEF') return { to: 'approved', expectedRevision: ctx.revision, cause: 'KIT_APPROVED', reviewedPackage };
    return fail({ failure: notReadyFailure(result.state), cause: 'KIT_NOT_APPROVED', reviewedPackage });
  }
}

function foldOrNull(base: Inventory, changes: ResearchReviewContext['changes']): Inventory | null {
  try { return foldExpected(base, changes); } catch { return null; }
}
/** The drafted brief from the scratch copy: at most 1 MiB, a regular file, strict UTF-8, no NUL. */
async function readBrief(file: string): Promise<string> {
  const handle = await open(file, 'r').catch(() => { throw new Error('REVIEW_TOOL_FAILED'); });
  try {
    const info = await handle.stat(); if (!info.isFile() || info.size > MAX_BRIEF) throw new Error('REVIEW_TOOL_FAILED');
    const bytes = await handle.readFile();
    if (bytes.length > MAX_BRIEF) throw new Error('REVIEW_TOOL_FAILED');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('REVIEW_TOOL_FAILED'); }
    if (text.includes('\0')) throw new Error('REVIEW_TOOL_FAILED');
    return text;
  } finally { await handle.close(); }
}
