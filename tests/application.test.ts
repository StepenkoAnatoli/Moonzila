import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { Store } from '../src/engine/store';
import { Application } from '../src/engine/application';

const roots: string[] = []; const stores: Store[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'moonzila-app-')); roots.push(root);
  const store = new Store(join(root, 'state.sqlite')); stores.push(store);
  const at = new Date().toISOString();
  store.putProject({ id: 'p1', rootPath: root, pathLabel: root, name: 'Example', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'off' }, missing: false, createdAt: at });
  store.putProfile({ id: 'profile1', name: 'Local', kind: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'test', contextTokens: 8192, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'v1', createdAt: at, updatedAt: at });
  const app = new Application(store, { infer: async () => ({ content: 'Answer', outcome: 'complete' }), publish: () => {} });
  return { store, app, root };
}
const request = (method: string, params: unknown, id: string) => ({ protocolVersion: 1, clientRequestId: id, method, params });

test('large tool results remain saved and can be paged without overflowing the model request', async () => {
  const { store, root } = fixture();
  writeFileSync(join(root, 'large.txt'), 'A'.repeat(25000) + 'TAIL_EVIDENCE');
  let steps = 0; let reference = '';
  const app = new Application(store, { publish() {}, async infer(_run, messages, _signal, tools) {
    steps++;
    if (steps === 1) return { content: '', outcome: 'tool_calls', toolCalls: [{ id: 'large-read', name: 'read_file', input: { path: 'large.txt' } }] };
    if (steps === 2) {
      const excerpt = JSON.parse(messages.at(-1)!.content); reference = excerpt.resultId;
      expect(excerpt.compacted).toBe(true); expect(reference).toBeTruthy();
      expect(messages.at(-1)!.content.length).toBeLessThan(5000);
      expect(tools?.some(tool => tool.name === 'read_tool_result')).toBe(true);
      return { content: '', outcome: 'tool_calls', toolCalls: [{ id: 'retrieve', name: 'read_tool_result', input: { resultId: reference, offset: 24000, length: 2048 } }] };
    }
    expect(messages.at(-1)!.content).toContain('TAIL_EVIDENCE');
    return { content: 'Retrieved the end of the original result.', outcome: 'complete', usage: { inputTokens: 712, outputTokens: 15 } };
  } });
  const { session } = await app.handle(request('session.create', { projectId: 'p1' }, 'create')) as { session: { id: string } };
  const { run } = await app.handle(request('run.start', { sessionId: session.id, profileId: 'profile1', mode: 'ask', prompt: 'Read the large file.' }, 'start')) as { run: { id: string } };
  await app.whenIdle();
  expect(store.getRun(run.id)?.status).toBe('completed'); expect(steps).toBe(3);
  expect(store.listMessages(session.id).find(m => m.id === reference)?.content).toContain('A'.repeat(25000));
  const history = await app.handle(request('session.read', { sessionId: session.id }, 'read')) as { context: { compactedToolResults: number }; usage: { inputTokens: number }; failure: unknown };
  expect(history.context.compactedToolResults).toBeGreaterThan(0); expect(history.usage.inputTokens).toBe(712); expect(history.failure).toBeNull();
});

test('an oversized prompt fails before inference and persists an actionable context report', async () => {
  const { store } = fixture(); let invoked = false;
  const app = new Application(store, { publish() {}, async infer() { invoked = true; return { content: '', outcome: 'complete' }; } });
  const { session } = await app.handle(request('session.create', { projectId: 'p1' }, 'create')) as { session: { id: string } };
  await app.handle(request('run.start', { sessionId: session.id, profileId: 'profile1', mode: 'ask', prompt: '漢'.repeat(18000) }, 'start'));
  await app.whenIdle();
  expect(invoked).toBe(false);
  const result = await app.handle(request('session.read', { sessionId: session.id }, 'read')) as { context: { estimatedInputTokens: number; inputBudgetTokens: number }; failure: { code: string; message: string } };
  expect(result.failure.code).toBe('CONTEXT_LIMIT'); expect(result.failure.message).toContain('Model profiles');
  expect(result.context.estimatedInputTokens).toBeGreaterThan(result.context.inputBudgetTokens);
});

