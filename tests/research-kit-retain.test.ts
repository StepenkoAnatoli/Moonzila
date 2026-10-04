import { afterAll, beforeAll, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import provenance from './fixtures/research-kit/provenance.json';
import { ResearchKit } from '../src/adapters/research-kit/adapter';
import type { OwnedRunner } from '../src/tools/commands';

// Retaining a validated package in the content-addressed store, against the real pinned validator run with node
// (the native helper is replaced by a runner that does what it does before the child: admission, then the child).
let root: string; let nodeSha256: string;
const binding = { projectId: 'project-one', projectRevision: 1, jobId: 'job-one', jobRevision: 1, ...provenance.identity };
const fixture = resolve('tests/fixtures/research-kit/collected.zip');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const runner: OwnedRunner = async (request, signal, options = {}) => {
  if (signal?.aborted) throw new Error('RUN_CANCELLED');
  await options.beforeStart?.(); options.onStarted?.({ pid: 4242, createdAt: '1' });
  return new Promise(done => execFile(request.executable, request.args, { cwd: request.cwd, env: request.env, timeout: request.timeoutMs, maxBuffer: request.maxOutputBytes, encoding: 'utf8' },
    (error, stdout) => done({ status: 'exited', code: error ? (typeof error.code === 'number' ? error.code : null) : 0, output: stdout, truncated: false, cancelled: false, timedOut: false })));
};
const make = (name: string) => new ResearchKit({ kitRoot: resolve('.build/research-kit-external/research-kit'), nodePath: process.execPath, nodeSha256, storageRoot: join(root, name), helperPath: resolve('.build/native/MoonAlizaHost.exe') }, runner);

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'monnzila-retain-')); nodeSha256 = digest(await readFile(process.execPath)); });
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

test('a torn retained file left by a crash is replaced by the verified bytes, and nothing temporary stays in the store', async () => {
  const kit = make('torn');
  try {
    const bytes = await readFile(fixture); const sha = digest(bytes);
    const store = join(root, 'torn', 'artifacts'); await mkdir(store, { recursive: true });
    // What an interrupted write leaves: the content-addressed name with only part of the bytes.
    await writeFile(join(store, `${sha}.zip`), bytes.subarray(0, 1000));
    const result = await kit.validate(fixture, binding);
    expect(result).toMatchObject({ status: 'PASS', error: null });
    expect(digest(await readFile(join(store, `${sha}.zip`)))).toBe(sha);
    expect(await readdir(store)).toEqual([`${sha}.zip`]);
    expect((await kit.readVerified(result.receipt!.id, binding)).equals(bytes)).toBe(true);
  } finally { await kit.close(); }
}, 60000);

test('an entry in the store that is not a regular file is a local fault that defers, never a rejection of the package', async () => {
  const kit = make('stray');
  try {
    await mkdir(join(root, 'stray', 'artifacts', 'not-a-file'), { recursive: true });
    expect(await kit.validate(fixture, binding)).toMatchObject({ status: 'BLOCKED', error: 'INSTALLATION_INVALID', receipt: null });
  } finally { await kit.close(); }
}, 60000);
