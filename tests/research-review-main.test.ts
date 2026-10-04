import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import provenance from './fixtures/research-kit/provenance.json';
import { ResearchKit } from '../src/adapters/research-kit/adapter';
import type { OwnedCommand, OwnedOptions, OwnedResult, OwnedRunner } from '../src/tools/commands';
import { Store } from '../src/engine/store';
import { ResearchJobs, researchDto } from '../src/engine/research';
import type { Control } from '../src/engine/control';
import { ReviewSupervisor } from '../src/main/review';
import { readPackage, reviewDigest, treeInventory } from '../src/main/review-workspace';
import { RunSchema, type Research, type RunEvent } from '../src/shared';

// Main's half of the research review (spec "Starting a review", "Kit tools during the review", "Packaging", "Recovery"),
// against the real Store and ResearchJobs, the real ResearchKit adapter and the real pinned kit run with node. Only the
// native helper (a runner that takes the locks, runs beforeStart, then the child) and the engine's review run (begin and
// the scripted model's approved edits) are doubles.
let root: string; let nodeSha256: string; let fixtureBytes: Buffer; let fixtureSha: string;
const fixture = resolve('tests/fixtures/research-kit/collected.zip');
const kitRoot = resolve('.build/research-kit-external/research-kit');
const at = '2026-10-04T00:00:00.000Z';
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const SENTINEL = 'moonzila-test-sentinel-not-a-secret';

type Kind = 'preflight' | 'brief' | 'create' | 'validate';
const kindOf = (request: OwnedCommand): Kind => {
  const script = request.args[1] ?? '';
  if (script.endsWith('preflight.mjs')) return 'preflight';
  if (script.endsWith('brief.mjs')) return 'brief';
  return request.args[2] === 'create' ? 'create' : 'validate';
};
interface Hooks {
  /** Before the guarded check, as if between the helper taking its locks and calling beforeStart. */
  beforeCheck?(request: OwnedCommand, kind: Kind): Promise<void> | void;
  /** After the check passed, while the child "runs". */
  whileRunning?(request: OwnedCommand, kind: Kind, signal?: AbortSignal): Promise<void> | void;
  /** A substitute result instead of running the child. */
  fake?(request: OwnedCommand, kind: Kind): Promise<OwnedResult | undefined> | OwnedResult | undefined;
}
interface Seen { request: OwnedCommand; options: OwnedOptions; kind: Kind }

