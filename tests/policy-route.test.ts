import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { Store } from '../src/engine/store';
import { Application } from '../src/engine/application';
import { createControl } from '../src/engine/control-dispatch';
import { ControlSchema, engineFailureCode } from '../src/engine/control';
import { createPolicyRoute, type ActiveRun } from '../src/main/policy-route';
import { parseRequest, type Request, type Run } from '../src/shared';

// Main's route for `project.policy.update` and `run.start` (docs/specification/research-review-ui.md section 4,
// "Never while other work runs"), through the real route module, with the real engine Application behind it. Only the
// vault and the two supervisors are recorded doubles.
const roots: string[] = []; const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
const at = '2026-10-04T00:00:00.000Z';
let sequence = 0;
const request = <M extends Request['method']>(method: M, params: unknown) => parseRequest({ protocolVersion: 1, clientRequestId: `req-${++sequence}`, method, params }) as Extract<Request, { method: M }>;
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
/** Lets every pending promise chain and timer-free I/O settle; never a timed wait. */
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'moonzila-route-')); roots.push(root);
  const store = new Store(join(root, 'state.sqlite'));
  store.putProject({ id: 'p1', rootPath: root, pathLabel: root, name: 'Example', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'cloud-allowed', research: 'off' }, missing: false, createdAt: at });
  store.putProfile({ id: 'profile1', name: 'Local', kind: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'test', contextTokens: 8192, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'v1', createdAt: at, updatedAt: at });
  store.putSession({ id: 's1', projectId: 'p1', policy: { revision: 0, inference: 'cloud-allowed' }, title: 'Work', createdAt: at, updatedAt: at });
  store.putSession({ id: 's2', projectId: 'p1', policy: { revision: 0, inference: 'cloud-allowed' }, title: 'Review: topic', createdAt: at, updatedAt: at });
  // A started run's model step waits until it is stopped, so the run stays live for the whole test.
  const app = new Application(store, { publish() {}, infer: (_run, _messages, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('RUN_CANCELLED')), { once: true })) });
  cleanups.push(async () => { await app.shutdown(); store.close(); });
  const forwarded: string[] = []; const controls: string[] = []; const gates = new Map<string, Promise<void>>();
  const dispatch = createControl(store, app);
  const active = new Map<string, ActiveRun>();
  const revoked: string[] = []; const held: string[] = []; const released: string[] = [];
  const route = createPolicyRoute({
    async request(input) {
      forwarded.push(input.method);
      await gates.get(input.method);
      try { return await app.handle(input); } catch (error) { throw new Error(engineFailureCode(error), { cause: error }); }
    },
    // A control failure crosses the process boundary as its bare code, as the engine entry maps it.
    async control(input) { controls.push(input.method); try { return await dispatch(ControlSchema.parse(input)); } catch (error) { throw new Error(engineFailureCode(error), { cause: error }); } },
    active,
    revokeContext: runId => { revoked.push(runId); },
    holdCollector: projectId => { held.push(`collector:${projectId}`); return () => { released.push(`collector:${projectId}`); }; },
    holdReview: projectId => { held.push(`review:${projectId}`); return () => { released.push(`review:${projectId}`); }; },
    commandsExecuting: () => false,
    admit: run => { active.set(run.id, { run, stop: new AbortController() }); },
  });
  const liveRun = (id: string, sessionId: string, mode: Run['mode'], status: Run['status'] = 'running') => {
    const run: Run = { id, projectId: 'p1', sessionId, sessionPolicyRevision: 0, mode, status, profileId: 'profile1', profileRevisionId: 'v1', policyRevision: 1, trustRevision: 1, createdAt: at };
    store.putRun(run); const stop = new AbortController(); active.set(id, { run, stop }); return stop.signal;
  };
  const update = (inference: 'local-only' | 'cloud-allowed', research: 'off' | 'public-technical', expectedRevision = store.getProject('p1')!.policy.revision, clientRequestId?: string) => {
    const built = request('project.policy.update', { projectId: 'p1', expectedRevision, policy: { inference, research } });
    return clientRequestId ? { ...built, clientRequestId } : built;
  };
  /** Many finished runs in one session: more than any renderer result can carry (P4-10). */
  const history = (sessionId: string, count = 10_001) => store.transaction(() => { for (let i = 0; i < count; i++) store.putRun({ id: `done-${sessionId}-${i}`, projectId: 'p1', sessionId, mode: 'build', status: 'completed', profileId: 'profile1', profileRevisionId: 'v1', policyRevision: 1, trustRevision: 1, createdAt: at }); });
  return { store, app, route, active, revoked, held, released, forwarded, controls, gates, liveRun, update, history };
}

test('a research-only change during a Build run is refused in main before anything is stopped', async () => {
  const { store, route, revoked, held, forwarded, liveRun, update } = fixture();
  const signal = liveRun('build1', 's1', 'build');
  await expect(route.updatePolicy(update('cloud-allowed', 'public-technical'))).rejects.toThrow('RUN_ACTIVE');
  expect(signal.aborted).toBe(false);
  expect(revoked).toEqual([]);
  expect(held).toEqual([]);
  expect(store.getRun('build1')?.status).toBe('running');
  expect(store.getProject('p1')?.policy).toEqual({ revision: 1, inference: 'cloud-allowed', research: 'off' });
  expect(forwarded).not.toContain('project.policy.update');
});

