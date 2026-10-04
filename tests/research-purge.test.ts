import { afterAll, beforeAll, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import provenance from './fixtures/research-kit/provenance.json';
import { ResearchKit } from '../src/adapters/research-kit/adapter';
import type { OwnedRunner } from '../src/tools/commands';
import { Store, type StoreResearchStatus } from '../src/engine/store';
import { Application } from '../src/engine/application';
import { createControl } from '../src/engine/control-dispatch';
import { ControlSchema, ResearchRetainedResultSchema, type Control } from '../src/engine/control';
import { MethodSpec, ResearchPurgeResultSchema } from '../src/shared/params';
import { parseRequest } from '../src/shared/protocol';
import { purgeResearch, type PurgeDeps } from '../src/main/research-purge';
import { readResearchDocument, type DocumentDeps } from '../src/main/research-document';

// research.purge (docs/specification/research-purge.md, unit B7a) against the real Store and the engine's own control
// dispatch, the real ResearchKit adapter running the pinned kit with node, and the collected and approved fixture
// packages. Every path stays inside this file's own mkdtemp root; every Store is closed before the root is removed.
let root: string; let nodeSha256: string; let collectedBytes: Buffer; let approvedBytes: Buffer;
const kitRoot = resolve('.build/research-kit-external/research-kit');
const collectedFixture = resolve('tests/fixtures/research-kit/collected.zip');
const approvedFixture = resolve('tests/fixtures/research-kit/approved.zip');
const at = '2026-10-04T00:00:00.000Z';
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const runner: OwnedRunner = async (request, signal, options = {}) => {
  if (signal?.aborted) throw new Error('RUN_CANCELLED');
  await options.beforeStart?.(); options.onStarted?.({ pid: 4242, createdAt: '1' });
  return new Promise(done => execFile(request.executable, request.args, { cwd: request.cwd, env: request.env, timeout: request.timeoutMs, maxBuffer: request.maxOutputBytes, encoding: 'utf8' },
    (error, stdout) => done({ status: 'exited', code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, output: stdout, truncated: false, cancelled: false, timedOut: false })));
};

interface World { folder: string; store: Store; control(control: Control): Promise<unknown>; kit: ResearchKit; storage: string; artifacts: string; unlinks: string[]; fault?: (path: string, attempt: number) => NodeJS.ErrnoException | undefined }
// Fabricated jobs take run ids from 100 on; the provenance job's is the fixtures' own, 1.
let count = 0; let runIds = 100;
const stores: Store[] = []; const kits: ResearchKit[] = [];
async function world(): Promise<World> {
  const folder = join(root, `w${++count}`); await mkdir(folder);
  const store = new Store(join(folder, 'state.sqlite')); stores.push(store);
  store.putProfile({ id: 'm', name: 'Local', kind: 'ollama', endpoint: 'http://localhost:11434', model: 'test', contextTokens: 8192, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'pv', createdAt: at, updatedAt: at });
  const app = new Application(store, { infer: async () => ({ content: '', outcome: 'complete' }), publish: () => {} });
  const dispatch = createControl(store, app);
  const storage = join(folder, 'storage');
  const w: World = { folder, store, control: control => dispatch(ControlSchema.parse(control)), kit: undefined as unknown as ResearchKit, storage, artifacts: join(storage, 'artifacts'), unlinks: [] };
  // The unlink seam: every delete is recorded, and `fault` can answer a delete with an error instead (EBUSY/EPERM).
  const attempts = new Map<string, number>();
  w.kit = new ResearchKit({ kitRoot, nodePath: process.execPath, nodeSha256, storageRoot: storage, helperPath: resolve('.build/native/MoonAlizaHost.exe') }, runner, {
    unlink: async path => {
      const attempt = (attempts.get(path) ?? 0) + 1; attempts.set(path, attempt); w.unlinks.push(path);
      const error = w.fault?.(path, attempt); if (error) throw error;
      await unlink(path);
    },
  });
  kits.push(w.kit);
  return w;
}
const deps = (w: World, overrides: Partial<PurgeDeps> = {}): PurgeDeps => ({ control: control => w.control(control), kit: w.kit, ...overrides });
const purge = async (w: World, id: string, overrides: Partial<PurgeDeps> = {}) => ResearchPurgeResultSchema.parse(await purgeResearch(deps(w, overrides), id));
async function refusal(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => { throw new Error('expected a refusal'); }, (error: unknown) => (error as Error).message);
}
const zip = (w: World, sha: string) => join(w.artifacts, `${sha}.zip`);
const exists = (path: string) => lstat(path).then(() => true, () => false);
/** An unreferenced ZIP in the store: arbitrary bytes under their own digest's name. */
async function plant(w: World, label = randomUUID()): Promise<string> {
  const bytes = Buffer.from(`orphan ${label}`); const sha = digest(bytes);
  await mkdir(w.artifacts, { recursive: true }); await writeFile(zip(w, sha), bytes);
  return sha;
}