/** Runs the real kit with node: what the helper does before CreateProcessW, then the child, bounded like the helper. */
function runner(seen: Seen[], hooks: Hooks): OwnedRunner {
  return async (request, signal, options = {}) => {
    const kind = kindOf(request); seen.push({ request, options, kind });
    if (signal?.aborted) throw new Error('RUN_CANCELLED');
    await hooks.beforeCheck?.(request, kind);
    await options.beforeStart?.();
    options.onStarted?.({ pid: 4242, createdAt: '1' });
    await hooks.whileRunning?.(request, kind, signal);
    if (signal?.aborted) return { status: 'exited', code: 1, output: '', truncated: false, cancelled: true, timedOut: false };
    const fake = await hooks.fake?.(request, kind); if (fake) return fake;
    const held = await lockedState(options.readLocks ?? []);
    const result = await new Promise<OwnedResult>(done => execFile(request.executable, request.args, { cwd: request.cwd, env: request.env, timeout: request.timeoutMs, maxBuffer: request.maxOutputBytes, encoding: 'utf8', signal }, (error, stdout) => {
      const failure = error as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
      if (failure?.name === 'AbortError') { done({ status: 'exited', code: 1, output: stdout, truncated: false, cancelled: true, timedOut: false }); return; }
      if (failure?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') { done({ status: 'exited', code: 1, output: stdout, truncated: true, cancelled: false, timedOut: false }); return; }
      if (failure?.killed) { done({ status: 'exited', code: 1, output: stdout, truncated: false, cancelled: false, timedOut: true }); return; }
      done({ status: 'exited', code: failure ? (typeof failure.code === 'number' ? failure.code : 1) : 0, output: stdout, truncated: false, cancelled: false, timedOut: false });
    }));
    // The helper opens every read lock with FILE_SHARE_READ only, so on Windows the child cannot replace, rewrite or delete
    // a locked file: the kit's write fails and it exits 2 (lib/core.mjs writeFailure). Linux takes no lock, so the
    // runner refuses after the fact what Windows would have refused.
    return await lockedState(options.readLocks ?? []) === held ? result : { status: 'exited', code: 2, output: '', truncated: false, cancelled: false, timedOut: false };
  };
}
/** Identity of each read-locked file (inode, size, modification time): a write into any of them changes it. */
async function lockedState(locks: readonly string[]): Promise<string> {
  const parts: string[] = [];
  for (const file of locks) { const info = await lstat(file).catch(() => null); parts.push(info ? `${file}:${info.ino}:${info.size}:${info.mtimeMs}` : `${file}:absent`); }
  return parts.join('\n');
}

interface Harness {
  store: Store; jobs: ResearchJobs; kit: ResearchKit; review: ReviewSupervisor; seen: Seen[]; hooks: Hooks; notices: Research[]; begins: Control[];
  storage: string; id: string; runId?: string; project: string; signals: Map<string, AbortController>;
  engineBeginError?: string;
}
const harnesses: Harness[] = [];
let count = 0;
async function harness(options: { kit?: boolean; trusted?: boolean } = {}): Promise<Harness> {
  const name = `h${++count}`; const folder = join(root, name); await mkdir(folder);
  const store = new Store(join(folder, 'state.sqlite'));
  const notices: Research[] = []; const jobs = new ResearchJobs(store, research => notices.push(research));
  store.putProject({ id: 'p', name: 'p', rootPath: join(folder, 'project-root'), pathLabel: 'p', trusted: options.trusted ?? true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'public-technical' }, missing: false, createdAt: at });
  store.putProfile({ id: 'm', name: 'Local', kind: 'ollama', endpoint: 'http://localhost:11434', model: 'test', contextTokens: 8192, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'pv', createdAt: at, updatedAt: at });
  const id = 'j1';
  store.createResearch({ id, projectId: 'p', topic: 'Fixture topic', inputs: { queries: [], urls: [], preferDomains: [], depth: 'quick', maxPages: 8 }, clientRef: provenance.identity.clientRef, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
  const step = (to: 'dispatching' | 'collecting' | 'collected', patch: object) => store.transitionResearch({ researchId: id, expectedRevision: store.getResearch(id)!.revision, to, actor: 'main', cause: 'TEST_STEP', patch });
  step('dispatching', { target: { collectorRevision: 1, repository: provenance.identity.repository, workflow: 'collect.yml', ref: provenance.identity.ref } });
  step('collecting', { workflowRunId: '1' });
  const seen: Seen[] = []; const hooks: Hooks = {};
  const storage = join(folder, 'storage');
  const kit = new ResearchKit({ kitRoot, nodePath: process.execPath, nodeSha256, storageRoot: storage, helperPath: resolve('.build/native/MoonAlizaHost.exe') }, runner(seen, hooks));
  // Task 4's import: the collected package retained under the binding of the collecting revision.
  const binding = { projectId: 'p', projectRevision: 1, jobId: id, jobRevision: 3, ...provenance.identity };
  const imported = await kit.validate(fixture, binding);
  expect(imported).toMatchObject({ status: 'PASS', state: 'REVIEW_IN_PROGRESS' });
  step('collected', { verification: { artifactSha256: fixtureSha, artifactBytes: fixtureBytes.length, validatorRevision: imported.receipt!.validatorRevision, nodeSha256, state: 'REVIEW_IN_PROGRESS', jobRevision: 3, projectRevision: 1,
    repository: provenance.identity.repository, ref: provenance.identity.ref, workflow: provenance.identity.workflow, commit: provenance.identity.commit, runAttempt: 1, workflowRunId: '1', clientRef: provenance.identity.clientRef, downloadDigest: 'unverified' } });
  const begins: Control[] = []; const signals = new Map<string, AbortController>();
  const h: Harness = { store, jobs, kit, seen, hooks, notices, begins, storage, id, project: join(storage, 'review', id, 'project'), signals, review: undefined as unknown as ReviewSupervisor };
  h.review = new ReviewSupervisor({
    control: async control => engine(h, control), kit: options.kit === false ? null : kit, redact: async text => text.replaceAll(SENTINEL, '[redacted]'),
    runSignal: runId => { const signal = signals.get(runId)?.signal; if (!signal || signal.aborted) throw new Error('RUN_CANCELLED'); return signal; },
    retryDelayMs: 10,
  });
  harnesses.push(h); return h;
}
/** The engine as the contract says it behaves, over the real Store and ResearchJobs; `begin` stands in for B2's review run. */
async function engine(h: Harness, control: Control): Promise<unknown> {
  switch (control.method) {
    case 'research.context': return h.jobs.context(control.researchId);
    case 'research.review.context': return h.jobs.reviewContext(control.researchId);
    case 'research.transition': return h.jobs.transition(control);
    case 'research.recover': return h.jobs.recover(control.owned, control.reviewFolders ?? []);
    case 'research.review.begin': {
      h.begins.push(control);
      if (h.engineBeginError) { const code = h.engineBeginError; h.engineBeginError = undefined; throw new Error(code); }
      const job = h.store.getResearch(control.researchId)!;
      if (!['collected', 'not_ready'].includes(job.status)) throw new Error('REVIEW_NOT_AVAILABLE');
      // The previous review run already ended with its job's not_ready step (the engine's run-end transaction).
      if (job.reviewRunId && h.store.getRun(job.reviewRunId)?.status === 'awaiting_review') h.store.appendEvent(job.reviewRunId, 'run.failed', {}, { status: 'failed', finishedAt: at });
      const runId = randomUUID(); const sessionId = job.reviewSessionId ?? randomUUID();
      if (!h.store.getSession(sessionId)) h.store.putSession({ id: sessionId, projectId: job.projectId, title: 'Review', createdAt: at, updatedAt: at });
      h.store.putRun({ id: runId, sessionId, projectId: job.projectId, mode: 'research', status: 'running', profileId: 'm', profileRevisionId: 'pv', policyRevision: 1, trustRevision: 1, createdAt: at });
      const cause = job.status === 'collected' ? 'REVIEW_STARTED' : control.workspace === 'fresh' ? 'REVIEW_RESTARTED' : 'REVIEW_RETRY';
      h.store.transitionResearch({ researchId: job.id, expectedRevision: job.revision, to: 'reviewing', actor: 'user', cause, requestId: control.requestId, patch: { reviewRunId: runId, reviewSessionId: sessionId, workspace: control.workspace } });
      return { research: researchDto(h.store.getResearch(job.id)!), run: RunSchema.parse(h.store.getRun(runId)) };
    }
    default: throw new Error('NOT_IMPLEMENTED');
  }
}
async function begin(h: Harness) {
  const { research, run } = await h.review.start(h.id, 'm');
  h.runId = run.id; h.signals.set(run.id, new AbortController());
  return research;
}
/** One approved edit as the engine's journal applies it: the bytes on disk and a completed write operation. */
async function edit(h: Harness, path: string, content: string) {
  const file = join(h.project, ...path.split('/'));
  const before = await readFile(file).then(digest, () => null);
  await writeFile(file, content);
  const now = new Date().toISOString();
  h.store.putOperation({ id: randomUUID(), runId: h.runId!, projectId: 'p', kind: 'write', inputHash: digest(path + content), policyRevision: 1, trustRevision: 1, status: 'completed', input: { path, beforeHash: before, afterHash: digest(content) }, createdAt: now, updatedAt: now });
}
const read = (h: Harness, path: string) => readFile(join(h.project, ...path.split('/')), 'utf8');
const ORIGINAL_FINDING = 'The free plan allows 10 requests per minute and includes 1,000 credits.';
const REVIEWED_FINDING = 'The free tier caps this design at 10 requests per minute; the 1,000 included credits are about 25 quick runs.';
async function rewriteFinding(h: Harness) { await edit(h, 'research/EVIDENCE.md', (await read(h, 'research/EVIDENCE.md')).replace(ORIGINAL_FINDING, REVIEWED_FINDING)); }
/** The agent's judgements: both TODO sections answered and the reviewer declared. */
function answered(brief: string): string {
  const answer = (text: string, heading: string, body: string) => {
    const start = text.indexOf(`## ${heading}\n`); expect(start).toBeGreaterThan(-1);
    const from = start + heading.length + 4; const end = text.indexOf('\n## ', from);
    return `${text.slice(0, from)}\n${body}\n${text.slice(end)}`;
  };
  let text = answer(brief, 'Contradictions and how they were resolved', 'None. One source, and nothing else in the corpus speaks to the same limit.');
  text = answer(text, 'Decision', 'Build against a 10-request-per-minute ceiling first. Out of scope: paid tiers.');
  return text.replace(/^Reviewed by: _agent.*$/m, 'Reviewed by: agent');
}
async function draftAndAnswer(h: Harness) {
  const drafted = await h.review.reviewTool(h.runId!, 'research_draft_brief', {}, 'epoch');
  expect(drafted.tool).toBe('research_draft_brief');
  const content = (drafted as { content: string }).content;
  await edit(h, 'research/BRIEF.md', content);
  await edit(h, 'research/BRIEF.md', answered(content));
}
/** The run's final answer: run status awaiting_review, which main sees as a run event. */
function finish(h: Harness) {
  const event = h.store.appendEvent(h.runId!, 'run.status', { status: 'awaiting_review' }, { status: 'awaiting_review' });
  h.review.runEvent(event as unknown as RunEvent);
}
async function until(h: Harness, done: (status: string) => boolean, ms = 60000) {
  const deadline = Date.now() + ms;
  while (!done(h.store.getResearch(h.id)!.status)) { if (Date.now() > deadline) throw new Error(`timed out in ${h.store.getResearch(h.id)!.status}`); await new Promise(r => setTimeout(r, 20)); }
  return h.store.getResearch(h.id)!;
}
const settled = (status: string) => ['approved', 'not_ready', 'cancelled'].includes(status);
const path = (...parts: string[]) => join(...parts);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'moonzila-review-main-'));
  nodeSha256 = digest(await readFile(process.execPath)); fixtureBytes = await readFile(fixture); fixtureSha = digest(fixtureBytes);
  process.env.MOONZILA_TEST_SENTINEL = SENTINEL;
});
afterEach(async () => { for (const h of harnesses.splice(0)) { await h.review.close(); await h.kit.close(); h.store.close(); } });
afterAll(async () => {
  delete process.env.MOONZILA_TEST_SENTINEL;
  if (root) { const rel = relative(resolve(tmpdir()), root); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); }
});

