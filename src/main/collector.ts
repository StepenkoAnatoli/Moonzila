import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ControlSchema, engineFailureCode, type Control } from '../engine/control';
import { ResearchContextSchema, ResearchRecoverySchema, ResearchTransitionReplySchema, WorkflowRunIdSchema, type ResearchContext } from '../engine/research';
import { IdSchema, type Research } from '../shared';
import { classifyDispatch, classifyWatch, collectorEnvironment, commandLineFits, COLLECTOR_LIMITS, dispatchArgs, packageFileName, watchArgs, watchBounds, type CollectorAttempt, type CollectorTarget, type LaunchRefusal, type PackageCheck } from '../adapters/research-kit/collector';
import type { CollectorLaunch } from '../adapters/research-kit/adapter';
import { atomicJson, boundedJson } from '../models/artifact-files';
import type { OwnedResult } from '../tools/commands';
import { FINISHED, planStep, type Outcome } from './collector-plan';
import type { CollectorConfig } from './collector-settings';
import type { Vault } from './vault';

export interface CollectorKit { prepareCollector(signal?: AbortSignal): Promise<CollectorLaunch> }
/**
 * What the verified import receives. The run id, revisions and target are the engine's, never the kit's; the file is
 * recomputed by main. `projectRevision` is the policy revision the job was admitted under.
 */
export interface PackageHandoff {
  researchId: string; projectId: string; expectedRevision: number; projectRevision: number; clientRef: string; target: CollectorTarget; workflowRunId: string;
  file: string; kit: { status: 'PASS'; state: 'REVIEW_REQUIRED' | 'REVIEW_IN_PROGRESS' | 'PREFLIGHT_BLOCKED' }; signal: AbortSignal;
}
/** `deferred`: nothing is known about the package (no kit, no token, GitHub or the validator unavailable, stopped). */
export type ImportOutcome = Extract<Outcome, { kind: 'verified' | 'rejected' }> | { kind: 'deferred' };
export interface CollectorDeps {
  control(control: Control): Promise<unknown>; epoch(): string;
  vault: Pick<Vault, 'grant' | 'withSecret' | 'revokeContext' | 'has'>;
  settings: { current(): CollectorConfig | null };
  kit: CollectorKit | null; spoolDirectory: string;
  importPackage?(handoff: PackageHandoff): Promise<ImportOutcome>;
  limits?: Partial<CollectorLimits>; now?(): number; sleep?(ms: number, signal: AbortSignal): Promise<void>;
  /** Pause before re-checking a refused or held launch (default 1 s). */
  retryDelayMs?: number;
}

type Park = 'kit' | 'credentials' | 'import';
type StopReason = 'cancel' | 'hold' | 'credentials' | 'quit';
interface Attempt { kind: 'dispatch' | 'watch'; stop: AbortController; started: boolean; reason?: StopReason }
interface Job {
  id: string; projectId: string; clientRef: string;
  /** Set only when this process received 'applied' for queued -> dispatching: nothing else may launch a dispatcher. */
  mayDispatch: boolean;
  /** Sticky: once a dispatcher ran, no dispatcher is ever launched again for this job. */
  started: boolean;
  learnedRunId?: string; ambiguous?: string;
  attempt?: Attempt; pending?: Control; park?: Park; wake: AbortController; held: boolean;
}

