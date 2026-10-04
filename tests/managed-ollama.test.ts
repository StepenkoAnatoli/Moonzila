import { mkdtemp, copyFile, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, expect, test } from 'vitest';
import { hashFile } from '../src/models/artifact-files';
import { ManagedOllamaRuntime } from '../src/models/managed-ollama';
import { completeManagedOllama, ManagedOllamaProvider } from '../src/models/managed-provider';
import { InferenceScheduler } from '../src/engine/scheduler';

function expectExited(pid: number) {
  let failure: unknown;
  try { process.kill(pid, 0); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: 'ESRCH' });
}

// Fixtures whose test threw before reaching close(); afterEach stops and deletes them.
const open = new Set<{ root: string; scheduler: InferenceScheduler }>();
afterEach(async () => {
  for (const item of open) {
    open.delete(item);
    await item.scheduler.shutdown().catch(() => {});
    await rm(item.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
});

async function fixture(mode = 'normal') {
  const root = await mkdtemp(join(tmpdir(), 'moonzila-managed-')); const directory = join(root, 'runtime'); await mkdir(directory);
  await copyFile(process.execPath, join(directory, 'ollama.exe'));
  await copyFile(resolve('tests/fixtures/processes/ollama-fixture.mjs'), join(directory, 'serve'));
  await writeFile(join(directory, 'fixture.json'), JSON.stringify({ mode }));
  const files = await Promise.all(['ollama.exe', 'serve', 'fixture.json'].map(async path => ({ path, ...await hashFile(join(directory, path), 128 * 1024 ** 2) })));
  const installation = { directory, executable: 'ollama.exe', files, version: 'fixture-v1', homeDirectory: join(root, 'home'), modelsDirectory: join(root, 'models') };
  const owner = new ManagedOllamaRuntime(); const scheduler = new InferenceScheduler({ stopRuntime: async () => { await owner.stop(); } });
  const requests = async () => (await readFile(join(root, 'home', 'requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const entry = { root, scheduler }; open.add(entry);
  return { root, installation, owner, scheduler, requests, close: async () => {
    open.delete(entry);
    // Each fixture holds a copy of the Node binary (~120 MB). Delete it even when shutdown or the
    // exit assertions fail, so a failing run cannot fill the disk, but report the original failure first.
    let failure: unknown;
    try {
      await scheduler.shutdown();
      const observed = await requests().catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      for (const pid of new Set<number>(observed.map(item => item.pid))) expectExited(pid);
    } catch (error) { failure = error; }
    // Windows can briefly retain image/file handles after process exit, so retry the deletion.
    try { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (error) { if (failure === undefined) throw error; }
    if (failure !== undefined) throw failure;
  } };
}
const configuration = { model: 'fixture:local', digest: 'a'.repeat(64), contextTokens: 2048, outputTokens: 128, quantization: 'Q4_K_M', placement: 'cpu' as const };
const messages = [{ role: 'user' as const, content: 'private project prompt' }];
const tools = [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } }];

test('managed provider verifies version, disabled cloud, model and loaded settings before sending canonical tools', async () => {
  const f = await fixture();
  try {
    const result = await f.scheduler.run(async lease => completeManagedOllama(await f.owner.start(f.installation, lease), configuration, messages, { tools }));
    expect(result.outcome).toBe('tool_calls'); expect(result.toolCalls?.[0]).toMatchObject({ name: 'read_file', input: { path: 'example.txt' } });
    const requests = await f.requests(); const chats = requests.filter(item => item.route === '/api/chat');
    expect(chats[0].body).toMatchObject({ messages: [], options: { num_ctx: 2048, num_predict: 128, num_gpu: 0 }, keep_alive: -1, stream: false });
    expect(chats[1].body).toMatchObject({ messages, options: { num_ctx: 2048, num_predict: 128, num_gpu: 0 }, keep_alive: -1, tools: [{ type: 'function', function: tools[0] }] });
    expect(requests.map(item => item.route)).toEqual(['/api/version', '/api/status', '/api/tags', '/api/chat', '/api/ps', '/api/chat', '/api/ps']);
    expect(await f.owner.stop()).toBeNull();
  } finally { await f.close(); }
}, 30000);

test.each(['wrong-version', 'cloud-enabled', 'wrong-digest', 'gpu-loaded'])('managed configuration rejects %s without transmitting project content', async mode => {
  const f = await fixture(mode);
  try {
    await expect(f.scheduler.run(async lease => completeManagedOllama(await f.owner.start(f.installation, lease), configuration, messages, { tools }))).rejects.toThrow(/RUNTIME_VERSION|RUNTIME_CLOUD|MODEL_IDENTITY|MODEL_CONFIGURATION/);
    expect(JSON.stringify(await f.requests())).not.toContain('private project prompt');
    expect(await f.scheduler.run(async () => 'next lease')).toBe('next lease');
  } finally { await f.close(); }
}, 30000);

test('changed runtime files are rejected before process launch', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.installation.directory, 'serve'), 'altered');
    await expect(f.scheduler.run(lease => f.owner.start(f.installation, lease))).rejects.toThrow('RUNTIME_MANIFEST');
    await expect(readFile(join(f.root, 'home', 'requests.jsonl'))).rejects.toThrow();
  } finally { await f.close(); }
});