test('a passing review: rewrite the Finding, draft and answer the brief, end; the kit approves and main records approved', async () => {
  const h = await harness();
  const research = await begin(h);
  expect(research).toMatchObject({ status: 'reviewing', reviewRunId: h.runId });
  expect(h.begins).toEqual([expect.objectContaining({ method: 'research.review.begin', researchId: h.id, profileId: 'm', workspace: 'fresh' })]);
  // The workspace is the verified package's project/, outside every project folder.
  expect(await treeInventory(h.project)).toEqual((await readPackage(fixtureBytes)).base);
  await rewriteFinding(h);
  await draftAndAnswer(h);
  const brief = await read(h, 'research/BRIEF.md');
  expect(brief).toContain(REVIEWED_FINDING); expect(brief).not.toContain('**TODO** -');
  const verdict = await h.review.reviewTool(h.runId!, 'research_preflight', {}, 'epoch');
  expect(verdict).toMatchObject({ tool: 'research_preflight', pass: true });
  expect((verdict as { findings: Array<{ check: string; rule: string }> }).findings.filter(f => f.rule === 'brief-stale')).toEqual([]);
  finish(h);
  const job = await until(h, settled);
  expect(job).toMatchObject({ status: 'approved' });
  expect(job.reviewedPackageSha256).toMatch(/^[0-9a-f]{64}$/); expect(job.reviewedPackageSha256).not.toBe(fixtureSha);
  const events = h.store.researchEvents(h.id).events.slice(-3).map(event => [event.from, event.to, event.actor, event.cause]);
  expect(events).toEqual([['collected', 'reviewing', 'user', 'REVIEW_STARTED'], ['reviewing', 'packaging', 'main', 'WORKSPACE_FROZEN'], ['packaging', 'approved', 'main', 'KIT_APPROVED']]);
  // The reviewed bytes are retained and validate as research-ready under the packaging revision's binding.
  const binding = { projectId: 'p', projectRevision: 1, jobId: h.id, jobRevision: job.reviewedBoundRevision!, ...provenance.identity };
  expect(await h.kit.validate(join(h.storage, 'artifacts', `${job.reviewedPackageSha256}.zip`), binding)).toMatchObject({ status: 'PASS', state: 'APPROVED_BRIEF', researchReady: true });
  // Approved: the job's review folder is deleted; nothing of a packaging attempt is left.
  await expect.poll(() => readdir(join(h.storage, 'review')), { timeout: 10000 }).toEqual([]);
}, 180000);

test('a failing gate records not_ready / REVIEW_GATE_FAILED with the reviewed package; an unreviewed Finding gives REVIEW_INCOMPLETE', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h);
  // Before the draft, so the brief is not stale (a stale brief is refused earlier, at the freeze).
  await edit(h, 'research/DISCOVERY.md', (await read(h, 'research/DISCOVERY.md')).replace('| CLOSED |', '| OPEN |'));
  await draftAndAnswer(h);
  finish(h);
  const job = await until(h, settled);
  expect(job).toMatchObject({ status: 'not_ready', failure: 'REVIEW_GATE_FAILED' });
  expect(job.reviewedPackageSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ from: 'packaging', to: 'not_ready', actor: 'main', cause: 'KIT_NOT_APPROVED' });

  const other = await harness();
  await begin(other); await draftAndAnswer(other); finish(other);
  expect(await until(other, settled)).toMatchObject({ status: 'not_ready', failure: 'REVIEW_INCOMPLETE' });
}, 240000);

