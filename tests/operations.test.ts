import { mkdtempSync, rmSync } from 'node:fs';
import { link, readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { Store } from '../src/engine/store';
import { Operations } from '../src/engine/operations';
import { PublicErrorSchema, type Approval, type RunEvent } from '../src/shared';
import { safeError } from '../src/main/bridge';

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach(fn => fn()));
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'monnzila-operations-'));
  const store = new Store(join(directory, 'state.sqlite')); const now = new Date().toISOString();
  cleanup.push(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  store.putProject({ id: 'p', rootPath: directory, name: 'Project', pathLabel: directory, trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'off' }, missing: false, createdAt: now });
  store.putProfile({ id: 'f', name: 'Model', kind: 'ollama', endpoint: 'http://localhost:11434', model: 'test', contextTokens: 8192, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'v', createdAt: now, updatedAt: now });
  store.putSession({ id: 's', projectId: 'p', title: 'Build', createdAt: now, updatedAt: now });
  store.putRun({ id: 'r', projectId: 'p', sessionId: 's', profileId: 'f', profileRevisionId: 'v', mode: 'build', status: 'running', policyRevision: 1, trustRevision: 1, createdAt: now });
  const events: RunEvent[] = []; let required!: (event: RunEvent) => void;
  const approval = new Promise<RunEvent>(resolve => { required = resolve; });
  const operations = new Operations(store, join(directory, 'snapshots'), [], event => { events.push(event); if (event.type === 'approval.required') required(event); });
  return { store, directory, events, operations, approval };
}
function decision(event: RunEvent, allow = true): Approval {
  if (event.type !== 'approval.required') throw new Error('Wrong event');
  const op = event.payload.operation;
  return { operationId: op.id, projectId: op.projectId, inputHash: op.inputHash, trustRevision: op.trustRevision, policyRevision: op.policyRevision, decision: allow ? 'allow' : 'deny' };
}

test('a proposed edit waits for a bound approval, then becomes a readable change and undo replays safely', async () => {
  const f = fixture(); await writeFile(join(f.directory, 'hello.txt'), 'before');
  const pending = f.operations.write('r', { id: 'call', name: 'edit_file', input: { path: 'hello.txt', search: 'before', replacement: 'after' } }, new AbortController().signal);
  const event = await f.approval; const approved = decision(event);
  expect(await readFile(join(f.directory, 'hello.txt'), 'utf8')).toBe('before');
  const preview = await f.operations.preview('p', approved.operationId);
  if (preview.kind !== 'write') throw new Error('Expected edit');
  expect(preview.before).toBe('before'); expect(preview.after).toBe('after');
  expect(() => f.operations.decide({ ...approved, inputHash: '0'.repeat(64) })).toThrow('APPROVAL_STALE');
  f.operations.decide(approved); f.operations.deliver(approved.operationId); await pending;
  expect(await readFile(join(f.directory, 'hello.txt'), 'utf8')).toBe('after');
  f.store.appendEvent('r', 'run.completed', {}, { status: 'completed' });
  const changes = await f.operations.changes('p'); expect(changes.changes).toHaveLength(1);
  const change = changes.changes[0]!;
  const undone = await f.operations.undo('p', change.id, change.afterHash, 'undo-request');
  expect(undone.change.status).toBe('undone'); expect(await readFile(join(f.directory, 'hello.txt'), 'utf8')).toBe('before');
  await writeFile(join(f.directory, 'hello.txt'), 'user after undo');
  expect((await f.operations.undo('p', change.id, change.afterHash, 'undo-request')).operationId).toBe(undone.operationId);
  expect(await readFile(join(f.directory, 'hello.txt'), 'utf8')).toBe('user after undo');
});

test('cancelling a pending edit leaves disk untouched and invalidates approval', async () => {
  const f = fixture(); await writeFile(join(f.directory, 'hello.txt'), 'before'); const stop = new AbortController();
  const pending = f.operations.write('r', { id: 'call', name: 'write_file', input: { path: 'hello.txt', content: 'after' } }, stop.signal);
  const failed = expect(pending).rejects.toThrow('RUN_CANCELLED');
  const event = await f.approval; stop.abort(); await failed;
  expect(await readFile(join(f.directory, 'hello.txt'), 'utf8')).toBe('before');
  expect(() => f.operations.decide(decision(event))).toThrow('APPROVAL_STALE');
});

test('declining an edit records denial and never writes its proposed bytes', async () => {
  const f = fixture(); await writeFile(join(f.directory, 'hello.txt'), 'before');
  const pending = f.operations.write('r', { id: 'call', name: 'write_file', input: { path: 'hello.txt', content: 'after' } }, new AbortController().signal);
  const failed = expect(pending).rejects.toThrow('APPROVAL_DENIED');
  const denied = decision(await f.approval, false); f.operations.decide(denied); f.operations.deliver(denied.operationId);
  await failed; expect(await readFile(join(f.directory, 'hello.txt'), 'utf8')).toBe('before');
  expect(f.store.listApprovals(denied.operationId)[0]?.decision).toBe('deny');
  expect(f.operations.pending('r').operations).toEqual([]);
});

test('project identity and protected paths cannot be bypassed by model write requests', async () => {
  const f = fixture();
  await expect(f.operations.write('r', { id: 'call', name: 'write_file', input: { path: '.env', content: 'secret' } }, new AbortController().signal)).rejects.toThrow('PATH_OUTSIDE_PROJECT');
  await expect(f.operations.preview('other', 'missing')).rejects.toThrow('NOT_FOUND');
});

