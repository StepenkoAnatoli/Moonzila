import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { Store } from '../src/engine/store';
import { Application } from '../src/engine/application';
import type { Run } from '../src/shared';

// The engine's re-check of the research switch (docs/specification/research-review-ui.md section 4, step 4): a caller
// other than main's route cannot stop a non-research run by changing only `research`.
const roots: string[] = []; const stores: Store[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
const at = '2026-10-04T00:00:00.000Z';
const request = (method: string, params: unknown, id: string) => ({ protocolVersion: 1, clientRequestId: id, method, params });

function fixture(mode: Run['mode'], status: Run['status'] = 'running') {
  const root = mkdtempSync(join(tmpdir(), 'moonzila-policy-')); roots.push(root);
  const store = new Store(join(root, 'state.sqlite')); stores.push(store);
  store.putProject({ id: 'p1', rootPath: root, pathLabel: root, name: 'Example', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'cloud-allowed', research: 'off' }, missing: false, createdAt: at });
  store.putProfile({ id: 'profile1', name: 'Local', kind: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'test', contextTokens: 8192, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'v1', createdAt: at, updatedAt: at });
  store.putSession({ id: 's1', projectId: 'p1', policy: { revision: 0, inference: 'cloud-allowed' }, title: 'Work', createdAt: at, updatedAt: at });
  const run: Run = { id: 'r1', projectId: 'p1', sessionId: 's1', sessionPolicyRevision: 0, mode, status, profileId: 'profile1', profileRevisionId: 'v1', policyRevision: 1, trustRevision: 1, createdAt: at };
  store.putRun(run);
  const app = new Application(store, { infer: async () => ({ content: 'Answer', outcome: 'complete' }), publish: () => {} });
  return { store, app };
}
const update = (inference: 'local-only' | 'cloud-allowed', research: 'off' | 'public-technical', id = 'u1') => request('project.policy.update', { projectId: 'p1', expectedRevision: 1, policy: { inference, research } }, id);

test('the engine refuses a research-only change sent to it directly while a Build run is active, and changes nothing', async () => {
  const { store, app } = fixture('build');
  await expect(app.handle(update('cloud-allowed', 'public-technical'))).rejects.toThrow('RUN_ACTIVE');
  expect(store.getProject('p1')?.policy).toEqual({ revision: 1, inference: 'cloud-allowed', research: 'off' });
  expect(store.getRun('r1')?.status).toBe('running');
});

test('the engine refuses it for every non-terminal non-research run, including one awaiting approval', async () => {
  const { app } = fixture('ask', 'awaiting_approval');
  await expect(app.handle(update('cloud-allowed', 'public-technical'))).rejects.toThrow('RUN_ACTIVE');
});

test('a research-only change with only a review run active goes through', async () => {
  const { store, app } = fixture('research', 'awaiting_review');
  const result = await app.handle(update('cloud-allowed', 'public-technical')) as { project: { policy: unknown } };
  expect(result.project.policy).toEqual({ revision: 2, inference: 'cloud-allowed', research: 'public-technical' });
  expect(store.getProject('p1')?.policy.research).toBe('public-technical');
});

test('an inference change keeps today\'s behaviour while a Build run is active', async () => {
  const { store, app } = fixture('build');
  await app.handle(update('local-only', 'public-technical'));
  expect(store.getProject('p1')?.policy).toEqual({ revision: 2, inference: 'local-only', research: 'public-technical' });
});

test('a finished Build run does not block a research-only change', async () => {
  const { store, app } = fixture('build', 'completed');
  await app.handle(update('cloud-allowed', 'public-technical'));
  expect(store.getProject('p1')?.policy.research).toBe('public-technical');
});
