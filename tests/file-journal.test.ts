import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile, link, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { Store } from '../src/engine/store';
import { FileJournal } from '../src/tools/files';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));
function fixture(limit?: number) {
  const root = mkdtempSync(join(tmpdir(), 'moonzila-files-')); const store = new Store(join(root, 'state.sqlite')); const at = new Date().toISOString();
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  store.putProject({ id: 'p1', name: 'Project', pathLabel: root, rootPath: root, trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'off' }, missing: false, createdAt: at });
  store.putSession({ id: 's1', projectId: 'p1', title: 'Work', createdAt: at, updatedAt: at });
  store.putProfile({ id: 'f1', name: 'Local', kind: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'test', locality: 'local', contextTokens: 4096, outputTokens: 512, revision: 1, revisionId: 'v1', createdAt: at, updatedAt: at });
  store.putRun({ id: 'r1', sessionId: 's1', projectId: 'p1', profileId: 'f1', profileRevisionId: 'v1', mode: 'build', status: 'running', policyRevision: 1, trustRevision: 1, createdAt: at });
  return { root, store, journal: new FileJournal(store, join(root, 'snapshots'), limit) };
}
const approve = (operation: { id: string; projectId: string; inputHash: string; policyRevision: number; trustRevision: number }) => ({ operationId: operation.id, projectId: operation.projectId, inputHash: operation.inputHash, policyRevision: operation.policyRevision, trustRevision: operation.trustRevision, decision: 'allow' as const });

test('snapshot quota protects a complete pending proposal and refuses further writes without mutation', async () => {
  const { root, store, journal } = fixture(11); await writeFile(join(root, 'hello.txt'), 'before');
  const pending = await journal.prepareWrite('r1', 'hello.txt', 'after');
  expect(store.protectedSnapshotRefs().size).toBe(2);
  await expect(journal.prepareWrite('r1', 'other.txt', 'more')).rejects.toThrow('SNAPSHOT_QUOTA');
  expect(store.listOperations('r1')).toHaveLength(1);
  expect(await journal.readSnapshot(pending.beforeRef!)).toBe('before');
  expect(await journal.readSnapshot(pending.afterRef!)).toBe('after');
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe('before');
  store.updateOperation(pending.id, { status: 'started' }); store.recoverInterrupted();
  expect(store.protectedSnapshotRefs().size).toBe(2);
});

test('restart retires approvals that never started and releases their snapshot protection', async () => {
  const { store, journal } = fixture(); const pending = await journal.prepareWrite('r1', 'hello.txt', 'after');
  store.recoverInterrupted();
  expect(store.getOperation(pending.id)?.status).toBe('failed');
  expect(store.protectedSnapshotRefs().size).toBe(0);
  await expect(journal.apply(pending.id, approve(pending))).rejects.toThrow('OPERATION_NOT_PREPARED');
});

test('proposals never mutate files; approved writes retain the before snapshot', async () => {
  const { root, store, journal } = fixture(); await writeFile(join(root, 'hello.txt'), 'before');
  const operation = await journal.prepareWrite('r1', 'hello.txt', 'after');
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe('before');
  await journal.apply(operation.id, approve(operation));
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe('after');
  expect(store.getOperation(operation.id)?.status).toBe('completed');
  expect(await journal.readSnapshot(operation.beforeRef!)).toBe('before');
});

test('an edit after review becomes a conflict instead of overwriting the user', async () => {
  const { root, journal } = fixture(); await writeFile(join(root, 'hello.txt'), 'before');
  const operation = await journal.prepareWrite('r1', 'hello.txt', 'after');
  await writeFile(join(root, 'hello.txt'), 'user edit');
  await expect(journal.apply(operation.id, approve(operation))).rejects.toThrow('FILE_CONFLICT');
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe('user edit');
});

