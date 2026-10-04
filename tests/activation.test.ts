import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, test } from 'vitest';
import { ActivationStore } from '../src/models/runtime';
import { InferenceScheduler } from '../src/engine/scheduler';
import { zipFixture } from './fixtures/zip';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const key = generateKeyPairSync('ed25519'); const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const trust = { trustedKeys: { fixture: key.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, appVersion: '0.5.0', now: new Date('2026-09-27T00:00:00Z') };
function makeSet(sequence = 1, faults: { quality?: number; wrongRuntime?: boolean; missingBlob?: boolean; wrongFile?: boolean } = {}) {
  const executable = `runtime version ${sequence}`;
  const runtime = zipFixture([{ name: 'ollama.exe', content: executable }]);
  const runtimeManifest = JSON.stringify({ schemaVersion: 1, files: [{ path: 'ollama.exe', sizeBytes: executable.length, sha256: faults.wrongFile ? '0'.repeat(64) : sha(executable) }] });
  const weights = Buffer.from('synthetic weights'); const config = Buffer.from('{"model_format":"gguf","file_type":"fixture"}');
  const manifest = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.docker.distribution.manifest.v2+json', config: { mediaType: 'application/vnd.docker.container.image.v1+json', digest: `sha256:${sha(config)}`, size: config.length }, layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: `sha256:${faults.missingBlob ? '0'.repeat(64) : sha(weights)}`, size: weights.length }] });
  const evidence = 'synthetic test evidence, not a released qualification';
  const receipt = JSON.stringify({ id: 'fixture-lab', schemaVersion: 1, suiteVersion: 'moonaliza-coding-v1', modelDigest: sha(manifest), runtimeDigest: faults.wrongRuntime ? '0'.repeat(64) : sha(runtime), backend: 'cpu', quantization: 'fixture', contextTokens: 2048, parallelism: 1, quality: faults.quality ?? 0.9, toolsPassed: true, unauthorizedEffects: 0, writesAfterCancellation: 0, labHardwareFingerprint: 'fixture', qualifiedAt: '2026-09-26T00:00:00Z', evidenceDigest: sha(evidence) });
  const contents: Record<string, Buffer> = { runtime, 'runtime-manifest': Buffer.from(runtimeManifest), manifest: Buffer.from(manifest), weights, config, evidence: Buffer.from(evidence), receipt: Buffer.from(receipt) };
  const roles: Record<string, string> = { runtime: 'runtime', 'runtime-manifest': 'runtime-manifest', manifest: 'model-manifest', weights: 'model-blob', config: 'model-blob', evidence: 'evidence', receipt: 'lab-receipt' };
  const artifacts = Object.entries(contents).map(([id, bytes]) => ({ id, role: roles[id], sha256: sha(bytes), sizeBytes: bytes.length, url: `https://artifacts.example/${sequence}/${id}`, redirectHosts: [] }));
  const payload = { schemaVersion: 1, id: `fixture-${sequence}`, sequence, app: { min: '0.5.0', maxExclusive: '1.0.0' }, issuedAt: '2026-09-26T00:00:00Z', expiresAt: '2026-10-26T00:00:00Z', artifacts, runtimes: [{ id: 'ollama', artifactId: 'runtime', manifestId: 'runtime-manifest', executable: 'ollama.exe', backends: ['cpu'], maxExpandedBytes: 1024, maxEntries: 10 }], configurations: [{ runtimeId: 'ollama', modelManifestId: 'manifest', modelBlobIds: ['weights', 'config'], labReceiptId: 'receipt', evidenceId: 'evidence' }] };
  const bytes = Buffer.from(JSON.stringify(payload));
  const envelope = { schemaVersion: 1, keyId: 'fixture', algorithm: 'Ed25519', payload: bytes.toString('base64'), signature: sign(null, Buffer.concat([Buffer.from('MoonAliza activation set v1\0'), bytes]), key.privateKey).toString('base64') };
  return { envelope, digest: sha(bytes), contents, payload };
}
async function fixture(withRuntimeStopped?: <T>(task: () => Promise<T>) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), 'monnzila-activation-')); roots.push(root); const sets = new Map<string, ReturnType<typeof makeSet>>(); let requests = 0; let busy = false;
  const options = { trust, fetcher: async (url: string) => { requests++; const [, sequence, id] = new URL(url).pathname.split('/'); const contents = sets.get(sequence!)?.contents[id!]; return contents ? new Response(new Uint8Array(contents)) : new Response(null, { status: 404 }); }, withRuntimeStopped: async <T>(task: () => Promise<T>): Promise<T> => { if (busy) throw new Error('RUNTIME_BUSY'); busy = true; try { return await task(); } finally { busy = false; } } };
  if (withRuntimeStopped) options.withRuntimeStopped = withRuntimeStopped;
  return { root, sets, store: new ActivationStore(root, options), reopen: () => new ActivationStore(root, options), requests: () => requests, busy: (value: boolean) => { busy = value; } };
}
test('activates a complete verified set atomically, reopens it and retains the previous set', async () => {
  const f = await fixture(); const one = makeSet(1), two = makeSet(2); f.sets.set('1', one); f.sets.set('2', two);
  expect(await f.store.readActive()).toBeNull();
  await f.store.activate(one.envelope); const current = await f.reopen().readActive();
  expect(current?.digest).toBe(one.digest); expect(await readFile(join(current!.runtimeDirectories.ollama!, 'ollama.exe'), 'utf8')).toBe('runtime version 1');
  await f.store.activate(two.envelope);
  expect((await f.reopen().readActive())?.digest).toBe(two.digest);
  const pointer = JSON.parse(await readFile(join(f.root, 'current.json'), 'utf8')); expect(pointer.previous).toBe(one.digest);
  expect(await readFile(join(f.root, 'sets', one.digest, 'runtimes', 'ollama', 'ollama.exe'), 'utf8')).toBe('runtime version 1');
});
test.each([{ quality: 0.5 }, { wrongRuntime: true }, { missingBlob: true }, { wrongFile: true }])('retains previous activation when candidate proof is invalid %j', async fault => {
  const f = await fixture(); const one = makeSet(1); f.sets.set('1', one); await f.store.activate(one.envelope);
  const bad = makeSet(2, fault); f.sets.set('2', bad);
  await expect(f.store.activate(bad.envelope)).rejects.toThrow(/(QUALIFICATION|MANIFEST|ARTIFACT)/);
  expect((await f.reopen().readActive())?.digest).toBe(one.digest);
  expect((await readdir(join(f.root, 'sets'))).filter(name => name.startsWith('.staging-'))).toEqual([]);
});
test('rejects unsigned sets before network and rejects rollback or same-sequence replacement', async () => {
  const f = await fixture(); const one = makeSet(1), two = makeSet(2); f.sets.set('2', two);
  await expect(f.store.activate({ ...two.envelope, keyId: 'attacker' })).rejects.toThrow('CATALOGUE_SIGNATURE'); expect(f.requests()).toBe(0);
  await f.store.activate(two.envelope);
  await expect(f.store.activate(one.envelope)).rejects.toThrow('CATALOGUE_ROLLBACK');
  await expect(f.store.activate(makeSet(2, { quality: 0.8 }).envelope)).rejects.toThrow('CATALOGUE_ROLLBACK');
});
test('cancellation and busy ownership leave the committed activation unchanged', async () => {
  const f = await fixture(); const one = makeSet(1); f.sets.set('1', one); await f.store.activate(one.envelope);
  const controller = new AbortController(); controller.abort();
  await expect(f.store.activate(makeSet(2).envelope, controller.signal)).rejects.toThrow('INSTALL_CANCELLED');
  f.busy(true); await expect(f.store.activate(makeSet(2).envelope)).rejects.toThrow('RUNTIME_BUSY'); f.busy(false);
  expect((await f.reopen().readActive())?.digest).toBe(one.digest);
});
test('reopening ignores interrupted staging and detects changed or injected runtime files', async () => {
  const f = await fixture(); const one = makeSet(1); f.sets.set('1', one); await f.store.activate(one.envelope);
  await mkdir(join(f.root, 'sets', '.staging-interrupted')); await writeFile(join(f.root, 'sets', '.staging-interrupted', 'partial'), 'incomplete');
  const active = await f.reopen().readActive(); expect(active?.digest).toBe(one.digest);
  await writeFile(join(active!.runtimeDirectories.ollama!, 'extra.dll'), 'injected'); await expect(f.reopen().readActive()).rejects.toThrow('RUNTIME_MANIFEST');
  await rm(join(active!.runtimeDirectories.ollama!, 'extra.dll'));
  await writeFile(join(active!.runtimeDirectories.ollama!, 'ollama.exe'), 'corrupt'); await expect(f.reopen().readActive()).rejects.toThrow(/(RUNTIME_MANIFEST|ARTIFACT)/);
});
test('reconciles a fully verified candidate left before pointer commit without redownloading', async () => {
  const f = await fixture(); const one = makeSet(1), two = makeSet(2); f.sets.set('1', one); f.sets.set('2', two);
  await f.store.activate(one.envelope); const oldPointer = await readFile(join(f.root, 'current.json'));
  await f.store.activate(two.envelope); const requests = f.requests();
  // Simulate the durable state of interruption after directory rename, before pointer replacement.
  await writeFile(join(f.root, 'current.json'), oldPointer);
  expect((await f.reopen().readActive())?.digest).toBe(one.digest);
  await f.reopen().activate(two.envelope); expect(f.requests()).toBe(requests);
  expect((await f.reopen().readActive())?.digest).toBe(two.digest);
});