test('tampering after the final answer is refused by the freeze, never packaged', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
  // One byte of EVIDENCE.md changed on disk outside the journal.
  await writeFile(join(h.project, 'research', 'EVIDENCE.md'), (await read(h, 'research/EVIDENCE.md')) + ' ');
  finish(h);
  expect(await until(h, settled)).toMatchObject({ status: 'not_ready', failure: 'REVIEW_WORKSPACE_CHANGED' });
  expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ from: 'reviewing', to: 'not_ready', cause: 'INVENTORY_MISMATCH' });
  // Refused before any kit child of the freeze: no preflight over a tree that is not the reviewed one, and no create.
  expect(h.seen.filter(s => s.kind === 'preflight' || s.kind === 'create')).toEqual([]);
}, 180000);

test('a change made after the freeze and before create starts is refused by the rehash in beforeStart: no create child runs', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
  let started = 0;
  h.hooks.beforeCheck = async (_request, kind) => { if (kind === 'create') await writeFile(join(h.project, 'research', 'MAP.md'), (await read(h, 'research/MAP.md')) + '\n'); };
  h.hooks.whileRunning = (_request, kind) => { if (kind === 'create') started++; };
  finish(h);
  expect(await until(h, settled)).toMatchObject({ status: 'not_ready', failure: 'REVIEW_WORKSPACE_CHANGED' });
  expect(h.store.researchEvents(h.id).events.slice(-2).map(e => e.to)).toEqual(['packaging', 'not_ready']);
  expect(started).toBe(0);
}, 180000);

test('a file added under research/ while create runs is caught by inventory equality: REVIEW_PACKAGE_MISMATCH, never approved', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
  h.hooks.whileRunning = async (_request, kind) => { if (kind === 'create') await writeFile(join(h.project, 'research', 'NOTES.md'), 'added while create ran\n'); };
  finish(h);
  const job = await until(h, settled);
  expect(job).toMatchObject({ status: 'not_ready', failure: 'REVIEW_PACKAGE_MISMATCH' });
  expect(job.reviewedPackageSha256).toMatch(/^[0-9a-f]{64}$/);
  // And the store's readiness rule refuses a forged approved step without the journal row main would have written.
  expect(() => h.store.transitionResearch({ researchId: h.id, expectedRevision: job.revision, to: 'approved', actor: 'main', cause: 'KIT_APPROVED', patch: { reviewedPackage: { sha256: job.reviewedPackageSha256!, validatorRevision: job.reviewedValidatorRevision!, boundRevision: job.revision } } })).toThrow();
}, 180000);

test('Q10 (b): a brief left stale by a Finding rewritten after the draft is refused at the freeze with REVIEW_INCOMPLETE', async () => {
  const h = await harness();
  await begin(h); await draftAndAnswer(h); await rewriteFinding(h);
  finish(h);
  expect(await until(h, settled)).toMatchObject({ status: 'not_ready', failure: 'REVIEW_INCOMPLETE' });
  expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ from: 'reviewing', to: 'not_ready', cause: 'BRIEF_STALE' });
  expect(h.seen.filter(s => s.kind === 'create')).toEqual([]);
}, 180000);

test('research_draft_brief runs in a scratch copy: the workspace is unchanged, a judged brief is BRIEF_NOT_DRAFTED, and force redrafts only in the copy', async () => {
  const h = await harness();
  await begin(h);
  const before = await treeInventory(h.project);
  const drafted = await h.review.reviewTool(h.runId!, 'research_draft_brief', {}, 'epoch') as { content: string };
  expect(drafted.content).toContain('_Auto-drafted');
  expect(await treeInventory(h.project)).toEqual(before);
  await edit(h, 'research/BRIEF.md', answered(drafted.content));
  await expect(h.review.reviewTool(h.runId!, 'research_draft_brief', {}, 'epoch')).rejects.toThrow('BRIEF_NOT_DRAFTED');
  const forced = await h.review.reviewTool(h.runId!, 'research_draft_brief', { force: true }, 'epoch') as { content: string };
  expect(forced.content).toContain('**TODO**');
  expect(await read(h, 'research/BRIEF.md')).toBe(answered(drafted.content));
  // No scratch or temp folder is left behind.
  expect(await readdir(join(h.storage, 'review', h.id))).toEqual(['project']);
  expect(h.seen.filter(s => s.kind === 'brief').map(s => s.request.args.slice(2))).toEqual([[], [], ['--force']]);
  for (const s of h.seen.filter(s => s.kind === 'brief')) {
    expect(resolve(s.request.cwd).startsWith(resolve(h.storage, 'review', h.id, 'scratch-'))).toBe(true);
    // The file the kit writes is never read-locked (on Windows the lock would deny its rename); every other copy file is.
    const locked = s.options.readLocks!.filter(file => resolve(file).startsWith(resolve(s.request.cwd) + sep)).map(file => relative(s.request.cwd, file).split(sep).join('/'));
    expect(locked).not.toContain('research/BRIEF.md');
    expect(locked.sort()).toEqual(before.map(entry => entry.path).filter(file => file !== 'research/BRIEF.md').sort());
  }
}, 120000);