const SpoolSchema = z.object({ version: z.literal(1), researchId: IdSchema, clientRef: z.string().max(64), workflowRunId: WorkflowRunIdSchema }).strict();
const REFUSALS: Record<string, LaunchRefusal> = {
  INSTALLATION_INVALID: 'INSTALLATION_INVALID', ADMISSION_REFUSED: 'ADMISSION_REFUSED', COLLECTOR_CHANGED: 'COLLECTOR_CHANGED',
  CREDENTIAL_CAPABILITY_DENIED: 'CREDENTIAL_DENIED', CREDENTIAL_DENIED: 'CREDENTIAL_DENIED', ENCRYPTION_UNAVAILABLE: 'CREDENTIAL_DENIED', COLLECTOR_TOKEN_INVALID: 'CREDENTIAL_DENIED',
  HELD: 'HELD', RUN_CANCELLED: 'STOPPED', CANCELLED: 'STOPPED', ENGINE_UNAVAILABLE: 'ENGINE_UNAVAILABLE',
};
const refusalOf = (error: unknown): LaunchRefusal => REFUSALS[error instanceof Error ? error.message : ''] ?? 'LAUNCH_FAILED';
const NOT_STARTED_FAILURE: Partial<Record<LaunchRefusal, string>> = { INSTALLATION_INVALID: 'RESEARCH_KIT_UNAVAILABLE', COLLECTOR_CHANGED: 'COLLECTOR_CHANGED' };
/** The defaults are literal constants; a caller (tests, later tuning) may set any number. */
type CollectorLimits = { [K in keyof typeof COLLECTOR_LIMITS]: number };
const waits = (refusal: LaunchRefusal) => refusal === 'HELD' || refusal === 'ENGINE_UNAVAILABLE' || refusal === 'STOPPED';

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', done); resolve(); }, ms);
    const done = () => { clearTimeout(timer); resolve(); };
    signal.addEventListener('abort', done, { once: true });
  });
}
async function packageCheck(out: string, clientRef: string): Promise<PackageCheck> {
  const names = await readdir(out);
  if (!names.length) return 'absent';
  if (names.length !== 1 || names[0] !== packageFileName(clientRef)) return 'unexpected';
  const info = await lstat(join(out, names[0]!));
  return info.isFile() && !info.isSymbolicLink() && info.nlink === 1 ? 'present' : 'unexpected';
}

/**
 * Owns every collector child. The engine owns the job state; this class turns collector facts into transitions
 * through planStep, always from freshly read context. It never dispatches twice: a dispatcher is launched only after
 * an 'applied' reply in this process, only once it is known not to have run, and recovery fails every unowned
 * 'dispatching' job instead of re-queuing it. The token reaches only the child's environment, through a vault grant
 * scoped to one launch.
 */
export class CollectorSupervisor {
  private readonly jobs = new Map<string, Job>();
  private readonly drivers = new Map<string, Promise<void>>();
  /** Jobs whose driver stopped on a commit error: still owned, so no recovery acts on them, until the next app start. */
  private readonly heldIds = new Set<string>();
  private readonly holds = new Map<string, number>();
  private readonly limits: CollectorLimits;
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly retry: number;
  private gate: Promise<void> = Promise.resolve();
  private readyWaiters = new Set<() => void>();
  private attachedDone = false; private closing = false;
  private resolveAttached!: () => void;
  readonly attached = new Promise<void>(resolve => { this.resolveAttached = resolve; });

  constructor(private readonly deps: CollectorDeps) {
    this.limits = { ...COLLECTOR_LIMITS, ...deps.limits };
    this.now = deps.now ?? Date.now; this.sleep = deps.sleep ?? defaultSleep; this.retry = deps.retryDelayMs ?? 1000;
  }

  ownedIds(): string[] { return [...this.jobs.keys(), ...this.heldIds]; }
  busy(): boolean { return this.jobs.size > 0 || this.heldIds.size > 0; }

  /** At app start, once: replay learned run ids, recover what nobody owns, then adopt what can continue. */
  async attach(): Promise<void> {
    try {
      await mkdir(this.deps.spoolDirectory, { recursive: true });
      for (const name of await readdir(this.deps.spoolDirectory)) await this.replay(join(this.deps.spoolDirectory, name));
      // Empty unless a replayed run id could not be committed: that job waits, spool and all, for the next start.
      const recovery = ResearchRecoverySchema.parse(await this.engine(() => this.deps.control({ method: 'research.recover', owned: this.ownedIds() })));
      await this.adopt(recovery);
    } finally { this.attachedDone = true; this.resolveAttached(); }
  }

  /** A research notice or reply. Idempotent; nothing is admitted before attach has recovered. */
  observe(research: Research): void {
    void this.attached.then(() => {
      const job = this.jobs.get(research.id);
      if (research.status === 'queued' && !job && !this.heldIds.has(research.id) && !this.closing) this.own(research.id, research.projectId, research.clientRef);
      if (research.status === 'cancelling' && job) this.stop(job, 'cancel');
    });
  }

