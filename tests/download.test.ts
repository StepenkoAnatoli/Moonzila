import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { downloadArtifact, type ArtifactSpec } from '../src/models/download';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(content = 'abcdef') {
  const root = await mkdtemp(join(tmpdir(), 'monnzila-download-')); roots.push(root);
  const artifact: ArtifactSpec = { sha256: createHash('sha256').update(content).digest('hex'), sizeBytes: Buffer.byteLength(content), url: 'https://artifacts.example/runtime.zip', redirectHosts: ['cdn.example'] };
  return { root, artifact };
}
test('streams verified bytes into the cache and rechecks cached bytes before reuse', async () => {
  const f = await fixture(); let calls = 0;
  const fetcher = async (_url: string, init: RequestInit) => { calls++; expect(init.redirect).toBe('manual'); expect(init.credentials).toBe('omit'); expect(init.headers).not.toHaveProperty('Authorization'); return new Response('abcdef'); };
  const path = await downloadArtifact(f.artifact, f.root, { fetcher });
  expect(await readFile(path, 'utf8')).toBe('abcdef');
  expect(await downloadArtifact(f.artifact, f.root, { fetcher })).toBe(path); expect(calls).toBe(1);
  await writeFile(path, 'BADBAD');
  await expect(downloadArtifact(f.artifact, f.root, { fetcher })).rejects.toThrow('ARTIFACT_CORRUPT'); expect(calls).toBe(1);
});
test.each(['abc', 'abcdefgh', 'badbad'])('never accepts wrong artifact bytes %s', async content => {
  const f = await fixture();
  await expect(downloadArtifact(f.artifact, f.root, { fetcher: async () => new Response(content), retries: 0 })).rejects.toThrow(/ARTIFACT_(SIZE|DIGEST)/);
  expect((await readdir(f.root)).some(name => name.endsWith('.blob'))).toBe(false);
});
test('cancelled transfer resumes only with matching strong ETag and Content-Range', async () => {
  const f = await fixture(); const controller = new AbortController();
  const body = new ReadableStream({ start(c) { c.enqueue(Buffer.from('abc')); c.enqueue(Buffer.from('def')); c.close(); } });
  await expect(downloadArtifact(f.artifact, f.root, { fetcher: async () => new Response(body, { headers: { ETag: '"one"' } }), signal: controller.signal, onProgress: () => controller.abort(), retries: 0 })).rejects.toThrow('DOWNLOAD_CANCELLED');
  const path = await downloadArtifact(f.artifact, f.root, { fetcher: async (_url, init) => {
    expect(new Headers(init.headers).get('Range')).toBe('bytes=3-'); expect(new Headers(init.headers).get('If-Range')).toBe('"one"');
    return new Response('def', { status: 206, headers: { ETag: '"one"', 'Content-Range': 'bytes 3-5/6', 'Content-Length': '3' } });
  } });
  expect(await readFile(path, 'utf8')).toBe('abcdef');
});
async function partial(f: Awaited<ReturnType<typeof fixture>>) {
  await writeFile(join(f.root, `${f.artifact.sha256}.partial`), 'abc');
  await writeFile(join(f.root, `${f.artifact.sha256}.resume.json`), JSON.stringify({ schemaVersion: 1, sha256: f.artifact.sha256, sizeBytes: 6, url: f.artifact.url, etag: '"one"' }));
}
test.each([
  { ETag: '"two"', 'Content-Range': 'bytes 3-5/6' },
  { ETag: '"one"', 'Content-Range': 'bytes 2-5/6' },
  { ETag: '"one"', 'Content-Range': 'bytes 3-5/7' },
  { ETag: 'W/"one"', 'Content-Range': 'bytes 3-5/6' },
])('rejects unsafe resumption response %j', async headers => {
  const f = await fixture(); await partial(f);
  await expect(downloadArtifact(f.artifact, f.root, { fetcher: async () => new Response('def', { status: 206, headers }), retries: 0 })).rejects.toThrow('ARTIFACT_RANGE');
  expect((await readdir(f.root)).some(name => name.endsWith('.blob'))).toBe(false);
});
test('server ignoring Range restarts rather than appending its full representation', async () => {
  const f = await fixture(); await partial(f);
  const path = await downloadArtifact(f.artifact, f.root, { fetcher: async () => new Response('abcdef', { headers: { ETag: '"two"' } }) });
  expect(await readFile(path, 'utf8')).toBe('abcdef');
});
test('rejects content encoding and length mismatch before publishing any bytes', async () => {
  for (const headers of [{ 'Content-Encoding': 'gzip' }, { 'Content-Length': '7' }] as Record<string, string>[]) {
    const f = await fixture();
    await expect(downloadArtifact(f.artifact, f.root, { fetcher: async () => new Response('abcdef', { headers }), retries: 0 })).rejects.toThrow(/ARTIFACT_(ENCODING|SIZE)/);
  }
});
test('checks the actual selected volume before requesting an artifact', async () => {
  const f = await fixture(); let requested = false;
  await expect(downloadArtifact({ ...f.artifact, sizeBytes: 1_000_000_000_000 }, f.root, { fetcher: async () => { requested = true; return new Response(''); } })).rejects.toThrow('STORAGE_FULL');
  expect(requested).toBe(false);
});
test('follows only named HTTPS redirect hosts without cookies or authorization', async () => {
  const f = await fixture(); const targets: string[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    targets.push(url); expect(init.credentials).toBe('omit'); expect(new Headers(init.headers).get('authorization')).toBeNull();
    return targets.length === 1 ? new Response(null, { status: 302, headers: { Location: 'https://cdn.example/immutable?download=signed' } }) : new Response('abcdef');
  };
  expect(await readFile(await downloadArtifact(f.artifact, f.root, { fetcher }), 'utf8')).toBe('abcdef');
  const other = await fixture();
  await expect(downloadArtifact(other.artifact, other.root, { fetcher: async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example/file' } }), retries: 0 })).rejects.toThrow('ARTIFACT_REDIRECT');
});
test('bounded retry honors retryable GET errors, while permanent errors do not loop', async () => {
  const f = await fixture(); let calls = 0;
  await downloadArtifact(f.artifact, f.root, { fetcher: async () => ++calls === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '0' } }) : new Response('abcdef') });
  expect(calls).toBe(2);
  const other = await fixture(); calls = 0;
  await expect(downloadArtifact(other.artifact, other.root, { fetcher: async () => { calls++; return new Response(null, { status: 403 }); } })).rejects.toThrow('DOWNLOAD_HTTP_403');
  expect(calls).toBe(1);
});
test('retries an interrupted public GET with validated range identity and retained bytes', async () => {
  const f = await fixture(); let requests = 0; let chunks = 0;
  const path = await downloadArtifact(f.artifact, f.root, { fetcher: async (_url, init) => {
    if (++requests === 1) return new Response(new ReadableStream({ pull(c) { if (chunks++ === 0) c.enqueue(Buffer.from('abc')); else throw new TypeError('socket interrupted'); } }, { highWaterMark: 0 }), { headers: { ETag: '"one"' } });
    expect(new Headers(init.headers).get('Range')).toBe('bytes=3-');
    return new Response('def', { status: 206, headers: { ETag: '"one"', 'Content-Range': 'bytes 3-5/6' } });
  } });
  expect(await readFile(path, 'utf8')).toBe('abcdef'); expect(requests).toBe(2);
});
