import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Store } from '../src/engine/store';

const at = '2026-09-24T12:00:00.000Z';
let directory: string;
let path: string;
let store: Store;

function seed(projectId = 'p1', sessionId = 's1', runId = 'r1') {
  store.putProject({ id: projectId, name: projectId, rootPath: `C:\\work\\${projectId}`, pathLabel: projectId, trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'off' }, missing: false, createdAt: at });
  store.putSession({ id: sessionId, projectId, title: 'Session', createdAt: at, updatedAt: at });
  if (!store.getProfile('profile1')) store.putProfile({ id: 'profile1', name: 'Local', kind: 'ollama', endpoint: 'http://localhost:11434', model: 'test', contextTokens: 8192, outputTokens: 2048, locality: 'local', revision: 1, revisionId: 'profile1-v1', createdAt: at, updatedAt: at });
  store.putRun({ id: runId, projectId, sessionId, mode: 'ask', status: 'running', profileId: 'profile1', profileRevisionId: 'profile1-v1', policyRevision: 1, trustRevision: 1, createdAt: at });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'moonzila-store-'));
  path = join(directory, 'state.sqlite');
  store = new Store(path);
});

afterEach(() => {
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('durable SQLite store', () => {
  test('persists monotonically increasing per-run events across reopening', () => {
    seed();
    expect(store.appendEvent('r1', 'run.started', {}).seq).toBe(1);
    store.close();
    store = new Store(path);
    expect(store.appendEvent('r1', 'run.completed', {}, { status: 'completed', finishedAt: at }).seq).toBe(2);
    expect(store.events('r1', 1, 100).events.map(event => event.type)).toEqual(['run.completed']);
    expect(store.getRun('r1')?.status).toBe('completed');
  });

  test('enables durable journal settings and rejects dangling references', () => {
    seed();
    const inspection = new Database(path);
    expect(inspection.pragma('journal_mode', { simple: true })).toBe('wal');
    inspection.close();
    expect(() => store.putSession({ id: 'orphan', projectId: 'absent', title: 'No project', createdAt: at, updatedAt: at })).toThrow();
  });

  test('rolls back state changes, sequence allocation and events together', () => {
    seed();
    expect(() => store.transaction(() => {
      store.appendEvent('r1', 'run.completed', {}, { status: 'completed', finishedAt: at });
      throw new Error('disk write failed');
    })).toThrow('disk write failed');
    expect(store.getRun('r1')?.status).toBe('running');
    expect(store.events('r1', 0, 100).events).toEqual([]);
    expect(store.appendEvent('r1', 'run.started', {}).seq).toBe(1);
  });

  test('returns an accepted result after a lost reply without creating another run', () => {
    seed();
    const request = { method: 'run.start', clientRequestId: 'request1', canonicalInputHash: 'hash1' };
    expect(store.acceptRequest(request, () => {
      store.appendEvent('r1', 'run.accepted', {});
      return { entityId: 'r1', response: { runId: 'r1' } };
    })).toEqual({ entityId: 'r1', response: { runId: 'r1' }, replayed: false });
    store.close();
    store = new Store(path);
    const accepted = store.acceptRequest(request, () => { throw new Error('must not repeat'); });
    expect(accepted).toEqual({ entityId: 'r1', response: { runId: 'r1' }, replayed: true });
    expect(store.events('r1', 0, 100).events).toHaveLength(1);
    expect(() => store.acceptRequest({ ...request, canonicalInputHash: 'different' }, () => ({ entityId: 'r2', response: {} }))).toThrow(/request.*reused/i);
    expect(() => store.acceptRequest({ ...request, method: 'session.delete' }, () => ({ entityId: 's1', response: {} }))).toThrow(/request.*reused/i);
  });

  test('does not record an accepted request when its state transaction fails', () => {
    seed();
    const request = { method: 'run.start', clientRequestId: 'request1', canonicalInputHash: 'hash1' };
    expect(() => store.acceptRequest(request, () => {
      store.appendEvent('r1', 'run.accepted', {});
      throw new Error('acceptance interrupted');
    })).toThrow('acceptance interrupted');
    expect(store.acceptRequest(request, () => ({ entityId: 'r1', response: { accepted: true } })).replayed).toBe(false);
    expect(store.events('r1', 0, 100).events).toHaveLength(0);
  });

  test('refuses a newer schema before changing the database', () => {
    store.close();
    const future = new Database(path);
    future.pragma('user_version = 9999');
    future.exec('CREATE TABLE future_record (value TEXT); INSERT INTO future_record VALUES (\'retained\')');
    future.close();
    expect(() => new Store(path)).toThrow(/newer.*schema|schema.*newer/i);
    const inspection = new Database(path, { readonly: true });
    expect(inspection.pragma('user_version', { simple: true })).toBe(9999);
    expect(inspection.prepare('SELECT value FROM future_record').get()).toEqual({ value: 'retained' });
    inspection.close();
  });

  test('isolates search by project and optional session', () => {
    seed();
    seed('p2', 's2', 'r2');
    store.putSession({ id: 's3', projectId: 'p1', title: 'Other session', createdAt: at, updatedAt: at });
    for (const [id, sessionId, content] of [['m1', 's1', 'quasar alpha'], ['m2', 's2', 'quasar private'], ['m3', 's3', 'quasar beta']]) {
      store.appendMessage({ id: id!, sessionId: sessionId!, role: 'user', content: content!, createdAt: at });
    }
    expect(store.searchHistory('p1', 'quasar').map(message => message.id).sort()).toEqual(['m1', 'm3']);
    expect(store.searchHistory('p1', 'quasar', { sessionId: 's1' }).map(message => message.id)).toEqual(['m1']);
    expect(store.searchHistory('p1', 'quasar', { sessionId: 's2' })).toEqual([]);
  });

  test('session deletion cascades through history, events, operations and continuation state', () => {
    seed();
    store.appendMessage({ id: 'm1', sessionId: 's1', runId: 'r1', role: 'assistant', content: 'quasar', createdAt: at });
    store.putWireState('m1', 'profile1-v1', { signature: 'native-signature' });
    store.appendEvent('r1', 'text.delta', { text: 'quasar' });
    store.putOperation({ id: 'op1', runId: 'r1', projectId: 'p1', kind: 'write', inputHash: 'hash', policyRevision: 1, trustRevision: 1, status: 'prepared', input: { relativePath: 'a.txt' }, createdAt: at, updatedAt: at });
    store.putApproval({ id: 'a1', operationId: 'op1', projectId: 'p1', inputHash: 'hash', policyRevision: 1, trustRevision: 1, decision: 'allow', createdAt: at });
    store.deleteSession('s1');
    expect(store.getSession('s1')).toBeUndefined();
    expect(store.getRun('r1')).toBeUndefined();
    expect(store.getOperation('op1')).toBeUndefined();
    expect(store.getApproval('a1')).toBeUndefined();
    expect(store.getWireState('m1', 'profile1-v1')).toBeUndefined();
    expect(store.searchHistory('p1', 'quasar')).toEqual([]);
    expect(store.events('r1', 0, 100).events).toEqual([]);
  });

  test('paginates ten thousand events without skipping a committed event', () => {
    seed();
    store.transaction(() => {
      for (let index = 0; index < 10000; index += 1) store.appendEvent('r1', 'text.delta', { text: `${index}` });
    });
    const first = store.events('r1', 0, 100);
    expect(first.events).toHaveLength(100);
    expect(first.nextSeq).toBe(100);
    expect(first.hasMore).toBe(true);
    const last = store.events('r1', 9900, 100);
    expect(last.events[0]?.seq).toBe(9901);
    expect(last.events.at(-1)?.seq).toBe(10000);
    expect(last.hasMore).toBe(false);
  });

  test('recovery interrupts active runs and marks started external effects unknown', () => {
    seed();
    const common = { runId: 'r1', projectId: 'p1', inputHash: 'hash', policyRevision: 1, trustRevision: 1, input: {}, createdAt: at, updatedAt: at };
    store.putOperation({ ...common, id: 'started', kind: 'command', status: 'started' });
    store.putOperation({ ...common, id: 'done', kind: 'write', status: 'completed', result: { written: true } });
    store.putOperation({ ...common, id: 'prepared', kind: 'research', status: 'prepared' });
    store.close();
    store = new Store(path);
    expect(store.recoverInterrupted()).toEqual({ interruptedRunIds: ['r1'], unknownOperationIds: ['started'] });
    expect(store.getRun('r1')?.status).toBe('interrupted');
    expect(store.getOperation('started')?.status).toBe('unknown');
    expect(store.getOperation('done')?.status).toBe('completed');
    expect(store.getOperation('prepared')?.status).toBe('prepared');
    expect(store.events('r1', 0, 100).events.map(event => event.type)).toEqual(['operation.unknown', 'run.interrupted']);
    expect(store.recoverInterrupted()).toEqual({ interruptedRunIds: [], unknownOperationIds: [] });
  });

  test('retains immutable profile revisions and isolates native continuation from visible messages', () => {
    seed();
    store.appendMessage({ id: 'm1', sessionId: 's1', runId: 'r1', role: 'assistant', content: 'Visible text', createdAt: at });
    store.putWireState('m1', 'profile1-v1', { signature: 'private-native-data' });
    expect(store.listMessages('s1')[0]).not.toHaveProperty('wireState');
    expect(store.getWireState('m1', 'profile1-v1')).toEqual({ signature: 'private-native-data' });
    expect(() => store.getWireState('m1', 'profile1-v2')).toThrow(/profile.*revision/i);
    const first = store.getProfile('profile1')!;
    store.putProfile({ ...first, revision: 2, revisionId: 'profile1-v2', model: 'new-model' });
    expect(store.getProfileRevision('profile1-v1')?.model).toBe('test');
    expect(store.getProfile('profile1')?.model).toBe('new-model');
    expect(() => store.putProfile({ ...first, model: 'silently-modified' })).toThrow(/immutable/i);
    store.deleteProfile('profile1');
    expect(store.getProfile('profile1')).toBeUndefined();
    expect(store.getProfileRevision('profile1-v1')?.model).toBe('test');
  });

  test('rejects messages and operations that bind another projects run', () => {
    seed();
    seed('p2', 's2', 'r2');
    expect(() => store.appendMessage({ id: 'bad-message', sessionId: 's1', runId: 'r2', role: 'user', content: 'cross-project', createdAt: at })).toThrow();
    expect(() => store.putOperation({ id: 'bad-operation', projectId: 'p1', runId: 'r2', kind: 'read', inputHash: 'hash', policyRevision: 1, trustRevision: 1, status: 'prepared', input: {}, createdAt: at, updatedAt: at })).toThrow();
  });

  test('persists mission, research, settings and operation result records', () => {
    seed();
    store.putMission({ id: 'mission1', projectId: 'p1', title: 'Build', status: 'paused', revision: 1, state: { tasks: ['t1'] }, createdAt: at, updatedAt: at });
    store.createResearch({ id: 'research1', projectId: 'p1', topic: 'Topic', inputs: { queries: [] }, clientRef: 'mz-research1', researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
    store.transitionResearch({ researchId: 'research1', expectedRevision: 1, to: 'cancelled', actor: 'user', cause: 'CANCEL_REQUESTED' });
    store.setSettings({ theme: 'dark', modelStepLimit: 24 });
    store.putOperation({ id: 'op1', runId: 'r1', projectId: 'p1', kind: 'write', inputHash: 'hash', policyRevision: 1, trustRevision: 1, status: 'prepared', input: { path: 'a' }, beforeRef: 'sha-before', afterRef: 'sha-after', snapshotRef: 'snapshot1', createdAt: at, updatedAt: at });
    store.updateOperation('op1', { status: 'started' });
    store.updateOperation('op1', { status: 'completed', result: { changed: true } });
    store.close();
    store = new Store(path);
    expect(store.listMissions('p1')[0]?.state).toEqual({ tasks: ['t1'] });
    expect(store.listResearch('p1')[0]).toMatchObject({ status: 'cancelled', revision: 2, inputs: { queries: [] } });
    expect(store.getSettings()).toEqual({ theme: 'dark', modelStepLimit: 24 });
    expect(store.getOperation('op1')).toMatchObject({ status: 'completed', result: { changed: true }, snapshotRef: 'snapshot1' });
    store.deleteProject('p1');
    expect(store.listProjects()).toEqual([]);
    expect(store.listSessions('p1')).toEqual([]);
    expect(store.listMissions('p1')).toEqual([]);
    expect(store.listResearch('p1')).toEqual([]);
    expect(store.researchEvents('research1').events).toEqual([]);
  });
});