  /** After an engine-only restart. Recover skips everything this process owns, then owned jobs resend and re-read. */
  engineReady(_epoch: string): void {
    for (const waiter of this.readyWaiters) waiter(); this.readyWaiters.clear();
    if (!this.attachedDone || this.closing) return;
    let open!: () => void; const gate = new Promise<void>(resolve => { open = resolve; }); this.gate = gate;
    void (async () => {
      try {
        // Computed and posted in the same tick, so a job this process admits is always in the owned list.
        const recovery = ResearchRecoverySchema.parse(await this.deps.control({ method: 'research.recover', owned: this.ownedIds() }));
        await this.adopt(recovery);
      } catch { /* The next ready event or app start recovers. */ } finally { open(); for (const job of this.jobs.values()) this.wakeJob(job); }
    })();
  }

  /** Trust revocation or a policy change: stop what can be stopped, launch nothing, and let each job re-check on release. */
  hold(projectId: string): () => void {
    this.holds.set(projectId, (this.holds.get(projectId) ?? 0) + 1);
    for (const job of this.jobs.values()) if (job.projectId === projectId) { this.stopAttempt(job, 'hold'); this.wakeJob(job); }
    let released = false;
    return () => {
      if (released) return; released = true;
      const count = (this.holds.get(projectId) ?? 1) - 1;
      if (count > 0) this.holds.set(projectId, count); else this.holds.delete(projectId);
      for (const job of this.jobs.values()) if (job.projectId === projectId) this.wakeJob(job);
    };
  }
  /** The token was replaced or cleared: watches stop and re-grant (or park); a started dispatcher keeps its copy. */
  credentialsChanged(): void { for (const job of this.jobs.values()) if (job.attempt?.kind === 'watch') this.stopAttempt(job, 'credentials'); }
  /** A collector save re-arms jobs waiting for credentials. */
  configChanged(): void { for (const job of this.jobs.values()) if (job.park === 'credentials') { job.park = undefined; this.wakeJob(job); } }

  /** Quit: no new launches; a started dispatcher may finish (and record its run id) within the drain, then everything stops. */
  async close(drainMs: number = this.limits.quitDrainMs): Promise<void> {
    this.closing = true;
    for (const job of this.jobs.values()) { this.stopAttempt(job, 'quit'); this.wakeJob(job); }
    const all = () => Promise.allSettled([...this.drivers.values()]);
    const timeout = new AbortController();
    await Promise.race([all(), this.sleep(drainMs, timeout.signal)]); timeout.abort();
    for (const job of this.jobs.values()) if (job.attempt) { job.attempt.reason ??= 'quit'; job.attempt.stop.abort(); }
    const grace = new AbortController();
    await Promise.race([all(), this.sleep(this.retry, grace.signal)]); grace.abort();
  }

  // ---------------------------------------------------------------- ownership

  private own(id: string, projectId: string, clientRef: string, seed: Partial<Job> = {}): Job {
    const existing = this.jobs.get(id); if (existing) return existing;
    const job: Job = { id, projectId, clientRef, mayDispatch: false, started: false, wake: new AbortController(), held: false, ...seed };
    this.jobs.set(id, job);
    const driver = this.drive(job).catch(() => {}).finally(() => { if (job.held) this.heldIds.add(id); this.jobs.delete(id); this.drivers.delete(id); });
    this.drivers.set(id, driver);
    return job;
  }
  private async adopt(recovery: z.infer<typeof ResearchRecoverySchema>) {
    for (const entry of [...recovery.dispatchable, ...recovery.resume]) {
      if (this.jobs.has(entry.researchId) || this.heldIds.has(entry.researchId) || this.closing) continue;
      const ctx = await this.read(entry.researchId); if (!ctx) continue;
      this.own(ctx.research.id, ctx.research.projectId, ctx.research.clientRef);
    }
  }
  private stop(job: Job, reason: StopReason) { this.stopAttempt(job, reason); this.wakeJob(job); }
  /** A watcher always stops; a dispatcher stops only before it started, because a started one may already have dispatched. */
  private stopAttempt(job: Job, reason: StopReason) {
    const attempt = job.attempt; if (!attempt) return;
    if (attempt.kind === 'watch' || !attempt.started) { attempt.reason ??= reason; attempt.stop.abort(); }
  }
  private wakeJob(job: Job) { job.wake.abort(); job.wake = new AbortController(); }
  private async pause(job: Job, ms: number) { await this.sleep(ms, job.wake.signal); }
  private held(projectId: string) { return (this.holds.get(projectId) ?? 0) > 0; }
  private async tokenSaved() { const ref = this.deps.settings.current()?.secretRef; return !!ref && await this.deps.vault.has(ref); }

  // ---------------------------------------------------------------- engine access