// ------------------------------------------------------------------ jobs, built through the store's own transitions

const PATHS: Record<StoreResearchStatus, StoreResearchStatus[]> = {
  queued: [], dispatching: ['dispatching'], collecting: ['dispatching', 'collecting'], collected: ['dispatching', 'collecting', 'collected'],
  reviewing: ['dispatching', 'collecting', 'collected', 'reviewing'], packaging: ['dispatching', 'collecting', 'collected', 'reviewing', 'packaging'],
  not_ready: ['dispatching', 'collecting', 'collected', 'reviewing', 'not_ready'], approved: ['dispatching', 'collecting', 'collected', 'reviewing', 'packaging', 'approved'],
  cancelling: ['dispatching', 'cancelling'], cancelled: ['dispatching', 'cancelling', 'cancelled'], failed: ['failed'],
};
interface JobOptions { project?: string; clientRef?: string; collected?: { sha: string; bytes: number; real?: { validatorRevision: string; state: string } }; reviewed?: { sha: string; validatorRevision: string }; via?: StoreResearchStatus[]; workflowRunId?: string }
function step(w: World, id: string, to: StoreResearchStatus, actor: 'main' | 'user', patch: object, cause = 'TEST_STEP') {
  return w.store.transitionResearch({ researchId: id, expectedRevision: w.store.getResearch(id)!.revision, to, actor, cause, patch } as Parameters<Store['transitionResearch']>[0]);
}
/** A job in `to`, through the real edges; each job gets its own project unless one is named (one active job per project). */
function job(w: World, id: string, to: StoreResearchStatus, options: JobOptions = {}): void {
  const project = options.project ?? `p-${id}`;
  if (!w.store.getProject(project)) w.store.putProject({ id: project, name: project, rootPath: join(w.folder, project), pathLabel: project, trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'public-technical' }, missing: false, createdAt: at });
  w.store.createResearch({ id, projectId: project, topic: 'Fixture topic', inputs: { queries: [], urls: [], preferDomains: [], depth: 'quick', maxPages: 8 }, clientRef: options.clientRef ?? `mz-${id}`, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
  advance(w, id, options.via ?? PATHS[to], options);
}
function advance(w: World, id: string, path: StoreResearchStatus[], options: JobOptions = {}) {
  let runId: string | undefined;
  for (const to of path) {
    const current = w.store.getResearch(id)!;
    if (to === 'dispatching') step(w, id, to, 'main', { target: { collectorRevision: 1, repository: provenance.identity.repository, workflow: 'collect.yml', ref: provenance.identity.ref } });
    else if (to === 'collecting') step(w, id, to, 'main', { workflowRunId: options.workflowRunId ?? String(++runIds) });
    else if (to === 'collected') {
      const collected = options.collected ?? { sha: digest(`collected ${id}`), bytes: 1 };
      step(w, id, to, 'main', { verification: { artifactSha256: collected.sha, artifactBytes: collected.bytes, validatorRevision: collected.real?.validatorRevision ?? 'a'.repeat(40), nodeSha256: collected.real ? nodeSha256 : 'b'.repeat(64),
        state: collected.real?.state ?? 'REVIEW_REQUIRED', jobRevision: current.revision, projectRevision: 1, repository: provenance.identity.repository, ref: provenance.identity.ref, workflow: provenance.identity.workflow,
        commit: provenance.identity.commit, runAttempt: 1, workflowRunId: current.workflowRunId, clientRef: current.clientRef, downloadDigest: 'unverified' } });
    } else if (to === 'reviewing') {
      runId = randomUUID(); const sessionId = randomUUID();
      w.store.putSession({ id: sessionId, projectId: current.projectId, title: 'Review', createdAt: at, updatedAt: at });
      w.store.putRun({ id: runId, sessionId, projectId: current.projectId, mode: 'research', status: 'running', profileId: 'm', profileRevisionId: 'pv', policyRevision: 1, trustRevision: 1, createdAt: at });
      step(w, id, to, 'user', { reviewRunId: runId, reviewSessionId: sessionId, workspace: 'fresh' }, 'REVIEW_STARTED');
    } else if (to === 'packaging') step(w, id, to, 'main', { reviewDigest: 'c'.repeat(64) }, 'WORKSPACE_FROZEN');
    else if (to === 'not_ready') { w.store.appendEvent(runId!, 'run.completed', {}, { status: 'completed', finishedAt: at }); step(w, id, to, 'main', { failure: 'REVIEW_RUN_FAILED' }); }
    else if (to === 'approved') {
      w.store.appendEvent(runId!, 'run.completed', {}, { status: 'completed', finishedAt: at });
      const reviewed = options.reviewed ?? { sha: digest(`reviewed ${id}`), validatorRevision: 'a'.repeat(40) };
      step(w, id, to, 'main', { reviewedPackage: { sha256: reviewed.sha, validatorRevision: reviewed.validatorRevision, boundRevision: current.revision } }, 'KIT_APPROVED');
    } else if (to === 'cancelling') step(w, id, to, 'user', {});
    else if (to === 'cancelled') { if (current.reviewRunId) w.store.appendEvent(current.reviewRunId, 'run.cancelled', {}, { status: 'cancelled', finishedAt: at }); step(w, id, to, 'main', {}); }
    else if (to === 'failed') step(w, id, to, 'main', { failure: 'DISPATCH_FAILED' });
  }
}
/** The provenance job: collected.zip imported through the kit (a real receipt), recorded on collecting -> collected. */
async function realCollected(w: World, id: string, project = 'p') {
  job(w, id, 'collecting', { project, clientRef: provenance.identity.clientRef, workflowRunId: String(provenance.identity.workflowRunId) });
  const revision = w.store.getResearch(id)!.revision;
  const imported = await w.kit.validate(collectedFixture, { projectId: project, projectRevision: 1, jobId: id, jobRevision: revision, ...provenance.identity });
  expect(imported).toMatchObject({ status: 'PASS' });
  advance(w, id, ['collected'], { collected: { sha: digest(collectedBytes), bytes: collectedBytes.length, real: { validatorRevision: imported.receipt!.validatorRevision, state: imported.state! } } });
  return { receipt: imported.receipt!, binding: { projectId: project, projectRevision: 1, jobId: id, jobRevision: revision, ...provenance.identity } };
}
/** The provenance job carried on to approved, approved.zip validated under the packaging revision's binding. */
async function realApproved(w: World, id: string, project = 'p') {
  const collected = await realCollected(w, id, project);
  advance(w, id, ['reviewing', 'packaging']);
  const bound = w.store.getResearch(id)!.revision;
  const binding = { projectId: project, projectRevision: 1, jobId: id, jobRevision: bound, ...provenance.identity };
  const result = await w.kit.validate(approvedFixture, binding);
  expect(result).toMatchObject({ status: 'PASS', state: 'APPROVED_BRIEF', researchReady: true });
  const runId = w.store.getResearch(id)!.reviewRunId!;
  w.store.appendEvent(runId, 'run.completed', {}, { status: 'completed', finishedAt: at });
  step(w, id, 'approved', 'main', { reviewedPackage: { sha256: digest(approvedBytes), validatorRevision: result.receipt!.validatorRevision, boundRevision: bound } }, 'KIT_APPROVED');
  return { collected, approved: { receipt: result.receipt!, binding } };
}
function documents(w: World, overrides: Partial<DocumentDeps> = {}): DocumentDeps {
  return { control: control => w.control(control), kit: w.kit, reviewRoot: join(w.storage, 'review'), redact: async text => text, ...overrides };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'moonzila-purge-'));
  nodeSha256 = digest(await readFile(process.execPath));
  collectedBytes = await readFile(collectedFixture); approvedBytes = await readFile(approvedFixture);
});
afterAll(async () => {
  for (const kit of kits) await kit.close().catch(() => {});
  for (const store of stores) store.close();
  if (root) { const rel = relative(resolve(tmpdir()), root); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ research.retained (engine control)

test('research.retained: every job with its status, the collected digest from the collecting -> collected journal row, and the reviewed digest', async () => {
  // Guard: the collected digest is read from the journal's verification (mutation: answer null for it).
  const w = await world();
  job(w, 'q', 'queued'); job(w, 'c', 'collected', { collected: { sha: '1'.repeat(64), bytes: 10 } });
  job(w, 'a', 'approved', { collected: { sha: '2'.repeat(64), bytes: 10 }, reviewed: { sha: '3'.repeat(64), validatorRevision: 'a'.repeat(40) } });
  job(w, 'x', 'cancelled', { via: ['dispatching', 'collecting', 'collected', 'reviewing', 'cancelling', 'cancelled'], collected: { sha: '4'.repeat(64), bytes: 10 } });
  const retained = ResearchRetainedResultSchema.parse(await w.control({ method: 'research.retained' }));
  expect(new Map(retained.jobs.map(item => [item.id, item]))).toEqual(new Map([
    ['q', { id: 'q', projectId: 'p-q', status: 'queued', collected: null, reviewed: null }],
    ['c', { id: 'c', projectId: 'p-c', status: 'collected', collected: '1'.repeat(64), reviewed: null }],
    ['a', { id: 'a', projectId: 'p-a', status: 'approved', collected: '2'.repeat(64), reviewed: '3'.repeat(64) }],
    ['x', { id: 'x', projectId: 'p-x', status: 'cancelled', collected: '4'.repeat(64), reviewed: null }],
  ]));
});

test('research.retained and research.purge\'s internals are unreachable from the renderer; research.purge takes no path', () => {
  // Guards: research.retained is not in MethodSpec, and research.purge's params are the strict { researchId } (S-1).
  expect(Object.keys(MethodSpec)).not.toContain('research.retained');
  expect(() => parseRequest({ method: 'research.retained', clientRequestId: 'r1', params: {} })).toThrow();
  expect(MethodSpec['research.purge'].owner).toBe('main');
  expect(MethodSpec['research.purge'].params.safeParse({ researchId: 'j' }).success).toBe(true);
  for (const extra of [{ path: '/tmp/x.zip' }, { digest: 'a'.repeat(64) }, { storage: '/tmp' }]) expect(MethodSpec['research.purge'].params.safeParse({ researchId: 'j', ...extra }).success).toBe(false);
});

// ------------------------------------------------------------------ which jobs

test('each status: approved, failed and cancelled are purged; collected, not_ready and every active status are PURGE_NOT_ALLOWED and delete nothing', async () => {
  // Guard: the status check (mutation: allow every status, or check it after the deletes).
  const w = await world();
  const allowed: StoreResearchStatus[] = ['approved', 'failed', 'cancelled'];
  const refused: StoreResearchStatus[] = ['collected', 'not_ready', 'queued', 'dispatching', 'collecting', 'reviewing', 'packaging', 'cancelling'];
  for (const status of [...allowed, ...refused]) job(w, status, status);
  // Its own ZIP: the refused job's collected digest, present in the store, must survive the refusal.
  for (const status of refused) {
    const sha = ResearchRetainedResultSchema.parse(await w.control({ method: 'research.retained' })).jobs.find(item => item.id === status)!.collected;
    if (sha) { await mkdir(w.artifacts, { recursive: true }); await writeFile(zip(w, sha), status); }
    expect(await refusal(purge(w, status)), status).toBe('PURGE_NOT_ALLOWED');
    if (sha) expect(await exists(zip(w, sha)), status).toBe(true);
  }
  expect(w.unlinks).toEqual([]);
  for (const status of allowed) expect(await purge(w, status), status).toMatchObject({ keptShared: 0 });
});

test('an unknown job is NOT_FOUND, and without an installed kit the purge is RESEARCH_KIT_UNAVAILABLE', async () => {
  const w = await world(); job(w, 'gone', 'cancelled');
  expect(await refusal(purge(w, 'missing'))).toBe('NOT_FOUND');
  expect(await refusal(purge(w, 'gone', { kit: null }))).toBe('RESEARCH_KIT_UNAVAILABLE');
});

// ------------------------------------------------------------------ what is deleted

test('approved: both its ZIPs are removed, the job and its journal stay, the reader answers Unverified, and the receipts are forgotten', async () => {
  // Guards: receipts of every deleted digest forgotten (mutation: keep them - readVerified then serves the re-planted
  // bytes); the job and journal untouched (mutation: any engine write).
  const w = await world(); const real = await realApproved(w, 'j1');
  expect(await readResearchDocument(documents(w), 'j1', 'brief')).toMatchObject({ source: 'reviewed', verified: true });
  const before = { job: w.store.getResearch('j1'), events: w.store.researchEvents('j1', 0, 1000).events };
  expect(await purge(w, 'j1')).toEqual({ removed: 2, keptShared: 0, keptBusy: false });
  expect(await exists(zip(w, digest(collectedBytes)))).toBe(false); expect(await exists(zip(w, digest(approvedBytes)))).toBe(false);
  expect({ job: w.store.getResearch('j1'), events: w.store.researchEvents('j1', 0, 1000).events }).toEqual(before);
  expect(await readResearchDocument(documents(w), 'j1', 'brief')).toEqual({ text: '', truncated: false, source: 'reviewed', verified: false });
  // The same bytes back under the same names: a receipt the purge kept would serve them again; a forgotten one cannot.
  await writeFile(zip(w, digest(collectedBytes)), collectedBytes); await writeFile(zip(w, digest(approvedBytes)), approvedBytes);
  await expect(w.kit.readVerified(real.collected.receipt.id, real.collected.binding)).rejects.toThrow('STALE_VERIFICATION');
  await expect(w.kit.readVerified(real.approved.receipt.id, real.approved.binding)).rejects.toThrow('STALE_VERIFICATION');
}, 120000);

test('a digest another job references is kept (keptShared), its receipt stays, and the other job\'s reader still verifies', async () => {
  // Guard: a digest of the purged job is deleted only when no other job references it (mutation: delete all of the job's).
  const w = await world(); const real = await realCollected(w, 'j1');
  // A cancelled job whose journal names the same collected package.
  job(w, 'x', 'cancelled', { via: ['dispatching', 'collecting', 'collected', 'reviewing', 'cancelling', 'cancelled'], collected: { sha: digest(collectedBytes), bytes: collectedBytes.length } });
  expect(await purge(w, 'x')).toEqual({ removed: 0, keptShared: 1, keptBusy: false });
  expect(await exists(zip(w, digest(collectedBytes)))).toBe(true);
  expect(await readResearchDocument(documents(w), 'j1', 'brief')).toMatchObject({ source: 'collected', verified: true });
  expect((await w.kit.readVerified(real.receipt.id, real.binding)).equals(collectedBytes)).toBe(true);
}, 120000);

test('orphans: kept with keptBusy while any job is active, removed once none is; a referenced ZIP is never an orphan', async () => {
  // Guard: orphans deleted only with no job in ACTIVE_RESEARCH (mutation: ignore activity, or count only the purged project).
  const w = await world();
  job(w, 'done', 'cancelled'); job(w, 'other', 'collected', { collected: { sha: '9'.repeat(64), bytes: 1 } });
  const orphan = await plant(w); await writeFile(zip(w, '9'.repeat(64)), 'referenced by a collected job');
  for (const active of ['queued', 'dispatching', 'collecting', 'reviewing', 'packaging', 'cancelling'] as const) {
    job(w, `active-${active}`, active);
    expect(await purge(w, 'done'), active).toEqual({ removed: 0, keptShared: 0, keptBusy: true });
    expect(await exists(zip(w, orphan)), active).toBe(true);
    // Ended, so the next status is the only active job.
    const ended = w.store.getResearch(`active-${active}`)!.status;
    if (ended === 'queued') advance(w, `active-${active}`, ['failed']);
    else if (ended === 'cancelling') advance(w, `active-${active}`, ['cancelled']);
    else advance(w, `active-${active}`, ['cancelling', 'cancelled']);
  }
  expect(await purge(w, 'done')).toEqual({ removed: 1, keptShared: 0, keptBusy: false });
  expect(await exists(zip(w, orphan))).toBe(false);
  expect(await exists(zip(w, '9'.repeat(64)))).toBe(true);
  // Nothing left to keep: keptBusy says unreferenced ZIPs were kept, not merely that a job is active.
  job(w, 'late', 'queued');
  expect(await purge(w, 'done')).toEqual({ removed: 0, keptShared: 0, keptBusy: false });
});

test('only <64 hex>.zip regular files are deleted: a link, a folder, a non-zip name and an uppercase digest in artifacts/ are left and never followed', async () => {
  // Guards: the name pattern and the lstat regular-file check (mutations: delete any unreferenced entry; skip the lstat).
  const w = await world(); job(w, 'done', 'cancelled');
  const orphan = await plant(w);
  const outside = join(w.folder, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep.txt'), 'kept');
  const link = zip(w, '5'.repeat(64)); await symlink(outside, link, 'junction');
  const folder = zip(w, '6'.repeat(64)); await mkdir(folder); await writeFile(join(folder, 'inside.txt'), 'kept');
  const others = [join(w.artifacts, 'notes.txt'), join(w.artifacts, `${'7'.repeat(64)}.zip.tmp`), join(w.artifacts, `${'A'.repeat(64)}.zip`), join(w.artifacts, `${'8'.repeat(63)}.zip`)];
  for (const file of others) await writeFile(file, 'kept');
  expect(await purge(w, 'done')).toEqual({ removed: 1, keptShared: 0, keptBusy: false });
  expect(await exists(zip(w, orphan))).toBe(false);
  expect((await lstat(link)).isSymbolicLink() || (await realpath(link)) === (await realpath(outside))).toBe(true);
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('kept');
  expect(await readFile(join(folder, 'inside.txt'), 'utf8')).toBe('kept');
  for (const file of others) expect(await readFile(file, 'utf8')).toBe('kept');
  expect(w.unlinks).toEqual([zip(w, orphan)]);
  // Only junk is left: with a job active, nothing unreferenced was kept, so keptBusy is false (the listing's own check).
  job(w, 'active', 'queued');
  expect(await purge(w, 'done')).toEqual({ removed: 0, keptShared: 0, keptBusy: false });
});

test('a listed ZIP swapped for a link before its delete is left, and what the link names is untouched', async () => {
  // Guard: the lstat right before each delete (mutation: delete whatever the listed name holds by then).
  const w = await world(); job(w, 'done', 'cancelled');
  const orphan = await plant(w);
  const outside = join(w.folder, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep.txt'), 'kept');
  // Another actor (not this process: everything here is under the lock) replaces the entry after the listing.
  const control = async (request: Control) => {
    if (request.method === 'research.retained') { await unlink(zip(w, orphan)); await symlink(outside, zip(w, orphan), 'junction'); }
    return w.control(request);
  };
  expect(await purge(w, 'done', { control })).toEqual({ removed: 0, keptShared: 0, keptBusy: false });
  expect(w.unlinks).toEqual([]);
  expect(await realpath(zip(w, orphan))).toBe(await realpath(outside));
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('kept');
});

test('a link in place of artifacts/ itself is RESEARCH_KIT_UNAVAILABLE, and nothing beneath it is listed or deleted', async () => {
  // Guard: the store folder's containment (mutation: list storage/artifacts through a link).
  const w = await world(); job(w, 'done', 'cancelled');
  const elsewhere = join(w.folder, 'elsewhere'); await mkdir(elsewhere);
  const bytes = Buffer.from('elsewhere'); await writeFile(join(elsewhere, `${digest(bytes)}.zip`), bytes);
  await mkdir(w.storage, { recursive: true }); await symlink(elsewhere, w.artifacts, 'junction');
  expect(await refusal(purge(w, 'done'))).toBe('RESEARCH_KIT_UNAVAILABLE');
  expect(await readdir(elsewhere)).toEqual([`${digest(bytes)}.zip`]);
});

test('the status is decided before artifacts/ is listed: with a link there, an unknown job is NOT_FOUND and a collected one PURGE_NOT_ALLOWED', async () => {
  // Guard: decide's refusals come before the listing (review F2; mutation: list storage/artifacts first - every refusal
  // then reads RESEARCH_KIT_UNAVAILABLE).
  const w = await world(); job(w, 'kept', 'collected'); job(w, 'done', 'cancelled');
  const elsewhere = join(w.folder, 'elsewhere'); await mkdir(elsewhere);
  await mkdir(w.storage, { recursive: true }); await symlink(elsewhere, w.artifacts, 'junction');
  expect(await refusal(purge(w, 'missing'))).toBe('NOT_FOUND');
  expect(await refusal(purge(w, 'kept'))).toBe('PURGE_NOT_ALLOWED');
  // A purge that passes the check still refuses the unusable store.
  expect(await refusal(purge(w, 'done'))).toBe('RESEARCH_KIT_UNAVAILABLE');
  expect(w.unlinks).toEqual([]);
});

// ------------------------------------------------------------------ the storage lock

test('an import retaining a ZIP while the purge reads its references is ordered by the storage lock: the new ZIP survives', async () => {
  // Guard: research.retained is read inside the storage lock (mutation: read it first, then take the lock - the import
  // queued in between retains its ZIP, and the stale read calls it an orphan with no job active).
  const w = await world(); job(w, 'done', 'cancelled');
  let importing: Promise<unknown> | undefined;
  const control = async (request: Control) => {
    const reply = await w.control(request);
    if (request.method === 'research.retained' && !importing) {
      // Right after the read: a new job starts and its import validates and retains collected.zip.
      job(w, 'new', 'collecting', { project: 'p', clientRef: provenance.identity.clientRef, workflowRunId: String(provenance.identity.workflowRunId) });
      importing = w.kit.validate(collectedFixture, { projectId: 'p', projectRevision: 1, jobId: 'new', jobRevision: w.store.getResearch('new')!.revision, ...provenance.identity });
    }
    return reply;
  };
  expect(await purge(w, 'done', { control })).toEqual({ removed: 0, keptShared: 0, keptBusy: false });
  expect(await importing).toMatchObject({ status: 'PASS' });
  expect(await exists(zip(w, digest(collectedBytes)))).toBe(true);
}, 120000);

test('a purge racing the reader\'s verifyRetained of the same digest runs entirely after it: the read verifies, the next one is Unverified', async () => {
  // Guard: verifyRetained's validation and read are one locked step (mutation: two lock acquisitions - the purge then
  // slips between them, deletes the file and forgets the receipt, and the reader cannot check: RESEARCH_KIT_UNAVAILABLE).
  const w = await world(); await realApproved(w, 'j1');
  let purging: Promise<unknown> | undefined;
  const kit: DocumentDeps['kit'] = { verifyRetained: (sha, binding) => w.kit.verifyRetained(sha, binding, undefined, async () => { purging ??= purge(w, 'j1'); }) };
  expect(await readResearchDocument(documents(w, { kit }), 'j1', 'brief')).toMatchObject({ source: 'reviewed', verified: true });
  expect(await purging).toEqual({ removed: 2, keptShared: 0, keptBusy: false });
  expect(await readResearchDocument(documents(w), 'j1', 'brief')).toEqual({ text: '', truncated: false, source: 'reviewed', verified: false });
}, 120000);

// ------------------------------------------------------------------ Windows: a delete another handle blocks

const busy = (code: 'EBUSY' | 'EPERM') => Object.assign(new Error(`${code}: resource busy or locked`), { code });

test('a delete refused once with EBUSY or EPERM is retried once and succeeds', async () => {
  // Guard: the single retry (mutation: no retry - the first refusal fails the purge).
  for (const code of ['EBUSY', 'EPERM'] as const) {
    const w = await world(); job(w, 'done', 'cancelled'); const orphan = await plant(w);
    w.fault = (_path, attempt) => attempt === 1 ? busy(code) : undefined;
    expect(await purge(w, 'done'), code).toEqual({ removed: 1, keptShared: 0, keptBusy: false });
    expect(w.unlinks, code).toEqual([zip(w, orphan), zip(w, orphan)]);
  }
});

test('a delete still refused after its retry is PURGE_INCOMPLETE: what was deleted stays deleted, its receipt is forgotten, the rest is kept with its receipt', async () => {
  // Guards: exactly one retry (mutation: retry forever, or give up at once); receipts forgotten for the deletes that
  // happened before the failure and only for them (mutations: forget none on failure; forget every target's).
  const w = await world(); const real = await realApproved(w, 'j1');
  const [first, second] = [zip(w, digest(collectedBytes)), zip(w, digest(approvedBytes))];
  // The first ZIP the purge deletes goes; the second is held open by another handle for good.
  const order: string[] = [];
  w.fault = path => { if (!order.includes(path)) order.push(path); return order.indexOf(path) === 1 ? busy('EBUSY') : undefined; };
  // P5-5: another program holds the file; the kit is fine, so the answer is not RESEARCH_KIT_UNAVAILABLE.
  expect(await refusal(purge(w, 'j1'))).toBe('PURGE_INCOMPLETE');
  const [deleted, blocked] = order as [string, string];
  expect(new Set(order)).toEqual(new Set([first, second]));
  expect(await exists(deleted)).toBe(false); expect(await exists(blocked)).toBe(true);
  expect(w.unlinks).toEqual([deleted, blocked, blocked]);
  const receipts = new Map([[first, real.collected], [second, real.approved]]);
  await writeFile(deleted, deleted === first ? collectedBytes : approvedBytes);
  await expect(w.kit.readVerified(receipts.get(deleted)!.receipt.id, receipts.get(deleted)!.binding)).rejects.toThrow('STALE_VERIFICATION');
  expect((await w.kit.readVerified(receipts.get(blocked)!.receipt.id, receipts.get(blocked)!.binding)).length).toBeGreaterThan(0);
}, 120000);

test('a delete refused for any other reason, at once or on the retry, is the store\'s fault: RESEARCH_KIT_UNAVAILABLE, not PURGE_INCOMPLETE', async () => {
  // Guard: only EBUSY/EPERM after the retry is PURGE_INCOMPLETE (mutation: every failed delete is PURGE_INCOMPLETE).
  for (const [first, second] of [['EIO', undefined], ['EBUSY', 'EIO']] as const) {
    const w = await world(); job(w, 'done', 'cancelled'); const orphan = await plant(w);
    w.fault = (_path, attempt) => { const code = attempt === 1 ? first : second; return code ? Object.assign(new Error(code), { code }) : undefined; };
    expect(await refusal(purge(w, 'done')), `${first}/${second}`).toBe('RESEARCH_KIT_UNAVAILABLE');
    expect(await exists(zip(w, orphan))).toBe(true);
  }
});