test('recovery compares current bytes, keeps conflicts and acknowledges without replaying writes', async () => {
  const f = fixture(); await writeFile(join(f.directory, 'hello.txt'), 'before');
  const op = await f.operations.journal.prepareWrite('r', 'hello.txt', 'after');
  f.store.updateOperation(op.id, { status: 'started' }); f.store.recoverInterrupted();
  const identity = { projectId: 'p', operationId: op.id, inputHash: op.inputHash, trustRevision: 1, policyRevision: 1 };
  expect(f.operations.requiresReview('p')).toBe(true);
  await expect(f.operations.inspectRecovery({ ...identity, inputHash: '0'.repeat(64) }, 'bad')).rejects.toThrow('APPROVAL_STALE');
  expect((await f.operations.inspectRecovery(identity, 'inspect-before')).item.observation).toBe('not-applied');
  expect(f.store.getOperation(op.id)?.status).toBe('unknown');
  await writeFile(join(f.directory, 'hello.txt'), 'my changes');
  expect((await f.operations.inspectRecovery(identity, 'inspect-conflict')).item.observation).toBe('conflict');
  const result = f.operations.acknowledgeRecovery(identity, 'ack');
  expect(result.item.acknowledgedAt).toBeTruthy(); expect(f.operations.requiresReview('p')).toBe(false);
  expect(f.store.protectedSnapshotRefs().size).toBe(0);
  expect(f.operations.acknowledgeRecovery(identity, 'ack')).toEqual(result);
  expect(await readFile(join(f.directory, 'hello.txt'), 'utf8')).toBe('my changes');
  expect(f.store.getOperation(op.id)?.status).toBe('unknown');
});

test('recovered matching edits become completed once, but inspection retries never read or rewrite later files', async () => {
  const f = fixture(); const op = await f.operations.journal.prepareWrite('r', 'hello.txt', 'after');
  f.store.updateOperation(op.id, { status: 'started' }); f.store.recoverInterrupted();
  await writeFile(join(f.directory, 'hello.txt'), 'after');
  const identity = { projectId: 'p', operationId: op.id, inputHash: op.inputHash, trustRevision: 1, policyRevision: 1 };
  const recovered = await f.operations.inspectRecovery(identity, 'inspect');
  expect(recovered.item.operation.status).toBe('completed'); expect(f.operations.requiresReview('p')).toBe(false);
  await writeFile(join(f.directory, 'hello.txt'), 'later');
  expect(await f.operations.inspectRecovery(identity, 'inspect')).toEqual(recovered);
  expect(await readFile(join(f.directory, 'hello.txt'), 'utf8')).toBe('later');
});

test('recovery inspection refuses changed project trust and an active run', async () => {
  const f = fixture(); const op = await f.operations.journal.prepareWrite('r', 'hello.txt', 'after');
  f.store.updateOperation(op.id, { status: 'unknown' });
  const identity = { projectId: 'p', operationId: op.id, inputHash: op.inputHash, trustRevision: 1, policyRevision: 1 };
  await expect(f.operations.inspectRecovery(identity, 'busy')).rejects.toThrow('RUN_ACTIVE');
  f.store.recoverInterrupted(); f.store.putProject({ ...f.store.getProject('p')!, trustRevision: 2 });
  await expect(f.operations.inspectRecovery(identity, 'stale')).rejects.toThrow('APPROVAL_STALE');
  expect(f.operations.requiresReview('p')).toBe(true);
});

test('change listings report expired snapshots before offering undo', async () => {
  const f = fixture(); const op = await f.operations.journal.prepareWrite('r', 'hello.txt', 'after');
  await f.operations.journal.apply(op.id, { operationId: op.id, projectId: 'p', inputHash: op.inputHash, trustRevision: 1, policyRevision: 1, decision: 'allow' });
  f.store.appendEvent('r', 'run.completed', {}, { status: 'completed' });
  expect((await f.operations.changes('p')).changes[0]?.snapshotAvailable).toBe(true);
  await unlink(join(f.directory, 'snapshots', op.afterRef!));
  expect((await f.operations.changes('p')).changes[0]?.snapshotAvailable).toBe(false);
});

test('undo of a file that gained a hard link refuses with a public code and leaves both names untouched', async () => {
  const f = fixture(); const op = await f.operations.journal.prepareWrite('r', 'hello.txt', 'after');
  await f.operations.journal.apply(op.id, { operationId: op.id, projectId: 'p', inputHash: op.inputHash, trustRevision: 1, policyRevision: 1, decision: 'allow' });
  f.store.appendEvent('r', 'run.completed', {}, { status: 'completed' });
  await link(join(f.directory, 'hello.txt'), join(f.directory, 'alias.txt'));
  const change = (await f.operations.changes('p')).changes[0]!;
  let thrown: unknown;
  try { await f.operations.undo('p', change.id, change.afterHash, 'undo-linked'); } catch (error) { thrown = error; }
  // changes.undo reaches the renderer through the bridge, which maps only public codes.
  const error = safeError(thrown);
  expect(error.code).toBe('HARDLINK_REVIEW_REQUIRED');
  expect(PublicErrorSchema.safeParse(error).success).toBe(true);
  expect(await readFile(join(f.directory, 'hello.txt'), 'utf8')).toBe('after');
  expect(await readFile(join(f.directory, 'alias.txt'), 'utf8')).toBe('after');
});