  /** Retries only an engine that is restarting; every other failure is the caller's. */
  private async engine<T>(call: () => Promise<T>): Promise<T> {
    let delay = 1000;
    for (;;) {
      try { return await call(); }
      catch (error) {
        if (engineFailureCode(error) !== 'ENGINE_UNAVAILABLE' || this.closing) throw error;
        const timer = new AbortController();
        await Promise.race([new Promise<void>(resolve => this.readyWaiters.add(resolve)), this.sleep(delay, timer.signal)]); timer.abort();
        delay = Math.min(delay * 2, 60_000);
      }
    }
  }
  private async read(researchId: string): Promise<ResearchContext | null> {
    try { return ResearchContextSchema.parse(await this.engine(() => this.deps.control({ method: 'research.context', researchId }))); }
    catch (error) {
      if (['NOT_FOUND', 'RESEARCH_STATE_INVALID'].includes(engineFailureCode(error)) || error instanceof z.ZodError) return null;
      throw error;
    }
  }

  /**
   * Records an outcome. The command is planned from fresh context and keeps one random request id until it is
   * acknowledged, so a reply lost to an engine restart replays instead of applying twice. A stale plan is re-planned.
   * Returns false when the job must be left alone until the next app start.
   */
  private async commit(job: Job, outcome: Outcome): Promise<boolean> {
    for (let replans = 0; replans < 5;) {
      if (!job.pending) {
        const ctx = await this.read(job.id); if (!ctx) return true;
        const plan = planStep(ctx, outcome, job.learnedRunId);
        if (plan.kind !== 'transition') { if (plan.kind === 'release') await this.dropSpool(job); return true; }
        job.pending = ControlSchema.parse({ method: 'research.transition', requestId: randomUUID(), researchId: job.id, ...plan.transition });
      }
      await this.gate;
      try {
        const reply = ResearchTransitionReplySchema.parse(await this.engine(() => this.deps.control(job.pending!)));
        const sent = job.pending as Extract<Control, { method: 'research.transition' }>; job.pending = undefined;
        if (sent.to === 'dispatching' && reply.outcome === 'applied') job.mayDispatch = true;
        if (sent.workflowRunId !== undefined || FINISHED.has(reply.research.status)) await this.dropSpool(job);
        return true;
      } catch (error) {
        const code = engineFailureCode(error);
        if (code === 'STALE_REVISION' || code === 'RESEARCH_TRANSITION_INVALID') { job.pending = undefined; replans++; continue; }
        job.pending = undefined; job.held = true; return false;
      }
    }
    job.held = true; return false;
  }

  // ---------------------------------------------------------------- the run-id spool

  private spoolFile(id: string) { return join(this.deps.spoolDirectory, `${id}.json`); }
  /** A learned run id is a fact, written before it is committed, so a crash in between cannot lose a paid run. */
  private async writeSpool(job: Job, workflowRunId: string) {
    await atomicJson(this.spoolFile(job.id), SpoolSchema.parse({ version: 1, researchId: job.id, clientRef: job.clientRef, workflowRunId }));
  }
  private async dropSpool(job: Job) { await unlink(this.spoolFile(job.id)).catch(() => {}); }
  private async replay(file: string) {
    let spool: z.infer<typeof SpoolSchema>;
    try { spool = SpoolSchema.parse(await boundedJson(file, 4096)); } catch { await unlink(file).catch(() => {}); return; }
    const ctx = await this.read(spool.researchId);
    if (!ctx || FINISHED.has(ctx.research.status) || ctx.research.workflowRunId === spool.workflowRunId) { await unlink(file).catch(() => {}); return; }
    // Re-planned against the current state: a cancel that won the race still records the run on its own edge.
    const job: Job = { id: spool.researchId, projectId: ctx.research.projectId, clientRef: spool.clientRef, mayDispatch: false, started: true, learnedRunId: spool.workflowRunId, wake: new AbortController(), held: false };
    if (!(await this.commit(job, ctx.research.status === 'dispatching' ? { kind: 'dispatched', workflowRunId: spool.workflowRunId } : { kind: 'continue' }))) this.heldIds.add(job.id);
  }

  // ---------------------------------------------------------------- the driver