test('revoked trust and cancellation invalidate already reviewed proposals', async () => {
  const { root, store, journal } = fixture();
  const operation = await journal.prepareWrite('r1', 'new.txt', 'content');
  const controller = new AbortController(); controller.abort();
  await expect(journal.apply(operation.id, approve(operation), controller.signal)).rejects.toThrow('RUN_CANCELLED');
  store.putProject({ ...store.getProject('p1')!, trusted: false, trustRevision: 2 });
  await expect(journal.apply(operation.id, approve(operation))).rejects.toThrow('PROJECT_UNTRUSTED');
  await expect(readFile(join(root, 'new.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('mismatched approvals cannot authorize content and completed operations are not replayed', async () => {
  const { journal } = fixture(); const operation = await journal.prepareWrite('r1', 'new.txt', 'content');
  await expect(journal.apply(operation.id, { ...approve(operation), inputHash: 'different' })).rejects.toThrow('APPROVAL_STALE');
  await journal.apply(operation.id, approve(operation));
  await expect(journal.apply(operation.id, approve(operation))).rejects.toThrow('OPERATION_NOT_PREPARED');
});

test('automatic file operations refuse hard-linked files', async () => {
  const { root, journal } = fixture(); await writeFile(join(root, 'original.txt'), 'before'); await link(join(root, 'original.txt'), join(root, 'alias.txt'));
  await expect(journal.prepareWrite('r1', 'alias.txt', 'after')).rejects.toThrow('HARDLINK_REVIEW_REQUIRED');
});

test('undo after a finished run restores exact bytes and journals its own operation', async () => {
  const { root, store, journal } = fixture();
  const original = '\ufeffbefore\r\nsecond\r\n'; await writeFile(join(root, 'hello.txt'), original);
  const write = await journal.prepareWrite('r1', 'hello.txt', 'after'); await journal.apply(write.id, approve(write));
  store.appendEvent('r1', 'run.completed', {}, { status: 'completed' });
  const undo = await journal.prepareUndo(write.id, write.afterRef!);
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe('after');
  expect(undo.id).not.toBe(write.id);
  await journal.apply(undo.id, approve(undo));
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe(original);
  expect(store.getOperation(undo.id)?.status).toBe('completed');
  await expect(journal.prepareUndo(write.id, write.afterRef!)).rejects.toThrow('UNDO_UNAVAILABLE');
});

test('undo of creation removes only the unchanged created file', async () => {
  const { root, store, journal } = fixture(); const write = await journal.prepareWrite('r1', 'new.txt', 'created');
  await journal.apply(write.id, approve(write)); store.appendEvent('r1', 'run.completed', {}, { status: 'completed' });
  const undo = await journal.prepareUndo(write.id, write.afterRef!); await journal.apply(undo.id, approve(undo));
  await expect(readFile(join(root, 'new.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('undo refuses active runs, changed files and cross-project approvals', async () => {
  const { root, store, journal } = fixture(); await writeFile(join(root, 'hello.txt'), 'original');
  const write = await journal.prepareWrite('r1', 'hello.txt', 'after'); await journal.apply(write.id, approve(write));
  await expect(journal.prepareUndo(write.id, write.afterRef!)).rejects.toThrow('RUN_ACTIVE');
  store.appendEvent('r1', 'run.completed', {}, { status: 'completed' });
  await expect(journal.prepareUndo(write.id, '0'.repeat(64))).rejects.toThrow('FILE_CONFLICT');
  const undo = await journal.prepareUndo(write.id, write.afterRef!);
  await expect(journal.apply(undo.id, { ...approve(undo), projectId: 'another' })).rejects.toThrow('APPROVAL_STALE');
  await writeFile(join(root, 'hello.txt'), 'user edit');
  await expect(journal.apply(undo.id, approve(undo))).rejects.toThrow('FILE_CONFLICT');
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe('user edit');
});

test('recovery observes applied, unchanged and conflicting files without replaying a write', async () => {
  const { root, store, journal } = fixture(); await writeFile(join(root, 'hello.txt'), 'before');
  const operation = await journal.prepareWrite('r1', 'hello.txt', 'after');
  store.updateOperation(operation.id, { status: 'unknown' });
  store.appendEvent('r1', 'run.interrupted', {}, { status: 'interrupted' });
  expect(await journal.reconcile(operation.id)).toBe('not-applied');
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe('before');
  await writeFile(join(root, 'hello.txt'), 'user');
  expect(await journal.reconcile(operation.id)).toBe('conflict');
  expect(store.getOperation(operation.id)?.status).toBe('unknown');
  await writeFile(join(root, 'hello.txt'), 'after');
  expect(await journal.reconcile(operation.id)).toBe('applied');
  expect(store.getOperation(operation.id)?.status).toBe('completed');
});

test('undo reports unavailable when its snapshot was evicted and preserves the file', async () => {
  const { root, store, journal } = fixture(); await writeFile(join(root, 'hello.txt'), 'before');
  const write = await journal.prepareWrite('r1', 'hello.txt', 'after'); await journal.apply(write.id, approve(write));
  store.appendEvent('r1', 'run.completed', {}, { status: 'completed' });
  await unlink(join(root, 'snapshots', write.beforeRef!));
  await expect(journal.prepareUndo(write.id, write.afterRef!)).rejects.toThrow('UNDO_UNAVAILABLE');
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe('after');
});

test('exact editing preserves BOM and dominant newlines and rejects ambiguous matches', async () => {
  const { root, journal } = fixture(); await writeFile(join(root, 'hello.txt'), '\ufefffirst\r\nold\r\nlast\r\n');
  const operation = await journal.prepareEdit('r1', 'hello.txt', 'old\n', 'new\nextra\n');
  await journal.apply(operation.id, approve(operation));
  expect(await readFile(join(root, 'hello.txt'), 'utf8')).toBe('\ufefffirst\r\nnew\r\nextra\r\nlast\r\n');
  await expect(journal.prepareEdit('r1', 'hello.txt', 'missing', 'other')).rejects.toThrow('EDIT_MATCH_NOT_UNIQUE');
  await writeFile(join(root, 'hello.txt'), 'same same');
  await expect(journal.prepareEdit('r1', 'hello.txt', 'same', 'other')).rejects.toThrow('EDIT_MATCH_NOT_UNIQUE');
});
