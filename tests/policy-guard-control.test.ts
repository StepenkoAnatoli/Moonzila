import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { Store } from '../src/engine/store';
import { Application } from '../src/engine/application';
import { createControl } from '../src/engine/control-dispatch';
import { ControlSchema, PolicyGuardResultSchema, SessionProjectResultSchema } from '../src/engine/control';
import type { Run } from '../src/shared';

// The engine reads behind main's policy route (P4-10): `policy.guard` and `session.project` answer from one SQL read
// each, with no run list or history, so a project or session with more runs than any renderer result can carry works.
const roots: string[] = []; const stores: Store[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
const at = '2026-10-04T00:00:00.000Z';
const MANY = 10_001;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'moonzila-guard-')); roots.push(root);
  const store = new Store(join(root, 'state.sqlite')); stores.push(store);
  store.putProject({ id: 'p1', rootPath: root, pathLabel: root, name: 'Example', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'off' }, missing: false, createdAt: at });
  store.putProfile({ id: 'profile1', name: 'Local', kind: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'test', contextTokens: 8192, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'v1', createdAt: at, updatedAt: at });
  store.putSession({ id: 's1', projectId: 'p1', policy: { revision: 0, inference: 'cloud-allowed' }, title: 'Work', createdAt: at, updatedAt: at });
  store.putSession({ id: 'chat', projectId: null, title: 'Chat', createdAt: at, updatedAt: at });
  const app = new Application(store, { infer: async () => ({ content: '', outcome: 'complete' }), publish: () => {} });
  const dispatch = createControl(store, app);
  const control = (input: unknown) => dispatch(ControlSchema.parse(input));
  const run = (id: string, mode: Run['mode'], status: Run['status'], sessionId = 's1') => store.putRun({ id, projectId: 'p1', sessionId, mode, status, profileId: 'profile1', profileRevisionId: 'v1', policyRevision: 1, trustRevision: 1, createdAt: at });
  const history = () => store.transaction(() => { for (let i = 0; i < MANY; i++) run(`done-${i}`, 'build', i % 2 ? 'completed' : 'cancelled'); });
  return { store, control, run, history };
}

test(`policy.guard answers for a project with ${MANY} finished runs: the stored inference, and no live non-research run`, async () => {
  const { control, history } = fixture(); history();
  expect(PolicyGuardResultSchema.parse(await control({ method: 'policy.guard', projectId: 'p1' }))).toEqual({ revision: 1, inference: 'local-only', nonResearchRunActive: false });
});

test('policy.guard reports an unfinished non-research run among many finished ones, and ignores unfinished review runs', async () => {
  const { control, history, run } = fixture(); history();
  run('review', 'research', 'awaiting_review');
  expect(await control({ method: 'policy.guard', projectId: 'p1' })).toEqual({ revision: 1, inference: 'local-only', nonResearchRunActive: false });
  run('build', 'build', 'cancelling');
  expect(await control({ method: 'policy.guard', projectId: 'p1' })).toEqual({ revision: 1, inference: 'local-only', nonResearchRunActive: true });
});

test('policy.guard counts every unfinished status and no finished one', async () => {
  for (const status of ['queued', 'running', 'awaiting_approval', 'awaiting_review', 'cancelling'] as const) {
    const { control, run } = fixture(); run('r', 'ask', status);
    expect(await control({ method: 'policy.guard', projectId: 'p1' })).toEqual({ revision: 1, inference: 'local-only', nonResearchRunActive: true });
  }
  for (const status of ['completed', 'failed', 'cancelled', 'interrupted'] as const) {
    const { control, run } = fixture(); run('r', 'ask', status);
    expect(await control({ method: 'policy.guard', projectId: 'p1' })).toEqual({ revision: 1, inference: 'local-only', nonResearchRunActive: false });
  }
});

test('policy.guard is null for a missing project', async () => {
  const { control } = fixture();
  expect(PolicyGuardResultSchema.parse(await control({ method: 'policy.guard', projectId: 'missing' }))).toBeNull();
});

test(`session.project answers for a session with ${MANY} runs, for a folder-free chat, and null for a missing session`, async () => {
  const { control, history } = fixture(); history();
  expect(SessionProjectResultSchema.parse(await control({ method: 'session.project', sessionId: 's1' }))).toEqual({ projectId: 'p1' });
  expect(SessionProjectResultSchema.parse(await control({ method: 'session.project', sessionId: 'chat' }))).toEqual({ projectId: null });
  expect(SessionProjectResultSchema.parse(await control({ method: 'session.project', sessionId: 'missing' }))).toBeNull();
});

test('policy.guard ignores an unfinished Build run in another project', async () => {
  const { store, control } = fixture();
  store.putProject({ ...store.getProject('p1')!, id: 'p2', name: 'Other' });
  store.putSession({ id: 'other', projectId: 'p2', policy: { revision: 0, inference: 'cloud-allowed' }, title: 'Other', createdAt: at, updatedAt: at });
  store.putRun({ id: 'elsewhere', projectId: 'p2', sessionId: 'other', mode: 'build', status: 'running', profileId: 'profile1', profileRevisionId: 'v1', policyRevision: 1, trustRevision: 1, createdAt: at });
  expect(await control({ method: 'policy.guard', projectId: 'p1' })).toEqual({ revision: 1, inference: 'local-only', nonResearchRunActive: false });
  expect(await control({ method: 'policy.guard', projectId: 'p2' })).toEqual({ revision: 1, inference: 'local-only', nonResearchRunActive: true });
});

test('policy.guard returns the stored policy revision, so main can refuse a stale expectedRevision first', async () => {
  const { store, control } = fixture();
  store.putProject({ ...store.getProject('p1')!, policy: { revision: 7, inference: 'cloud-allowed', research: 'public-technical' } });
  expect(PolicyGuardResultSchema.parse(await control({ method: 'policy.guard', projectId: 'p1' }))).toEqual({ revision: 7, inference: 'cloud-allowed', nonResearchRunActive: false });
});