test('result retrieval cannot cross conversation boundaries or rerun an operation', async () => {
  const { store } = fixture(); let steps = 0;
  const at = new Date().toISOString();
  store.putSession({ id: 'private-session', projectId: 'p1', title: 'Private', createdAt: at, updatedAt: at });
  store.appendMessage({ id: 'other-result', sessionId: 'private-session', role: 'tool', toolCallId: 'original', toolName: 'run_command', content: 'PRIVATE_OBSERVATION', createdAt: at });
  const app = new Application(store, { publish() {}, async infer(_run, messages) {
    if (++steps === 1) return { content: '', outcome: 'tool_calls', toolCalls: [{ id: 'attempt', name: 'read_tool_result', input: { resultId: 'other-result' } }] };
    expect(messages.at(-1)?.content).toContain('NOT_FOUND'); expect(JSON.stringify(messages)).not.toContain('PRIVATE_OBSERVATION');
    return { content: 'Result unavailable.', outcome: 'complete' };
  } });
  const { session } = await app.handle(request('session.create', { projectId: 'p1' }, 'create')) as { session: { id: string } };
  const { run } = await app.handle(request('run.start', { sessionId: session.id, profileId: 'profile1', mode: 'ask', prompt: 'Retrieve' }, 'start')) as { run: { id: string } };
  await app.whenIdle(); expect(steps).toBe(2); expect(store.getRun(run.id)?.status).toBe('completed');
});

test('cloud policy blocks network admission and persists no user prompt', async () => {
  const { store } = fixture(); const saved = store.getProfile('profile1')!;
  store.putProfile({ ...saved, endpoint: 'https://provider.example/v1', kind: 'openai-compatible', locality: 'external', revisionId: 'cloud-revision', revision: 2 });
  let calls = 0; const app = new Application(store, { publish() {}, async infer() { calls++; return { content: 'bad', outcome: 'complete' }; } });
  const { session } = await app.handle(request('session.create', { projectId: 'p1' }, 'create')) as { session: { id: string } };
  await expect(app.handle(request('run.start', { sessionId: session.id, profileId: 'profile1', mode: 'ask', prompt: 'private' }, 'start'))).rejects.toThrow('CLOUD_NOT_ALLOWED');
  expect(calls).toBe(0); expect(store.listMessages(session.id)).toHaveLength(0);
});

test('project list exposes public DTOs and durable session creation replays once', async () => {
  const { app, store } = fixture();
  expect(JSON.stringify(await app.handle(request('project.list', {}, 'list')))).not.toContain('rootPath');
  const created = await app.handle(request('session.create', { projectId: 'p1', title: 'First task' }, 'create'));
  expect(await app.handle(request('session.create', { projectId: 'p1', title: 'First task' }, 'create'))).toEqual(created);
  expect(store.listSessions('p1')).toHaveLength(1);
});

test('a real stored run reaches a terminal state and retains the conversation', async () => {
  const { app, store } = fixture();
  const { session } = await app.handle(request('session.create', { projectId: 'p1', title: 'Chat' }, 'create')) as { session: { id: string } };
  const { run } = await app.handle(request('run.start', { sessionId: session.id, mode: 'ask', profileId: 'profile1', prompt: 'Hello' }, 'start')) as { run: { id: string } };
  await app.whenIdle();
  expect(store.getRun(run.id)?.status).toBe('completed');
  expect(store.listMessages(session.id).map(message => message.content)).toEqual(['Hello', 'Answer']);
  expect(store.events(run.id, 0, 100).events.at(-1)?.type).toBe('run.completed');
});

test('revoked project trust prevents a new run without storing a user message', async () => {
  const { app, store } = fixture();
  const { session } = await app.handle(request('session.create', { projectId: 'p1', title: 'Chat' }, 'create')) as { session: { id: string } };
  await app.handle(request('project.revokeTrust', { projectId: 'p1' }, 'revoke'));
  await expect(app.handle(request('run.start', { sessionId: session.id, mode: 'ask', profileId: 'profile1', prompt: 'Hello' }, 'start'))).rejects.toThrow('PROJECT_UNTRUSTED');
  expect(store.listMessages(session.id)).toHaveLength(0);
});

test('Stop aborts the pending model request and persists cancelled rather than completed', async () => {
  const { store } = fixture();
  let admitted!: () => void; const started = new Promise<void>(resolve => { admitted = resolve; });
  const app = new Application(store, { publish: () => {}, infer: async (_run, _messages, signal) => {
    admitted();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('RUN_CANCELLED')), { once: true }));
  } });
  const { session } = await app.handle(request('session.create', { projectId: 'p1' }, 'create')) as { session: { id: string } };
  const { run } = await app.handle(request('run.start', { sessionId: session.id, mode: 'ask', profileId: 'profile1', prompt: 'Hello' }, 'start')) as { run: { id: string } };
  await started;
  await app.handle(request('run.cancel', { runId: run.id }, 'stop')); await app.whenIdle();
  expect(store.getRun(run.id)?.status).toBe('cancelled');
  expect(store.listMessages(session.id)).toHaveLength(1);
});