test('research_preflight: only a whole JSON verdict with its matching exit counts; exit 2, a crash with no JSON or truncation is REVIEW_TOOL_FAILED', async () => {
  const h = await harness();
  await begin(h);
  const verdict = await h.review.reviewTool(h.runId!, 'research_preflight', {}, 'epoch');
  expect(verdict).toMatchObject({ tool: 'research_preflight', pass: true, evidencePolicy: 'pluralist' });
  const real = h.seen.find(s => s.kind === 'preflight')!;
  expect(real.request.args.slice(0, 1)).toEqual(['--max-old-space-size=256']); expect(real.request.args.slice(2)).toEqual(['--json']);
  expect(resolve(real.request.cwd)).toBe(resolve(h.project));
  expect(real.options.stopOnOutputLimit).toBe(true); expect(real.request.timeoutMs).toBe(60000); expect(real.request.maxOutputBytes).toBe(256 * 1024);
  const json = JSON.stringify({ pass: true, counts: { pass: 1, warn: 0, fail: 0 }, evidencePolicy: 'pluralist', findings: [] });
  for (const result of [
    { status: 'exited', code: 2, output: '', truncated: false, cancelled: false, timedOut: false },
    { status: 'exited', code: 1, output: '', truncated: false, cancelled: false, timedOut: false },
    { status: 'exited', code: 1, output: json, truncated: false, cancelled: false, timedOut: false },
    { status: 'exited', code: 0, output: json.slice(0, 20), truncated: true, cancelled: false, timedOut: false },
    { status: 'exited', code: 0, output: json, truncated: false, cancelled: false, timedOut: true },
  ] as OwnedResult[]) {
    h.hooks.fake = (_request, kind) => (kind === 'preflight' ? result : undefined);
    await expect(h.review.reviewTool(h.runId!, 'research_preflight', {}, 'epoch'), JSON.stringify(result)).rejects.toThrow('REVIEW_TOOL_FAILED');
  }
  // Bounded for the model: at most 200 findings, each detail cut to 1,024 characters, and redacted.
  const many = { pass: false, counts: { pass: 0, warn: 0, fail: 300 }, evidencePolicy: 'pluralist', findings: Array.from({ length: 300 }, () => ({ severity: 'fail', check: 'c', rule: 'r', detail: `${SENTINEL} ${'x'.repeat(5000)}` })) };
  h.hooks.fake = (_request, kind) => (kind === 'preflight' ? { status: 'exited', code: 1, output: JSON.stringify(many), truncated: false, cancelled: false, timedOut: false } : undefined);
  const bounded = await h.review.reviewTool(h.runId!, 'research_preflight', {}, 'epoch') as { findings: Array<{ detail: string }> };
  expect(bounded.findings).toHaveLength(200);
  expect(bounded.findings[0]!.detail).toHaveLength(1024); expect(bounded.findings[0]!.detail.startsWith('[redacted] ')).toBe(true);
  // A tool for a run this process did not begin, or after the run's capability is gone, is RUN_CANCELLED.
  await expect(h.review.reviewTool('other-run', 'research_preflight', {}, 'epoch')).rejects.toThrow('RUN_CANCELLED');
  h.signals.get(h.runId!)!.abort();
  await expect(h.review.reviewTool(h.runId!, 'research_preflight', {}, 'epoch')).rejects.toThrow('RUN_CANCELLED');
}, 120000);

test('every child gets one --name=value element per create value and only the private temp environment: no user variable, no token', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
  await h.review.reviewTool(h.runId!, 'research_preflight', {}, 'epoch');
  finish(h);
  expect(await until(h, settled)).toMatchObject({ status: 'approved' });
  const create = h.seen.find(s => s.kind === 'create')!;
  const args = create.request.args.slice(3);
  for (const arg of args) expect(arg).toMatch(/^--[a-z-]+=/);
  expect(Object.fromEntries(args.map(arg => [arg.slice(2, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]))).toMatchObject({
    'client-ref': 'moonaliza-fixture', repository: 'moonaliza-fixtures/synthetic', ref: 'fixture', commit: provenance.identity.commit, workflow: 'fixture-generation', 'run-id': '1', 'run-attempt': '1',
    // Q8: carried from the collected manifest.
    'run-url': 'https://api.github.com/repos/moonaliza-fixtures/synthetic/actions/runs/1', 'html-url': 'https://github.com/moonaliza-fixtures/synthetic/actions/runs/1', 'api-version': '2026-03-10',
  });
  expect(resolve(args.find(arg => arg.startsWith('--root='))!.slice(7))).toBe(resolve(h.project));
  expect(create.options.stopOnOutputLimit).toBe(true); expect(create.request.timeoutMs).toBe(120000); expect(create.request.maxOutputBytes).toBe(64 * 1024);
  // The read locks cover node and every workspace file.
  for (const entry of await treeInventory(h.project).catch(() => [])) expect(create.options.readLocks).toContain(path(h.project, ...entry.path.split('/')));
  expect(create.options.readLocks![0]).toBe(process.execPath);
  for (const s of h.seen.filter(s => s.kind !== 'validate')) {
    expect(Object.keys(s.request.env).filter(key => key.toLowerCase() !== 'systemroot').sort()).toEqual(['HOME', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE']);
    for (const value of Object.values(s.request.env)) expect(value).not.toContain(SENTINEL);
    const temp = resolve(s.request.env.TEMP!);
    expect(temp.startsWith(resolve(h.storage, 'review', h.id, 'temp-'))).toBe(true);
    for (const key of ['TMP', 'TMPDIR', 'HOME', 'USERPROFILE']) expect(resolve(s.request.env[key]!)).toBe(temp);
  }
}, 180000);

test('create exits: 3 is REVIEW_PACKAGE_BLOCKED, 1 is REVIEW_PACKAGE_INVALID, and the output is deleted on every non-zero exit', async () => {
  for (const [code, failure] of [[3, 'REVIEW_PACKAGE_BLOCKED'], [1, 'REVIEW_PACKAGE_INVALID']] as const) {
    const h = await harness();
    await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
    const outputs: string[] = [];
    h.hooks.fake = async (request, kind) => {
      if (kind !== 'create') return undefined;
      // What the kit can do: write its output, then exit non-zero.
      const output = request.args.find(arg => arg.startsWith('--output='))!.slice(9); outputs.push(output);
      await writeFile(output, 'partial package');
      return { status: 'exited', code, output: '', truncated: false, cancelled: false, timedOut: false };
    };
    finish(h);
    expect(await until(h, settled)).toMatchObject({ status: 'not_ready', failure });
    expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ cause: `KIT_CREATE_EXIT_${code}` });
    expect(outputs).toHaveLength(1);
    await expect(readFile(outputs[0]!)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(join(h.storage, 'review', h.id))).filter(name => name.startsWith('out-'))).toEqual([]);
    await h.review.close(); await h.kit.close();
  }
}, 360000);