  private async drive(job: Job): Promise<void> {
    // notStarted counts the dispatch's refusals; refused counts watches refused in a row, so one that ran or a park restarts it.
    let notStarted = 0; let refused = 0; let transient = 0;
    for (;;) {
      if (job.held) return;
      const ctx = await this.read(job.id); if (!ctx) return;
      const status = ctx.research.status;
      if (FINISHED.has(status)) { await this.dropSpool(job); return; }
      if (status === 'cancelling') {
        if (job.attempt) { await this.pause(job, this.retry); continue; }
        if (!(await this.commit(job, job.ambiguous ? { kind: 'ambiguous', cause: job.ambiguous } : { kind: 'continue' }))) return;
        continue;
      }
      if (this.closing) return;
      if (status === 'queued') { if (!(await this.commit(job, await this.preflight(ctx)))) return; continue; }
      if (status === 'dispatching') {
        if (job.learnedRunId) { if (!(await this.commit(job, { kind: 'dispatched', workflowRunId: job.learnedRunId }))) return; continue; }
        if (!job.mayDispatch || job.started) { if (!(await this.commit(job, { kind: 'ambiguous', cause: job.ambiguous ?? 'NOT_OWNED_DISPATCH' }))) return; continue; }
        // Nothing ran yet, so a withdrawn admission ends the job here rather than as a refused launch.
        if (ctx.admission !== null) { if (!(await this.commit(job, { kind: 'notDispatched', failure: ctx.admission, cause: 'ADMISSION_CHANGED' }))) return; continue; }
        const { attempt } = await this.launch(job, ctx, 'dispatch');
        const outcome = classifyDispatch(attempt);
        if (outcome.kind === 'notLaunched') {
          if (waits(outcome.refusal)) { await this.pause(job, this.retry); continue; }
          if (++notStarted < this.limits.preStartAttempts) { await this.pause(job, this.retry); continue; }
          if (!(await this.commit(job, { kind: 'notDispatched', failure: NOT_STARTED_FAILURE[outcome.refusal] ?? 'DISPATCH_NOT_STARTED', cause: 'NOT_STARTED' }))) return;
          continue;
        }
        if (outcome.kind === 'dispatched') { await this.writeSpool(job, outcome.workflowRunId); job.learnedRunId = outcome.workflowRunId; }
        if (outcome.kind === 'ambiguous') job.ambiguous = outcome.cause;
        if (!(await this.commit(job, outcome))) return;
        continue;
      }
      // collecting
      if (ctx.admission !== null) { if (!(await this.commit(job, { kind: 'continue' }))) return; continue; }
      // The store always sets dispatchedAt on a collecting job. Should it not read, creation (which precedes dispatch)
      // bounds the watch no later than the real deadline, so the run is still watched and never past retention.
      const anchor = [ctx.research.dispatchedAt, ctx.research.createdAt].map(at => Date.parse(at ?? '')).find(Number.isFinite);
      const left = (anchor === undefined ? this.now() : anchor + this.limits.watchDeadlineMs) - this.now();
      if (left <= 0) { if (!(await this.commit(job, { kind: 'expired' }))) return; continue; }
      if (job.park) { await this.pause(job, left); continue; }
      if (this.held(job.projectId)) { await this.pause(job, this.retry * 60); continue; }
      const { attempt, launch } = await this.launch(job, ctx, 'watch', left);
      try {
        // Stopped by this supervisor (cancel, hold, new credentials, quit): re-read instead of classifying the kill.
        if (attempt.reason) continue;
        const pkg = launch ? await packageCheck(launch.out, ctx.research.clientRef).catch(() => 'unexpected' as const) : 'absent';
        // Never past retention here: the deadline (7 days from dispatch) ends no later than the artifact's 7 days from upload.
        const outcome = classifyWatch(attempt, { clientRef: ctx.research.clientRef, pastRetention: false }, pkg);
        if (outcome.kind !== 'notLaunched') refused = 0;
        switch (outcome.kind) {
          case 'notLaunched':
            if (outcome.refusal === 'INSTALLATION_INVALID') job.park = 'kit';
            // Only a reference that is gone waits for a save at once. A refusal with it still saved (a grant under an epoch
            // that just changed, encryption briefly unavailable) counts like any refusal, and parks the same way if it persists.
            else if (outcome.refusal === 'CREDENTIAL_DENIED' && !(await this.tokenSaved())) job.park = 'credentials';
            else if (waits(outcome.refusal) || ++refused < this.limits.preStartAttempts) await this.pause(job, this.retry);
            else job.park = outcome.refusal === 'CREDENTIAL_DENIED' ? 'credentials' : 'kit';
            if (job.park) refused = 0;
            break;
          case 'package': {
            const handoff: PackageHandoff = { researchId: job.id, projectId: job.projectId, expectedRevision: ctx.research.revision, projectRevision: ctx.research.policyRevision, clientRef: ctx.research.clientRef,
              target: { collectorRevision: ctx.research.collectorRevision!, repository: ctx.research.repository!, workflow: ctx.research.workflow!, ref: ctx.research.ref! },
              workflowRunId: ctx.research.workflowRunId!, file: join(launch!.out, packageFileName(ctx.research.clientRef)), kit: { status: 'PASS', state: outcome.state }, signal: job.wake.signal };
            const deferred: ImportOutcome = { kind: 'deferred' };
            const imported = this.deps.importPackage ? await this.deps.importPackage(handoff).catch(() => deferred) : deferred;
            // A deferral caused by this supervisor's own wake (cancel, hold, engine restart) re-reads instead of parking.
            if (imported.kind === 'deferred') { if (!handoff.signal.aborted) job.park = 'import'; break; }
            if (!(await this.commit(job, imported))) return;
            break;
          }
          case 'runFailed': if (!(await this.commit(job, outcome))) return; break;
          case 'stillRunning': transient = 0; await this.pause(job, this.limits.stillRunningDelayMs); break;
          case 'transient': await this.pause(job, Math.min(this.limits.backoffMaxMs, this.limits.backoffFirstMs * 2 ** transient++)); break;
          case 'park': job.park = outcome.reason; break;
        }
      } finally { await launch?.dispose().catch(() => {}); }
    }
  }