test('forget removes project registration while retaining its folder and independent app settings', async () => {
  const { app, store } = fixture();
  const root = store.getProject('p1')!.rootPath;
  await app.handle(request('project.forget', { projectId: 'p1' }, 'forget'));
  expect(store.listProjects()).toEqual([]);
  expect(existsSync(root)).toBe(true);
  const result = await app.handle(request('settings.read', {}, 'settings')) as { settings: { theme: string } };
  expect(result.settings.theme).toBe('system');
});

test('Build reads a real file, pauses for approval, applies once and continues with its tool result', async () => {
  const { store, root } = fixture(); const data = join(root, 'private-app-data'); mkdirSync(data);
  writeFileSync(join(root, 'hello.txt'), 'before');
  let ready!: () => void; const awaiting = new Promise<void>(resolve => { ready = resolve; }); let steps = 0;
  const app = new Application(store, {
    publish(event) { if (event.type === 'approval.required') ready(); },
    async infer(_run, messages, _signal, tools) {
      expect(tools?.some(tool => tool.name === 'edit_file')).toBe(true);
      steps++;
      if (steps === 1) return { content: '', outcome: 'tool_calls', toolCalls: [{ id: 'read-1', name: 'read_file', input: { path: 'hello.txt' } }] };
      if (steps === 2) { expect(messages.at(-1)?.content).toContain('before'); return { content: 'I will update hello.txt.', outcome: 'tool_calls', toolCalls: [{ id: 'edit-1', name: 'edit_file', input: { path: 'hello.txt', search: 'before', replacement: 'after' } }] }; }
      expect(messages.at(-1)?.content).toContain('"applied":true');
      return { content: 'Updated hello.txt.', outcome: 'complete' };
    },
  }, { dataDirectory: data });
  const { session } = await app.handle(request('session.create', { projectId: 'p1' }, 'create')) as { session: { id: string } };
  const { run } = await app.handle(request('run.start', { sessionId: session.id, mode: 'build', profileId: 'profile1', prompt: 'Change before to after in hello.txt' }, 'start')) as { run: { id: string } };
  await awaiting;
  expect(readFileSync(join(root, 'hello.txt'), 'utf8')).toBe('before');
  const { operations } = await app.handle(request('approval.list', { runId: run.id }, 'pending')) as { operations: import('../src/shared').Operation[] };
  const op = operations[0]!;
  await app.handle(request('approval.decide', { operationId: op.id, projectId: op.projectId, inputHash: op.inputHash, policyRevision: op.policyRevision, trustRevision: op.trustRevision, decision: 'allow' }, 'approve'));
  await app.whenIdle();
  expect(readFileSync(join(root, 'hello.txt'), 'utf8')).toBe('after');
  expect(store.getRun(run.id)?.status).toBe('completed'); expect(steps).toBe(3);
  expect(store.listMessages(session.id).filter(m => m.role === 'tool')).toHaveLength(2);
});

test('Ask cannot execute an unoffered write tool, even when a provider returns one', async () => {
  const { store, root } = fixture(); const data = join(root, 'private-app-data'); mkdirSync(data);
  const app = new Application(store, { publish() {}, async infer() { return { content: '', outcome: 'tool_calls', toolCalls: [{ id: 'bad', name: 'write_file', input: { path: 'new.txt', content: 'bad' } }] }; } }, { dataDirectory: data });
  const { session } = await app.handle(request('session.create', { projectId: 'p1' }, 'create')) as { session: { id: string } };
  const { run } = await app.handle(request('run.start', { sessionId: session.id, mode: 'ask', profileId: 'profile1', prompt: 'Hello' }, 'start')) as { run: { id: string } };
  await app.whenIdle(); expect(store.getRun(run.id)?.status).toBe('failed'); expect(existsSync(join(root, 'new.txt'))).toBe(false);
});