test('managed startup clears derived model metadata before launching the owned runtime', async () => {
  const f = await fixture(); const metadata = join(f.installation.modelsDirectory, 'metadata'); await mkdir(metadata, { recursive: true });
  await writeFile(join(metadata, `sha256-${'a'.repeat(64)}.json`), '{"kv":{"poisoned":"cache"}}');
  try {
    await f.scheduler.run(async lease => {
      await f.owner.start(f.installation, lease);
      await expect(readFile(join(metadata, `sha256-${'a'.repeat(64)}.json`))).rejects.toMatchObject({ code: 'ENOENT' });
    });
  } finally { await f.close(); }
}, 30000);

test('fixture cleanup tolerates a temporary file lock after the owned runtime has exited', async () => {
  const f = await fixture();
  const session = await f.scheduler.run(lease => f.owner.start(f.installation, lease));
  expectExited(session.identity.pid);
  const locker = spawn(join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', '$f = [IO.File]::Open($env:MOONALIZA_TEST_LOCK_FILE, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read); try { [Console]::Out.WriteLine("locked"); Start-Sleep -Milliseconds 800 } finally { $f.Dispose() }'], { windowsHide: true, env: { ...process.env, MOONALIZA_TEST_LOCK_FILE: join(f.installation.directory, 'ollama.exe') }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(locker, 'exit');
  try {
    const ready = await Promise.race([once(locker.stdout, 'data').then(([bytes]) => String(bytes)), exited.then(() => { throw new Error('LOCK_FIXTURE_FAILED'); })]);
    expect(ready.trim()).toBe('locked');
    await f.close();
  } finally { await exited; await f.close(); }
}, 30000);

test('Stop during startup waits for preparation to settle before a subsequent runtime can start', async () => {
  const f = await fixture();
  try {
    await f.scheduler.run(async lease => {
      let settled = false;
      const starting = f.owner.start(f.installation, lease);
      void starting.then(() => { settled = true; }, () => { settled = true; });
      const rejected = expect(starting).rejects.toThrow();
      const stopped = await f.owner.stop(), settledAtStop = settled;
      await rejected; expect(stopped).toBeNull(); expect(settledAtStop).toBe(true);
      await expect(readFile(join(f.root, 'home', 'requests.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' });
      await f.owner.start(f.installation, lease);
    });
    expect(await f.owner.stop()).toBeNull();
  } finally { await f.close(); }
}, 30000);

test('Stop cancels in-flight managed inference and confirms runtime exit before the next lease', async () => {
  const f = await fixture('slow'); const stop = new AbortController();
  try {
    const pending = f.scheduler.run(async lease => completeManagedOllama(await f.owner.start(f.installation, lease), configuration, messages, { tools }), { signal: stop.signal });
    const rejected = expect(pending).rejects.toThrow('INFERENCE_CANCELLED');
    for (let n = 0; n < 150; n++) { if (await f.requests().then(items => items.some(item => item.body?.messages?.[0]?.content === messages[0]!.content)).catch(() => false)) break; await delay(40); }
    expect(JSON.stringify(await f.requests())).toContain('private project prompt');
    const next = f.scheduler.run(async () => { expect(await f.owner.stop()).toBeNull(); return 'available'; });
    stop.abort(); await rejected; expect(await next).toBe('available');
  } finally { stop.abort(); await f.close(); }
}, 30000);

test('a changed loaded configuration prevents returning pending model tool calls', async () => {
  const f = await fixture('changed-after-chat');
  try {
    await expect(f.scheduler.run(async lease => completeManagedOllama(await f.owner.start(f.installation, lease), configuration, messages, { tools }))).rejects.toThrow('MODEL_CONFIGURATION');
    expect(JSON.stringify(await f.requests())).toContain('private project prompt');
  } finally { await f.close(); }
}, 30000);

test('the provider facade resolves configuration under one lease and cleans up between queued completions', async () => {
  const f = await fixture(); let resolutions = 0;
  const provider = new ManagedOllamaProvider(async lease => { lease.assertCurrent(); resolutions++; return { installation: f.installation, configuration }; });
  try {
    const results = await Promise.all([provider.complete(messages, { tools }), provider.complete(messages, { tools })]);
    expect(results.map(result => result.outcome)).toEqual(['tool_calls', 'tool_calls']); expect(resolutions).toBe(2);
    const requests = await f.requests(); expect(requests).toHaveLength(14);
    expect(new Set(requests.slice(0, 7).map(item => item.pid)).size).toBe(1);
    expect(new Set(requests.slice(7).map(item => item.pid)).size).toBe(1);
    expect(requests[0].pid).not.toBe(requests[7].pid);
    await provider.withRuntimeStopped(async () => { await expect(provider.complete(messages)).rejects.toThrow('RUNTIME_MAINTENANCE'); });
  } finally { await provider.shutdown(); await f.close(); }
}, 30000);
