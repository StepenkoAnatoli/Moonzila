import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, lstat, link, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, test } from 'vitest';
import { materializeModels, verifyModelStore, clearModelMetadata } from '../src/models/model-store';

const roots: string[] = []; const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
afterEach(async () => { for (const root of roots.splice(0)) { const child = relative(resolve(tmpdir()), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('FIXTURE_PATH'); await rm(root, { recursive: true, force: true }); } });
async function fixture(configValue: object = { model_format: 'gguf', file_type: 'Q4_K_M' }, weights = Buffer.from('synthetic model bytes, not inference or quality evidence')) {
  const root = await mkdtemp(join(tmpdir(), 'moonzila-model-store-')); roots.push(root);
  const cacheDirectory = join(root, 'cache'); await mkdir(cacheDirectory);
  const config = Buffer.from(JSON.stringify(configValue));
  const identities = [config, weights].map(bytes => ({ sha256: hash(bytes), sizeBytes: bytes.length }));
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.docker.distribution.manifest.v2+json', config: { mediaType: 'application/vnd.docker.container.image.v1+json', digest: `sha256:${identities[0]!.sha256}`, size: config.length }, layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: `sha256:${identities[1]!.sha256}`, size: weights.length }] }, null, 2) + '\n');
  const spec = { manifest: { sha256: hash(manifest), sizeBytes: manifest.length }, blobs: identities };
  for (const bytes of [config, weights, manifest]) await writeFile(join(cacheDirectory, `${hash(bytes)}.blob`), bytes);
  return { root, cacheDirectory, destination: join(root, 'models'), config, weights, manifest, spec };
}

test('preserves exact manifest bytes and copies verified blobs without linking to the cache', async () => {
  const f = await fixture();
  const result = await materializeModels([f.spec], f.destination, { cacheDirectory: f.cacheDirectory });
  expect(result).toEqual([{ digest: f.spec.manifest.sha256, name: `moonaliza/${f.spec.manifest.sha256}:verified`, quantization: 'Q4_K_M', sizeBytes: f.config.length + f.weights.length }]);
  const path = join(f.destination, 'manifests', 'registry.ollama.ai', 'moonaliza', f.spec.manifest.sha256, 'verified');
  expect(await readFile(path)).toEqual(f.manifest);
  const blob = join(f.destination, 'blobs', `sha256-${f.spec.blobs[1]!.sha256}`);
  expect(await readFile(blob)).toEqual(f.weights); expect((await lstat(blob)).nlink).toBe(1);
  await writeFile(join(f.cacheDirectory, `${f.spec.blobs[1]!.sha256}.blob`), 'changed cache');
  expect(await readFile(blob)).toEqual(f.weights);
  expect(await verifyModelStore([f.spec], f.destination)).toEqual(result);
});

test('identical manifests and shared blobs occupy one copy in a new store', async () => {
  const f = await fixture();
  expect(await materializeModels([f.spec, f.spec], f.destination, { cacheDirectory: f.cacheDirectory })).toHaveLength(1);
  expect(await readdir(join(f.destination, 'blobs'))).toHaveLength(2);
});

test.each(['missing', 'changed', 'extra', 'conflicting-size'])('rejects %s artifact identities and removes only its own incomplete store', async mode => {
  const f = await fixture();
  if (mode === 'missing') f.spec.blobs.pop();
  if (mode === 'changed') await writeFile(join(f.cacheDirectory, `${f.spec.blobs[1]!.sha256}.blob`), 'corrupt');
  if (mode === 'extra') f.spec.blobs.push({ sha256: '0'.repeat(64), sizeBytes: 1 });
  if (mode === 'conflicting-size') f.spec.blobs.push({ ...f.spec.blobs[0]!, sizeBytes: 123 });
  await expect(materializeModels([f.spec], f.destination, { cacheDirectory: f.cacheDirectory })).rejects.toThrow();
  await expect(lstat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(join(f.cacheDirectory, `${f.spec.manifest.sha256}.blob`))).toEqual(f.manifest);
});

test.each([{ model_format: 'gguf', file_type: 'Q4_K_M', remote_host: 'https://external.example' }, { model_format: 'gguf', file_type: 'Q4_K_M', remote_model: 'remote' }, { model_format: 'safetensors', file_type: 'F16' }])('refuses remote or unsupported model configurations %j', async config => {
  const f = await fixture(config);
  await expect(materializeModels([f.spec], f.destination, { cacheDirectory: f.cacheDirectory })).rejects.toThrow(/MODEL_CONFIG|MODEL_FORMAT/);
  await expect(lstat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('existing destinations and pre-cancelled requests never replace model files', async () => {
  const f = await fixture(); await mkdir(f.destination); await writeFile(join(f.destination, 'keep'), 'existing');
  await expect(materializeModels([f.spec], f.destination, { cacheDirectory: f.cacheDirectory })).rejects.toThrow('MODEL_STORE_EXISTS');
  const stop = new AbortController(); stop.abort();
  await expect(materializeModels([f.spec], join(f.root, 'cancelled'), { cacheDirectory: f.cacheDirectory, signal: stop.signal })).rejects.toThrow('INSTALL_CANCELLED');
  expect(await readFile(join(f.destination, 'keep'), 'utf8')).toBe('existing'); await expect(lstat(join(f.root, 'cancelled'))).rejects.toThrow();
});

test('store revalidation detects changed blobs, manifests and extra authoritative files', async () => {
  const f = await fixture(); await materializeModels([f.spec], f.destination, { cacheDirectory: f.cacheDirectory });
  const blob = join(f.destination, 'blobs', `sha256-${f.spec.blobs[1]!.sha256}`);
  await writeFile(blob, 'changed'); await expect(verifyModelStore([f.spec], f.destination)).rejects.toThrow(); await writeFile(blob, f.weights);
  const manifest = join(f.destination, 'manifests', 'registry.ollama.ai', 'moonaliza', f.spec.manifest.sha256, 'verified');
  await writeFile(manifest, f.manifest.toString().trim()); await expect(verifyModelStore([f.spec], f.destination)).rejects.toThrow(); await writeFile(manifest, f.manifest);
  await writeFile(join(f.destination, 'blobs', 'extra'), 'unexpected'); await expect(verifyModelStore([f.spec], f.destination)).rejects.toThrow('MODEL_STORE_CORRUPT');
});

test('cancelling while model bytes are being copied removes the incomplete store and preserves the cache', async () => {
  const f = await fixture(undefined, Buffer.alloc(32 * 1024 ** 2, 17)); const stop = new AbortController();
  const output = join(f.destination, 'blobs', `sha256-${f.spec.blobs[1]!.sha256}`); let finished = false;
  const copying = materializeModels([f.spec], f.destination, { cacheDirectory: f.cacheDirectory, signal: stop.signal });
  void copying.then(() => { finished = true; }, () => { finished = true; });
  const rejected = expect(copying).rejects.toThrow('INSTALL_CANCELLED'); let observed = false;
  for (let n = 0; n < 2000 && !finished; n++) {
    const size = await lstat(output).then(info => info.size).catch(() => 0);
    if (size > 0 && size < f.weights.length) { observed = true; stop.abort(); break; }
    await delay(1);
  }
  stop.abort(); await rejected; expect(observed).toBe(true);
  await expect(lstat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await readFile(join(f.cacheDirectory, `${f.spec.blobs[1]!.sha256}.blob`))).equals(f.weights)).toBe(true);
}, 15000);

test('linked cache files and junction destinations cannot redirect model installation', async () => {
  const f = await fixture(); const original = join(f.cacheDirectory, `${f.spec.blobs[1]!.sha256}.blob`); await link(original, join(f.root, 'hardlink'));
  await expect(materializeModels([f.spec], f.destination, { cacheDirectory: f.cacheDirectory })).rejects.toThrow('ARTIFACT_PATH');
  await rm(join(f.root, 'hardlink'));
  const outside = join(f.root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep'), 'outside');
  await symlink(outside, f.destination, 'junction');
  await expect(materializeModels([f.spec], f.destination, { cacheDirectory: f.cacheDirectory })).rejects.toThrow('MODEL_STORE_EXISTS');
  expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('outside');
});

test('derived metadata is bounded and can be cleared without changing verified models', async () => {
  const f = await fixture(); await materializeModels([f.spec], f.destination, { cacheDirectory: f.cacheDirectory });
  const metadata = join(f.destination, 'metadata'); await mkdir(metadata);
  await writeFile(join(metadata, `sha256-${f.spec.blobs[1]!.sha256}.json`), '{"kv":{"untrusted":"derived"}}');
  await writeFile(join(metadata, '.gguf-metadata-123.tmp'), 'interrupted');
  expect(await verifyModelStore([f.spec], f.destination)).toHaveLength(1);
  await clearModelMetadata(f.destination); expect(await readdir(metadata)).toEqual([]);
  expect(await verifyModelStore([f.spec], f.destination)).toHaveLength(1);
});

test('metadata cleanup refuses linked or unexpected paths without following them', async () => {
  const f = await fixture(); await mkdir(f.destination); const metadata = join(f.destination, 'metadata'); await mkdir(metadata);
  await mkdir(join(metadata, 'unexpected')); await writeFile(join(metadata, 'unexpected', 'keep'), 'untouched');
  await expect(clearModelMetadata(f.destination)).rejects.toThrow('MODEL_METADATA_PATH');
  expect(await readFile(join(metadata, 'unexpected', 'keep'), 'utf8')).toBe('untouched');
});

test('metadata cleanup validates the entire directory before unlinking any valid entry', async () => {
  const f = await fixture(); await mkdir(f.destination); const metadata = join(f.destination, 'metadata'); await mkdir(metadata);
  const valid = join(metadata, `sha256-${'0'.repeat(64)}.json`), linked = join(metadata, `sha256-${'f'.repeat(64)}.json`);
  await writeFile(valid, 'valid derived cache'); await writeFile(join(f.root, 'outside'), 'outside'); await link(join(f.root, 'outside'), linked);
  await expect(clearModelMetadata(f.destination)).rejects.toThrow('MODEL_METADATA_PATH');
  expect(await readFile(valid, 'utf8')).toBe('valid derived cache'); expect(await readFile(join(f.root, 'outside'), 'utf8')).toBe('outside');
});