test.each(['exited', 'unknown'] as const)('reviewed command records %s outcome before deciding whether the model can continue', async status => {
  const { store, root } = fixture(); let steps = 0; let executions = 0;
  let ready!: () => void; const awaiting = new Promise<void>(resolve => { ready = resolve; });
  const app = new Application(store, {
    publish(event) { if (event.type === 'approval.required') ready(); },
    async prepareCommand() { return { executable: 'C:/Tools/node.exe', args: ['check.js'], cwd: root, env: {}, timeoutMs: 1000, maxOutputBytes: 60000, files: [{ path: 'C:/Tools/node.exe', sha256: '0'.repeat(64) }], environmentPolicy: 'ordinary-windows-v1' }; },
    async executeCommand(runId, operationId) {
      executions++; expect(store.getOperation(operationId)?.status).toBe('started'); expect(store.getRun(runId)?.status).toBe('running');
      expect(store.listApprovals(operationId)[0]?.decision).toBe('allow');
      return { status, code: status === 'exited' ? 7 : null, output: 'CHECK FAILED', truncated: false, timedOut: false, cancelled: false };
    },
    async infer(_run, messages, _signal, tools) {
      steps++; expect(tools?.some(tool => tool.name === 'run_command')).toBe(true);
      if (steps === 1) return { content: '', outcome: 'tool_calls', toolCalls: [{ id: 'cmd', name: 'run_command', input: { program: 'node', args: ['check.js'] } }] };
      expect(JSON.parse(messages.at(-1)!.content).code).toBe(7);
      return { content: 'The check failed with exit code 7.', outcome: 'complete' };
    },
  }, { dataDirectory: join(root, 'data') });
  const { session } = await app.handle(request('session.create', { projectId: 'p1' }, 'create')) as { session: { id: string } };
  const { run } = await app.handle(request('run.start', { sessionId: session.id, mode: 'build', profileId: 'profile1', prompt: 'Run the check' }, 'start')) as { run: { id: string } };
  await awaiting; expect(executions).toBe(0);
  const { operations } = await app.handle(request('approval.list', { runId: run.id }, 'pending')) as { operations: import('../src/shared').Operation[] }; const op = operations[0]!;
  const preview = await app.handle(request('approval.read', { projectId: 'p1', operationId: op.id }, 'preview')) as { kind: string; args: string[] };
  expect(preview.kind).toBe('command'); expect(preview.args).toEqual(['check.js']);
  const approved = request('approval.decide', { operationId: op.id, projectId: op.projectId, inputHash: op.inputHash, policyRevision: op.policyRevision, trustRevision: op.trustRevision, decision: 'allow' }, 'approve');
  await app.handle(approved); await app.handle(approved); await app.whenIdle();
  expect(executions).toBe(1); expect(steps).toBe(status === 'unknown' ? 1 : 2);
  expect(store.getOperation(op.id)?.status).toBe(status === 'unknown' ? 'unknown' : 'completed');
  expect(store.getRun(run.id)?.status).toBe(status === 'unknown' ? 'failed' : 'completed');
  expect(store.listMessages(session.id).find(message => message.role === 'tool')?.content).toContain('CHECK FAILED');
});


test.each([
  ['https://github.com/example/project', 'NOT_IMPLEMENTED'],
  ['github.com/example/project', 'NOT_FOUND'],
  ['absent-directory', 'NOT_FOUND'],
  ['../outside', 'PATH_OUTSIDE_PROJECT'],
  ['.env', 'FORBIDDEN'],
])('local search reports the actual failure for %s to model and UI', async (path, expectedCode) => {
  const { store } = fixture(); let step = 0;
  const app = new Application(store, { publish() {}, async infer() {
    if (++step === 1) return { content: '', outcome: 'tool_calls', toolCalls: [{ id: 'search-failure', name: 'search_text', input: { path, query: 'test' } }] };
    return { content: 'Observed the tool result.', outcome: 'complete' };
  } });
  const { session } = await app.handle(request('session.create', { projectId: 'p1' }, 'create')) as { session: { id: string } };
  const { run } = await app.handle(request('run.start', { sessionId: session.id, profileId: 'profile1', mode: 'plan', prompt: 'Inspect this repository.' }, 'start')) as { run: { id: string } };
  await app.whenIdle();
  expect(store.getRun(run.id)?.status).toBe('completed');
  const result = JSON.parse(store.listMessages(session.id).find(m => m.role === 'tool')!.content);
  expect(result.error).toBe(expectedCode);
  expect(store.latestRunEvent(session.id, 'tool.failed')).toMatchObject({ error: { code: expectedCode, message: result.message } });
  expect(result.message).not.toContain(store.getProject('p1')!.rootPath);
});
