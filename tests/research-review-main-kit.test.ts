import { afterAll, beforeAll, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import provenance from './fixtures/research-kit/provenance.json';
import { createArgs, ResearchKit } from '../src/adapters/research-kit/adapter';
import type { OwnedRunner } from '../src/tools/commands';

// The adapter's review helpers (Task 5, B3): create's argv, the review part of sweep, discardReview and verifyRetained.
let root: string; let nodeSha256: string;
const fixture = resolve('tests/fixtures/research-kit/collected.zip');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const identity = { clientRef: 'moonaliza-fixture', repository: 'owner/collector', ref: 'main', commit: 'a'.repeat(40), workflow: 'collect.yml', workflowRunId: 7, runAttempt: 2 };
const runner: OwnedRunner = async (request, signal, options = {}) => {
  if (signal?.aborted) throw new Error('RUN_CANCELLED');
  await options.beforeStart?.(); options.onStarted?.({ pid: 4242, createdAt: '1' });
  return new Promise(done => execFile(request.executable, request.args, { cwd: request.cwd, env: request.env, timeout: request.timeoutMs, maxBuffer: request.maxOutputBytes, encoding: 'utf8' },
    (error, stdout) => done({ status: 'exited', code: error ? (typeof error.code === 'number' ? error.code : null) : 0, output: stdout, truncated: false, cancelled: false, timedOut: false })));
};
const make = (name: string) => new ResearchKit({ kitRoot: resolve('.build/research-kit-external/research-kit'), nodePath: process.execPath, nodeSha256, storageRoot: join(root, name), helperPath: resolve('.build/native/MoonAlizaHost.exe') }, runner);

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'moonzila-review-kit-')); nodeSha256 = digest(await readFile(process.execPath)); });
afterAll(async () => { if (root) { const rel = relative(resolve(tmpdir()), root); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); } });

test('create gets one --name=value element per value; the Q8 values only in a plain shape; an identity the binding refuses throws', () => {
  const rootDir = join(root, 'ws'); const output = join(root, 'out', 'reviewed.zip');
  expect(createArgs(rootDir, output, { ...identity, runUrl: 'https://api.github.com/repos/owner/collector/actions/runs/7', htmlUrl: 'https://github.com/owner/collector/actions/runs/7', apiVersion: '2022-11-28' })).toEqual([
    'create', `--root=${rootDir}`, `--output=${output}`, '--client-ref=moonaliza-fixture', '--repository=owner/collector', '--ref=main', `--commit=${'a'.repeat(40)}`, '--workflow=collect.yml', '--run-id=7', '--run-attempt=2',
    '--run-url=https://api.github.com/repos/owner/collector/actions/runs/7', '--html-url=https://github.com/owner/collector/actions/runs/7', '--api-version=2022-11-28',
  ]);
  // A value shaped like a flag stays inside its own element; odd Q8 values are left to the kit's defaults.
  const odd = createArgs(rootDir, output, { ...identity, ref: '--build-authorized', runUrl: 'http://example.invalid/x', htmlUrl: 'https://x.invalid/a b', apiVersion: '--state=APPROVED' });
  expect(odd).toContain('--ref=--build-authorized'); expect(odd).toHaveLength(10);
  expect(() => createArgs(rootDir, output, { ...identity, commit: 'not-a-sha' })).toThrow();
  expect(() => createArgs(rootDir, output, { ...identity, repository: 'x' })).toThrow();
});

test('sweep keeps every job\'s project/ and removes the per-attempt staging, scratch, out and temp folders', async () => {
  const storage = join(root, 'sweep'); const job = join(storage, 'review', 'job-1');
  for (const name of ['project/research', 'staging-1/project', 'scratch-2/project', 'out-3', 'temp-4']) await mkdir(join(job, name), { recursive: true });
  await writeFile(join(job, 'project', 'research', 'MAP.md'), 'kept');
  const kit = make('sweep');
  try {
    await kit.sweep();
    expect(await readdir(job)).toEqual(['project']);
    expect(await readFile(join(job, 'project', 'research', 'MAP.md'), 'utf8')).toBe('kept');
  } finally { await kit.close(); }
});

test('discardReview removes exactly the named plain job folders and nothing else', async () => {
  const storage = join(root, 'discard');
  for (const name of ['gone', 'kept']) await mkdir(join(storage, 'review', name, 'project'), { recursive: true });
  const kit = make('discard');
  try {
    await kit.discardReview(['..', '.', 'kept/..', '', 'gone']);
    expect(await readdir(join(storage, 'review'))).toEqual(['kept']);
    expect(await readdir(storage)).toEqual(['review']);
  } finally { await kit.close(); }
});

test('verifyRetained returns the verified bytes of storage/artifacts/<sha>.zip; another digest or torn bytes are STALE_VERIFICATION', async () => {
  const kit = make('retained'); const bytes = await readFile(fixture); const sha = digest(bytes);
  const binding = { projectId: 'p', projectRevision: 1, jobId: 'j', jobRevision: 3, ...provenance.identity };
  try {
    expect(await kit.validate(fixture, binding)).toMatchObject({ status: 'PASS' });
    const verified = await kit.verifyRetained(sha, binding);
    expect(verified.bytes.equals(bytes)).toBe(true); expect(verified.receipt.artifactSha256).toBe(sha);
    await expect(kit.verifyRetained('f'.repeat(64), binding)).rejects.toThrow('STALE_VERIFICATION');
    await expect(kit.verifyRetained(sha, { ...binding, commit: 'f'.repeat(40) })).rejects.toThrow('STALE_VERIFICATION');
    await writeFile(join(root, 'retained', 'artifacts', `${sha}.zip`), bytes.subarray(0, 500));
    await expect(kit.verifyRetained(sha, binding)).rejects.toThrow('STALE_VERIFICATION');
  } finally { await kit.close(); }
}, 60000);