  /** queued: refuse before any launch what cannot work, otherwise admit with the collector target frozen on the job. */
  private async preflight(ctx: ResearchContext): Promise<Outcome> {
    const config = this.deps.settings.current();
    if (!config) return { kind: 'refuse', failure: 'COLLECTOR_NOT_CONFIGURED', cause: 'NO_COLLECTOR' };
    if (!config.secretRef || !(await this.deps.vault.has(config.secretRef))) return { kind: 'refuse', failure: 'COLLECTOR_TOKEN_MISSING', cause: 'NO_TOKEN' };
    if (!this.deps.kit) return { kind: 'refuse', failure: 'RESEARCH_KIT_UNAVAILABLE', cause: 'NO_INSTALLATION' };
    const target: CollectorTarget = { collectorRevision: config.revision, repository: config.repository, workflow: config.workflow, ref: config.ref };
    let launch: CollectorLaunch;
    try { launch = await this.deps.kit.prepareCollector(); } catch { return { kind: 'refuse', failure: 'RESEARCH_KIT_UNAVAILABLE', cause: 'INSTALLATION_INVALID' }; }
    try {
      if (!commandLineFits(launch.node, dispatchArgs(launch.script, { topic: ctx.research.topic, clientRef: ctx.research.clientRef, inputs: ctx.research.inputs }, target))) return { kind: 'refuse', failure: 'COLLECTOR_INPUT_TOO_LONG', cause: 'COMMAND_LINE' };
    } finally { await launch.dispose().catch(() => {}); }
    return { kind: 'admit', target };
  }