test('a create that times out twice ends REVIEW_PACKAGING_FAILED / OWNED_TIMEOUT after exactly one more attempt', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
  h.hooks.fake = (_request, kind) => (kind === 'create' ? { status: 'exited', code: 1, output: '', truncated: false, cancelled: false, timedOut: true } : undefined);
  finish(h);
  expect(await until(h, settled)).toMatchObject({ status: 'not_ready', failure: 'REVIEW_PACKAGING_FAILED' });
  expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ cause: 'OWNED_TIMEOUT' });
  expect(h.seen.filter(s => s.kind === 'create')).toHaveLength(2);
}, 180000);

test('cancel during packaging stops the create child and main records cancelled / REVIEW_CANCELLED', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
  let running!: () => void; const started = new Promise<void>(r => { running = r; });
  h.hooks.whileRunning = async (_request, kind, signal) => {
    if (kind !== 'create') return;
    running();
    await new Promise<void>(r => { if (signal?.aborted) r(); else signal?.addEventListener('abort', () => r(), { once: true }); });
  };
  finish(h);
  await started;
  expect(h.store.getResearch(h.id)!.status).toBe('packaging');
  const { research } = h.jobs.cancel(h.id, randomUUID(), []);
  h.review.observe(research);
  const job = await until(h, status => status === 'cancelled');
  expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ from: 'cancelling', to: 'cancelled', actor: 'main', cause: 'REVIEW_CANCELLED' });
  expect(job.reviewedPackageSha256).toBeUndefined();
  await expect.poll(() => readdir(join(h.storage, 'review')), { timeout: 10000 }).toEqual([]);
}, 180000);

test('a Stop committed by the engine during packaging (not_ready / REVIEW_STOPPED) stops the child; main records nothing after it', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
  let running!: () => void; const started = new Promise<void>(r => { running = r; });
  h.hooks.whileRunning = async (_request, kind, signal) => {
    if (kind !== 'create') return;
    running();
    await new Promise<void>(r => { if (signal?.aborted) r(); else signal?.addEventListener('abort', () => r(), { once: true }); });
  };
  finish(h);
  await started;
  const job = h.store.getResearch(h.id)!;
  h.store.appendEvent(h.runId!, 'run.cancelled', {}, { status: 'cancelled', finishedAt: at });
  const { research } = h.store.transitionResearch({ researchId: h.id, expectedRevision: job.revision, to: 'not_ready', actor: 'engine', cause: 'REVIEW_STOPPED', patch: { failure: 'REVIEW_STOPPED' } });
  h.review.observe(researchDto(research));
  await expect.poll(() => h.review.busy(), { timeout: 20000 }).toBe(false);
  expect(h.store.getResearch(h.id)).toMatchObject({ status: 'not_ready', failure: 'REVIEW_STOPPED' });
  expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ actor: 'engine', cause: 'REVIEW_STOPPED' });
  expect((await readdir(join(h.storage, 'review', h.id))).filter(name => name !== 'project')).toEqual([]);
}, 180000);

test('a review job cancelled under an interrupted run (no live run, no driver) is committed cancelled by main without an app start', async () => {
  // Guard (breaker F2): a cancelling review job is owned on its notice, and its driver commits cancelled once no run is live.
  const h = await harness();
  await begin(h);
  // An engine-only restart interrupted the run at its start; the job is still reviewing, and nothing in main owns it.
  h.store.appendEvent(h.runId!, 'run.interrupted', { reason: 'engine_interrupted' }, { status: 'interrupted', finishedAt: at });
  const { research } = h.jobs.cancel(h.id, randomUUID(), []);
  expect(research.status).toBe('cancelling');
  h.review.observe(research);
  await until(h, status => status === 'cancelled', 20000);
  expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ from: 'cancelling', to: 'cancelled', actor: 'main', cause: 'REVIEW_CANCELLED' });
  await expect.poll(() => readdir(join(h.storage, 'review')), { timeout: 10000 }).toEqual([]);
}, 120000);

test('a retry continues a verified workspace with its edits; a workspace changed while not ready is rebuilt fresh', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h);
  // The run fails (budget): the engine records not_ready in the run's terminal transaction.
  h.store.appendEvent(h.runId!, 'run.failed', {}, { status: 'failed', finishedAt: at });
  h.store.transitionResearch({ researchId: h.id, expectedRevision: h.store.getResearch(h.id)!.revision, to: 'not_ready', actor: 'engine', cause: 'REVIEW_RUN_FAILED', patch: { failure: 'REVIEW_BUDGET_EXCEEDED' } });
  await begin(h);
  expect(h.begins.at(-1)).toMatchObject({ workspace: 'continued' });
  expect(await read(h, 'research/EVIDENCE.md')).toContain(REVIEWED_FINDING);
  await draftAndAnswer(h); finish(h);
  expect(await until(h, settled)).toMatchObject({ status: 'approved' });

  const other = await harness();
  await begin(other); await rewriteFinding(other);
  other.store.appendEvent(other.runId!, 'run.failed', {}, { status: 'failed', finishedAt: at });
  other.store.transitionResearch({ researchId: other.id, expectedRevision: other.store.getResearch(other.id)!.revision, to: 'not_ready', actor: 'engine', cause: 'REVIEW_RUN_FAILED', patch: { failure: 'REVIEW_RUN_FAILED' } });
  await writeFile(join(other.project, 'research', 'MAP.md'), 'changed while the app was closed');
  await begin(other);
  expect(other.begins.at(-1)).toMatchObject({ workspace: 'fresh' });
  expect(await treeInventory(other.project)).toEqual((await readPackage(fixtureBytes)).base);
}, 240000);

test('the engine refusing a continued workspace (REVIEW_WORKSPACE_CHANGED) makes main rebuild fresh and send a new begin', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h);
  h.store.appendEvent(h.runId!, 'run.failed', {}, { status: 'failed', finishedAt: at });
  h.store.transitionResearch({ researchId: h.id, expectedRevision: h.store.getResearch(h.id)!.revision, to: 'not_ready', actor: 'engine', cause: 'REVIEW_RUN_FAILED', patch: { failure: 'REVIEW_RUN_FAILED' } });
  h.engineBeginError = 'REVIEW_WORKSPACE_CHANGED';
  await begin(h);
  expect(h.begins.slice(-2).map(c => (c as { workspace: string }).workspace)).toEqual(['continued', 'fresh']);
  const [first, second] = h.begins.slice(-2) as Array<{ requestId: string }>;
  expect(first!.requestId).not.toBe(second!.requestId);
  expect(await read(h, 'research/EVIDENCE.md')).toContain(ORIGINAL_FINDING);
}, 180000);