test('turning research off during a review run goes through, and stops the review as today', async () => {
  const { store, route, revoked, held, released, liveRun, update } = fixture();
  store.putProject({ ...store.getProject('p1')!, policy: { revision: 1, inference: 'cloud-allowed', research: 'public-technical' } });
  const signal = liveRun('review1', 's2', 'research', 'awaiting_review');
  await route.updatePolicy(update('cloud-allowed', 'off'));
  expect(store.getProject('p1')?.policy).toEqual({ revision: 2, inference: 'cloud-allowed', research: 'off' });
  expect(signal.aborted).toBe(true);
  expect(revoked).toEqual(['review1']);
  expect(held).toEqual(['collector:p1', 'review:p1']);
  expect(released).toEqual(['collector:p1', 'review:p1']);
});

test('an inference change still stops every run, a Build run included', async () => {
  const { store, route, revoked, held, released, liveRun, update } = fixture();
  const build = liveRun('build1', 's1', 'build'); const review = liveRun('review1', 's2', 'research');
  await route.updatePolicy(update('local-only', 'public-technical'));
  expect(store.getProject('p1')?.policy).toEqual({ revision: 2, inference: 'local-only', research: 'public-technical' });
  expect(build.aborted).toBe(true); expect(review.aborted).toBe(true);
  expect(revoked.sort()).toEqual(['build1', 'review1']);
  expect(held).toEqual(['collector:p1', 'review:p1']); expect(released).toEqual(['collector:p1', 'review:p1']);
});

test('a run.start issued while a policy update holds the lock is admitted only after the update', async () => {
  const { store, route, active, forwarded, gates, update } = fixture();
  const gate = deferred(); gates.set('project.policy.update', gate.promise);
  const updating = route.updatePolicy(update('cloud-allowed', 'public-technical'));
  await settle();
  expect(forwarded).toContain('project.policy.update');
  const starting = route.startRun(request('run.start', { sessionId: 's1', profileId: 'profile1', mode: 'ask', prompt: 'Explain the project.' }));
  await settle();
  expect(forwarded).not.toContain('run.start');
  gate.resolve();
  await updating;
  const { run } = await starting as { run: Run };
  expect(forwarded.indexOf('run.start')).toBeGreaterThan(forwarded.indexOf('project.policy.update'));
  expect(run.policyRevision).toBe(2);
  expect(active.has(run.id)).toBe(true);
  expect(store.getProject('p1')?.policy.research).toBe('public-technical');
});

test('a research-only change arriving while a run.start holds the lock sees that run and is refused untouched', async () => {
  const { store, route, active, revoked, held, controls, gates, update } = fixture();
  const gate = deferred(); gates.set('run.start', gate.promise);
  const starting = route.startRun(request('run.start', { sessionId: 's1', profileId: 'profile1', mode: 'ask', prompt: 'Explain the project.' }));
  await settle();
  const updating = route.updatePolicy(update('cloud-allowed', 'public-technical'));
  const refused = expect(updating).rejects.toThrow('RUN_ACTIVE');
  await settle();
  // The update waits for the lock: it has not even read the guard yet.
  expect(controls).not.toContain('policy.guard');
  gate.resolve();
  const { run } = await starting as { run: Run };
  await refused;
  expect(active.get(run.id)?.stop.signal.aborted).toBe(false);
  expect(revoked).toEqual([]); expect(held).toEqual([]);
  expect(store.getProject('p1')?.policy.research).toBe('off');
});

test('run.start keeps refusing RUN_ACTIVE while a command executes in main, without forwarding', async () => {
  const forwarded: string[] = [];
  const route = createPolicyRoute({
    async request(input) { forwarded.push(input.method); throw new Error('unexpected'); },
    async control(input) { forwarded.push(input.method); if (input.method === 'session.project') return { projectId: 'p1' }; throw new Error('unexpected'); },
    active: new Map(), revokeContext() {}, holdCollector: () => () => {}, holdReview: () => () => {}, commandsExecuting: () => true, admit() {},
  });
  await expect(route.startRun(request('run.start', { sessionId: 's1', profileId: 'profile1', mode: 'ask', prompt: 'Hi' }))).rejects.toThrow('RUN_ACTIVE');
  expect(forwarded).not.toContain('run.start');
});

test('a research-only update and a run.start work in a project whose session holds 10001 finished runs', async () => {
  const { store, route, active, history, update } = fixture();
  history('s1');
  await route.updatePolicy(update('cloud-allowed', 'public-technical'));
  expect(store.getProject('p1')?.policy).toEqual({ revision: 2, inference: 'cloud-allowed', research: 'public-technical' });
  const { run } = await route.startRun(request('run.start', { sessionId: 's1', profileId: 'profile1', mode: 'ask', prompt: 'Explain the project.' })) as { run: Run };
  expect(active.has(run.id)).toBe(true);
});