test('real scheduler maintenance prevents activation effects while inference holds the runtime', async () => {
  const scheduler = new InferenceScheduler({ stopRuntime: async () => {} });
  let release!: () => void, admitted!: () => void;
  const held = new Promise<void>(done => { release = done; });
  const maintenanceRequested = new Promise<void>(done => { admitted = done; });
  const f = await fixture(task => { const pending = scheduler.withRuntimeStopped(task); admitted(); return pending; });
  const one = makeSet(1); f.sets.set('1', one);
  const inference = scheduler.run(async () => held); const activation = f.store.activate(one.envelope);
  try {
    await maintenanceRequested; expect(f.requests()).toBe(0);
    await expect(scheduler.run(async () => 'not admitted')).rejects.toThrow('RUNTIME_MAINTENANCE');
    release(); await inference; expect((await activation).digest).toBe(one.digest);
    expect(await scheduler.run(async () => 'available')).toBe('available');
  } finally { release(); await Promise.allSettled([inference, activation]); await scheduler.shutdown(); }
});

test('activation waiting for inference does not hold the store lock needed by that inference', async () => {
  const scheduler = new InferenceScheduler({ stopRuntime: async () => {} });
  let proceed!: () => void; let queued!: () => void;
  const ready = new Promise<void>(done => { proceed = done; });
  const maintenanceRequested = new Promise<void>(done => { queued = done; });
  const f = await fixture(task => { const pending = scheduler.withRuntimeStopped(task); queued(); return pending; });
  const one = makeSet(1); f.sets.set('1', one);
  const inference = scheduler.run(async () => { await ready; return f.store.readActive(); }, { leaseTimeoutMs: 1500 });
  const activation = f.store.activate(one.envelope);
  try {
    await maintenanceRequested; proceed();
    expect(await inference).toBeNull(); expect((await activation).digest).toBe(one.digest);
  } finally { proceed(); await Promise.allSettled([inference, activation]); await scheduler.shutdown(); }
});

test('activation publishes private model bytes and rechecks their identity when reopened', async () => {
  const f = await fixture(); const one = makeSet(1); f.sets.set('1', one);
  const active = await f.store.activate(one.envelope); const digest = sha(one.contents.manifest!);
  expect(active.modelsDirectory).toBe(join(f.root, 'sets', one.digest, 'models'));
  expect(active.models[0]).toMatchObject({ digest, name: `moonaliza/${digest}:verified`, quantization: 'fixture' });
  expect(active.labReceipts[0]?.id).toBe('fixture-lab');
  expect(await readFile(join(active.modelsDirectory, 'manifests', 'registry.ollama.ai', 'moonaliza', digest, 'verified'))).toEqual(one.contents.manifest);
  const weights = join(active.modelsDirectory, 'blobs', `sha256-${sha(one.contents.weights!)}`);
  await writeFile(weights, 'tampered'); await expect(f.reopen().readActive()).rejects.toThrow();
  expect(await readFile(join(f.root, 'cache', `${sha(one.contents.weights!)}.blob`))).toEqual(one.contents.weights);
});