test('restart: a job found in packaging re-verifies the stored digest and packages; a frozen run found in freeze is frozen', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
  h.store.appendEvent(h.runId!, 'run.status', { status: 'awaiting_review' }, { status: 'awaiting_review' });
  // The previous process froze the workspace and crashed before create.
  const frozen = reviewDigest(await treeInventory(h.project));
  h.store.transitionResearch({ researchId: h.id, expectedRevision: h.store.getResearch(h.id)!.revision, to: 'packaging', actor: 'main', cause: 'WORKSPACE_FROZEN', patch: { reviewDigest: frozen } });
  // A stray out- folder from the crashed attempt is swept at the next start.
  await mkdir(join(h.storage, 'review', h.id, 'out-left-by-crash'));
  await h.review.close(); await h.kit.close();
  h.kit = new ResearchKit({ kitRoot, nodePath: process.execPath, nodeSha256, storageRoot: h.storage, helperPath: resolve('.build/native/MoonAlizaHost.exe') }, runner(h.seen, h.hooks));
  await h.kit.sweep();
  expect(await readdir(join(h.storage, 'review', h.id))).toEqual(['project']);
  const fresh = new ReviewSupervisor({ control: c => engine(h, c), kit: h.kit, redact: async t => t, runSignal: () => { throw new Error('RUN_CANCELLED'); }, retryDelayMs: 10 });
  h.review = fresh;
  await fresh.recovered(h.jobs.recover([], ['j1', 'gone-job']));
  expect(await until(h, settled)).toMatchObject({ status: 'approved' });

  const other = await harness();
  await begin(other); await rewriteFinding(other); await draftAndAnswer(other);
  other.store.appendEvent(other.runId!, 'run.status', { status: 'awaiting_review' }, { status: 'awaiting_review' });
  const recovery = other.jobs.recover([], []);
  expect(recovery.freeze).toEqual([other.id]);
  await other.review.recovered(recovery);
  expect(await until(other, settled)).toMatchObject({ status: 'approved' });
}, 240000);

test('a job in packaging whose workspace no longer matches its frozen digest is not packaged', async () => {
  const h = await harness();
  await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
  h.store.appendEvent(h.runId!, 'run.status', { status: 'awaiting_review' }, { status: 'awaiting_review' });
  h.store.transitionResearch({ researchId: h.id, expectedRevision: h.store.getResearch(h.id)!.revision, to: 'packaging', actor: 'main', cause: 'WORKSPACE_FROZEN', patch: { reviewDigest: reviewDigest(await treeInventory(h.project)) } });
  await writeFile(join(h.project, 'research', 'MAP.md'), 'changed after the freeze, before the restart');
  await h.review.recovered(h.jobs.recover([], []));
  expect(await until(h, settled)).toMatchObject({ status: 'not_ready', failure: 'REVIEW_WORKSPACE_CHANGED' });
  expect(h.seen.filter(s => s.kind === 'create')).toEqual([]);
}, 180000);

test('recovery discards only the folders the engine names, and never one this process owns', async () => {
  const h = await harness();
  await begin(h);
  for (const name of ['gone-job', 'j1']) await mkdir(join(h.storage, 'review', name, 'project'), { recursive: true });
  // The engine names what is absent or finished and not owned; 'j1' is reviewing, so it is kept.
  const recovery = h.jobs.recover([], ['gone-job', 'j1']);
  expect(recovery.reviewDiscard).toEqual(['gone-job']);
  await h.review.recovered({ ...recovery, reviewDiscard: ['..', ...recovery.reviewDiscard] });
  // Only the named plain folder went; '..' is never a job folder, so storage itself is untouched.
  expect(await readdir(join(h.storage, 'review'))).toEqual(['j1']);
  expect(await readdir(h.storage)).toContain('artifacts');
}, 120000);

test('start refuses what is not reviewable: wrong status, an untrusted project, no kit, or retained bytes that no longer verify', async () => {
  const h = await harness();
  await begin(h);
  await expect(h.review.start(h.id, 'm')).rejects.toThrow('REVIEW_NOT_AVAILABLE');
  const untrusted = await harness({ trusted: false });
  await expect(untrusted.review.start(untrusted.id, 'm')).rejects.toThrow('PROJECT_UNTRUSTED');
  const nokit = await harness({ kit: false });
  await expect(nokit.review.start(nokit.id, 'm')).rejects.toThrow('RESEARCH_KIT_UNAVAILABLE');
  const torn = await harness();
  await writeFile(join(torn.storage, 'artifacts', `${fixtureSha}.zip`), fixtureBytes.subarray(0, 1000));
  await expect(torn.review.start(torn.id, 'm')).rejects.toThrow('STALE_VERIFICATION');
  for (const x of [untrusted, nokit, torn]) expect(x.begins).toEqual([]);
}, 180000);

// ------------------------------------------------------------------ containment (Phase 3 containment S1, main side)

/**
 * Moves the folder at `level` (the workspace root, or storage/review/<id>) to a sibling inside this test's root and puts a
 * junction to it in its place. The moved tree keeps its bytes, as an attacker would, so only containment can tell.
 */
let moved = 0;
async function junctionAt(h: Harness, level: 'project' | 'job'): Promise<string> {
  const at = level === 'project' ? h.project : join(h.storage, 'review', h.id);
  const sibling = join(root, `moved-${++moved}`);
  await rename(at, sibling); await symlink(sibling, at, 'junction');
  expect((await lstat(at)).isSymbolicLink()).toBe(true);
  return sibling;
}
const ofTree = async (folder: string) => (await treeInventory(folder)).map(entry => `${entry.path}:${entry.sha256}`);
const uncontained = { status: 'not_ready', failure: 'REVIEW_WORKSPACE_CHANGED' };