test('an update reads the engine through request.lookup and policy.guard only, and never through session.read or session.list', async () => {
  const { route, forwarded, controls, history, update } = fixture();
  history('s1', 3); history('s2', 3);
  await route.updatePolicy(update('cloud-allowed', 'public-technical'));
  await route.updatePolicy(update('local-only', 'public-technical'));
  expect(controls).toEqual(['request.lookup', 'policy.guard', 'request.lookup', 'policy.guard']);
  expect(forwarded).toEqual(['project.policy.update', 'project.policy.update']);
});

test('run.start learns its project through session.project only, and a missing session is forwarded for the engine to answer', async () => {
  const { route, forwarded, controls } = fixture();
  await route.startRun(request('run.start', { sessionId: 's1', profileId: 'profile1', mode: 'ask', prompt: 'Explain the project.' }));
  expect(controls).toEqual(['session.project']);
  expect(forwarded).toEqual(['run.start']);
  await expect(route.startRun(request('run.start', { sessionId: 'missing', profileId: 'profile1', mode: 'ask', prompt: 'Hi' }))).rejects.toThrow('SESSION_NOT_FOUND');
  expect(forwarded).toEqual(['run.start', 'run.start']);
});

// BRK-1 (Phase 4 invariant 3, "a refused change has no side effect"): main answers a stale revision and a replay before it
// stops anything, with the engine's own precedence (acceptRequest's replay first, then expectedRevision, then RUN_ACTIVE).
test('BRK-1: a stale expectedRevision during a review run is REQUEST_CONFLICT with nothing stopped', async () => {
  const { store, route, revoked, held, forwarded, liveRun, update } = fixture();
  const signal = liveRun('review1', 's2', 'research');
  await expect(route.updatePolicy(update('cloud-allowed', 'public-technical', 0))).rejects.toThrow('REQUEST_CONFLICT');
  expect(signal.aborted).toBe(false); expect(revoked).toEqual([]); expect(held).toEqual([]);
  expect(store.getRun('review1')?.status).toBe('running');
  expect(store.getProject('p1')?.policy).toEqual({ revision: 1, inference: 'cloud-allowed', research: 'off' });
  expect(forwarded).toEqual([]);
});

test('BRK-1: a stale expectedRevision during a Build run is REQUEST_CONFLICT, as the engine answers it, not RUN_ACTIVE', async () => {
  const { route, revoked, held, liveRun, update } = fixture();
  const signal = liveRun('build1', 's1', 'build');
  await expect(route.updatePolicy(update('cloud-allowed', 'public-technical', 0))).rejects.toThrow('REQUEST_CONFLICT');
  expect(signal.aborted).toBe(false); expect(revoked).toEqual([]); expect(held).toEqual([]);
});

test('BRK-1b: a replay of an applied update returns the stored result and stops no review run begun since', async () => {
  const { store, route, revoked, held, released, forwarded, liveRun, update } = fixture();
  const first = await route.updatePolicy(update('cloud-allowed', 'public-technical', 1, 'same-id'));
  revoked.length = 0; held.length = 0; released.length = 0; forwarded.length = 0;
  const signal = liveRun('review1', 's2', 'research');
  const replayed = await route.updatePolicy(update('cloud-allowed', 'public-technical', 1, 'same-id'));
  expect(replayed).toEqual(first);
  expect(signal.aborted).toBe(false); expect(revoked).toEqual([]); expect(held).toEqual([]);
  expect(store.getRun('review1')?.status).toBe('running');
  expect(store.getProject('p1')?.policy).toEqual({ revision: 2, inference: 'cloud-allowed', research: 'public-technical' });
  expect(forwarded).toEqual(['project.policy.update']);
});

test('BRK-1b: a replay whose revision is now stale still gets the stored result, as the engine replays before it checks', async () => {
  const { route, revoked, held, liveRun, update } = fixture();
  const first = await route.updatePolicy(update('cloud-allowed', 'public-technical', 1, 'same-id'));
  revoked.length = 0; held.length = 0;
  const signal = liveRun('build1', 's1', 'build');
  // The stored revision is now 2 and a Build run is live: neither a conflict nor RUN_ACTIVE, the stored reply.
  expect(await route.updatePolicy(update('cloud-allowed', 'public-technical', 1, 'same-id'))).toEqual(first);
  expect(signal.aborted).toBe(false); expect(revoked).toEqual([]); expect(held).toEqual([]);
});

test('BRK-1b: an id reused with a different input is REQUEST_CONFLICT with nothing stopped', async () => {
  const { store, route, revoked, held, liveRun, update } = fixture();
  await route.updatePolicy(update('cloud-allowed', 'public-technical', 1, 'same-id'));
  revoked.length = 0; held.length = 0;
  const signal = liveRun('review1', 's2', 'research');
  await expect(route.updatePolicy(update('cloud-allowed', 'off', 2, 'same-id'))).rejects.toThrow('REQUEST_CONFLICT');
  expect(signal.aborted).toBe(false); expect(revoked).toEqual([]); expect(held).toEqual([]);
  expect(store.getProject('p1')?.policy.research).toBe('public-technical');
});