  /**
   * One launch attempt. The grant covers exactly this launch; the token is decrypted inside withSecret, put into the
   * child's environment block and revoked once the launch is handed over. admit() runs after the kit's read locks
   * are held and before the child exists: a refusal there means no child ran. The helper bounds that whole pre-start
   * step (locks, rehash, admit) by admissionMs; on expiry it ends without a child and the launch is not started.
   */
  private async launch(job: Job, ctx: ResearchContext, kind: 'dispatch' | 'watch', msLeft = 0): Promise<{ attempt: CollectorAttempt & { reason?: StopReason }; launch?: CollectorLaunch }> {
    const config = this.deps.settings.current(); const kit = this.deps.kit;
    if (!kit) return { attempt: { started: false, refusal: 'INSTALLATION_INVALID' } };
    if (!config?.secretRef) return { attempt: { started: false, refusal: 'CREDENTIAL_DENIED' } };
    if (this.held(job.projectId)) return { attempt: { started: false, refusal: 'HELD' } };
    const state: Attempt = { kind, stop: new AbortController(), started: false };
    let launch: CollectorLaunch;
    try { launch = await kit.prepareCollector(state.stop.signal); } catch (error) { return { attempt: { started: false, refusal: refusalOf(error) === 'STOPPED' ? 'STOPPED' : 'INSTALLATION_INVALID' } }; }
    const job_ = ctx.research;
    const target: CollectorTarget = { collectorRevision: job_.collectorRevision!, repository: job_.repository!, workflow: job_.workflow!, ref: job_.ref! };
    const bounds = kind === 'dispatch' ? { kitSeconds: 0, ownedTimeoutMs: this.limits.dispatchTimeoutMs } : watchBounds(msLeft);
    const args = kind === 'dispatch'
      ? dispatchArgs(launch.script, { topic: job_.topic, clientRef: job_.clientRef, inputs: job_.inputs }, target)
      : watchArgs(launch.script, { repository: target.repository, workflowRunId: job_.workflowRunId!, clientRef: job_.clientRef }, launch.out, bounds.kitSeconds);
    if (!commandLineFits(launch.node, args)) return { attempt: { started: false, refusal: 'LAUNCH_FAILED' }, launch };
    const binding = { epoch: this.deps.epoch(), purpose: 'research' as const, contextId: `collector:${job.id}:${randomUUID()}`, secretRef: config.secretRef };
    let running: { done: Promise<OwnedResult> };
    job.attempt = state;
    try {
      const grant = this.deps.vault.grant({ ...binding, expiresAt: this.now() + this.limits.grantMs });
      running = await this.deps.vault.withSecret(grant, binding, token => ({
        done: launch.start(args, collectorEnvironment(launch.temp, token), {
          timeoutMs: bounds.ownedTimeoutMs, admissionTimeoutMs: this.limits.admissionMs, maxOutputBytes: kind === 'dispatch' ? this.limits.dispatchOutputBytes : this.limits.watchOutputBytes, signal: state.stop.signal,
          admit: () => this.admit(job, state, ctx, kind, config),
          onStarted: () => { state.started = true; if (kind === 'dispatch') job.started = true; },
        }),
      }));
    } catch (error) { job.attempt = undefined; return { attempt: { started: false, refusal: refusalOf(error) }, launch }; }
    finally { this.deps.vault.revokeContext(binding.contextId); }
    // Awaited first: `started` and `reason` are only final once the child has exited.
    try { const result = await running.done; return { attempt: { started: state.started, result, reason: state.reason }, launch }; }
    catch (error) { return { attempt: { started: state.started, refusal: refusalOf(error), reason: state.reason }, launch }; }
    finally { job.attempt = undefined; }
  }

  /** The last check before the child exists, bounded so stalled admission never holds the kit's locks. */
  private async admit(job: Job, state: Attempt, admitted: ResearchContext, kind: 'dispatch' | 'watch', config: CollectorConfig): Promise<void> {
    const check = async () => {
      if (state.stop.signal.aborted || this.closing || this.held(job.projectId)) throw new Error('HELD');
      const ctx = ResearchContextSchema.parse(await this.deps.control({ method: 'research.context', researchId: job.id }));
      const now = ctx.research; const then = admitted.research;
      if (now.status !== then.status || now.revision !== then.revision || ctx.admission !== null) throw new Error('ADMISSION_REFUSED');
      if (kind === 'dispatch' && (now.workflowRunId !== undefined || now.repository !== config.repository || now.workflow !== config.workflow || now.ref !== config.ref)) throw new Error('COLLECTOR_CHANGED');
      if (kind === 'watch' && (now.workflowRunId !== then.workflowRunId || now.repository !== config.repository)) throw new Error('COLLECTOR_CHANGED');
      const current = this.deps.settings.current();
      if (!current || current.repository !== config.repository || current.secretRef !== config.secretRef || (kind === 'dispatch' && (current.workflow !== config.workflow || current.ref !== config.ref))) throw new Error('COLLECTOR_CHANGED');
      if (!(await this.deps.vault.has(config.secretRef!))) throw new Error('CREDENTIAL_DENIED');
      if (state.stop.signal.aborted || this.held(job.projectId)) throw new Error('HELD');
    };
    const timer = new AbortController();
    try {
      await Promise.race([check(), this.sleep(this.limits.admissionMs, timer.signal).then(() => { if (!timer.signal.aborted) throw new Error('ADMISSION_REFUSED'); })]);
    } finally { timer.abort(); }
  }
}