for (const level of ['project', 'job'] as const) {
  test(`a junction at ${level === 'project' ? 'the workspace root' : 'storage/review/<id>'} after the final answer: the freeze refuses before any child, and the moved tree is untouched`, async () => {
    // Guard: the freeze's containment check of the job folder and the workspace root, before its first workspace child.
    const h = await harness();
    await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
    const sibling = await junctionAt(h, level);
    const before = await ofTree(level === 'project' ? sibling : join(sibling, 'project'));
    finish(h);
    expect(await until(h, settled)).toMatchObject(uncontained);
    expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ from: 'reviewing', to: 'not_ready', cause: 'WORKSPACE_NOT_CONTAINED' });
    expect(h.seen.filter(s => s.kind === 'preflight' || s.kind === 'create')).toEqual([]);
    expect(await ofTree(level === 'project' ? sibling : join(sibling, 'project'))).toEqual(before);
    if (level === 'job') expect(await readdir(sibling)).toEqual(['project']);
  }, 180000);

  for (const [kind, label] of [['preflight', 'the freeze preflight'], ['create', 'create']] as const) {
    test(`a junction at ${level === 'project' ? 'the workspace root' : 'storage/review/<id>'} swapped in just before ${label} starts is refused in its guarded start`, async () => {
      // Guard: containment inside the guarded start of the freeze preflight and of create.
      const h = await harness();
      await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
      let swapped = false; let started = 0;
      h.hooks.beforeCheck = async (_request, k) => { if (k === kind && !swapped) { swapped = true; await junctionAt(h, level); } };
      h.hooks.whileRunning = (_request, k) => { if (swapped && (k === 'preflight' || k === 'create')) started++; };
      finish(h);
      expect(await until(h, settled)).toMatchObject(uncontained);
      expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ to: 'not_ready', cause: 'WORKSPACE_NOT_CONTAINED' });
      expect(swapped).toBe(true); expect(started).toBe(0);
    }, 180000);
  }

  test(`restart in packaging with a junction at ${level === 'project' ? 'the workspace root' : 'storage/review/<id>'}: packaging refuses before create`, async () => {
    // Guard: packaging's containment check before its first workspace child.
    const h = await harness();
    await begin(h); await rewriteFinding(h); await draftAndAnswer(h);
    h.store.appendEvent(h.runId!, 'run.status', { status: 'awaiting_review' }, { status: 'awaiting_review' });
    h.store.transitionResearch({ researchId: h.id, expectedRevision: h.store.getResearch(h.id)!.revision, to: 'packaging', actor: 'main', cause: 'WORKSPACE_FROZEN', patch: { reviewDigest: reviewDigest(await treeInventory(h.project)) } });
    await junctionAt(h, level);
    await h.review.recovered(h.jobs.recover([], []));
    expect(await until(h, settled)).toMatchObject(uncontained);
    expect(h.store.researchEvents(h.id).events.at(-1)).toMatchObject({ from: 'packaging', to: 'not_ready', cause: 'WORKSPACE_NOT_CONTAINED' });
    expect(h.seen.filter(s => s.kind === 'create')).toEqual([]);
  }, 180000);
}

test('a kit tool over a junction at the workspace root or at storage/review/<id> is refused before its child, and so is one swapped in at its start', async () => {
  // Guards: the kit tools' containment check, before the inventory and inside each child's guarded start.
  for (const level of ['project', 'job'] as const) {
    const h = await harness();
    await begin(h);
    await junctionAt(h, level);
    await expect(h.review.reviewTool(h.runId!, 'research_preflight', {}, 'epoch')).rejects.toThrow('REVIEW_TOOL_FAILED');
    await expect(h.review.reviewTool(h.runId!, 'research_draft_brief', {}, 'epoch')).rejects.toThrow('REVIEW_TOOL_FAILED');
    expect(h.seen.filter(s => s.kind === 'preflight' || s.kind === 'brief')).toEqual([]);

    const swapped = await harness();
    await begin(swapped);
    let started = 0; let done = false;
    swapped.hooks.beforeCheck = async (_request, kind) => { if (kind === 'preflight' && !done) { done = true; await junctionAt(swapped, level); } };
    swapped.hooks.whileRunning = (_request, kind) => { if (kind === 'preflight') started++; };
    await expect(swapped.review.reviewTool(swapped.runId!, 'research_preflight', {}, 'epoch')).rejects.toThrow('REVIEW_TOOL_FAILED');
    expect(done).toBe(true); expect(started).toBe(0);
  }
}, 180000);

test('a retry over a junction: at the workspace root it is not continued but replaced, at storage/review/<id> it is refused; neither touches the moved tree', async () => {
  // Guards: start continues only a contained workspace, and refuses a job folder that is a link (PATH_OUTSIDE_PROJECT).
  for (const level of ['project', 'job'] as const) {
    const h = await harness();
    await begin(h); await rewriteFinding(h);
    h.store.appendEvent(h.runId!, 'run.failed', {}, { status: 'failed', finishedAt: at });
    h.store.transitionResearch({ researchId: h.id, expectedRevision: h.store.getResearch(h.id)!.revision, to: 'not_ready', actor: 'engine', cause: 'REVIEW_RUN_FAILED', patch: { failure: 'REVIEW_RUN_FAILED' } });
    const sibling = await junctionAt(h, level);
    const tree = level === 'project' ? sibling : join(sibling, 'project');
    const before = await ofTree(tree);
    if (level === 'project') {
      await begin(h);
      expect(h.begins.at(-1)).toMatchObject({ workspace: 'fresh' });
      expect((await lstat(h.project)).isSymbolicLink()).toBe(false);
      expect(await treeInventory(h.project)).toEqual((await readPackage(fixtureBytes)).base);
    } else {
      await expect(h.review.start(h.id, 'm')).rejects.toThrow('PATH_OUTSIDE_PROJECT');
      expect(h.begins).toHaveLength(1);
      expect(await readdir(sibling)).toEqual(['project']);
    }
    expect(await ofTree(tree)).toEqual(before);
  }
}, 180000);
