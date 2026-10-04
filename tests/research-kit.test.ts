import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, readdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import provenance from './fixtures/research-kit/provenance.json';
import { ResearchKit, validatorEnvironment, parseValidatorReport } from '../src/adapters/research-kit/adapter';
import { BindingSchema } from '../src/adapters/research-kit/contracts';

let root: string; let nodeSha256: string; let kit: ResearchKit;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const fixture = (name: string) => resolve('tests/fixtures/research-kit', name + '.zip');
const binding = { projectId: 'project-one', projectRevision: 1, jobId: 'job-one', jobRevision: 1, ...provenance.identity };
const config = () => ({ kitRoot: resolve('.build/research-kit-external/research-kit'), nodePath: process.execPath, nodeSha256, storageRoot: join(root, 'private'), helperPath: resolve('.build/native/MoonAlizaHost.exe') });
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'monnzila-research-')); nodeSha256 = digest(await readFile(process.execPath)); kit = new ResearchKit(config()); }, 30000);
afterAll(async () => { await kit?.close(); if (root) { const rel = relative(resolve(tmpdir()), root); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); } });

test.each(provenance.fixtures)('real pinned validator matches exact golden $name bytes and report', async golden => {
  const bytes = await readFile(fixture(golden.name));
  expect(bytes.length).toBe(golden.byteLength); expect(digest(bytes)).toBe(golden.sha256);
  expect(await kit.inspect(bytes, binding.clientRef)).toEqual(golden.expected.report);
}, 60000);

test.each(['approved', 'collected', 'failed', 'legacy-review'])('consumer binds and retains producer artifact %s without granting app permission', async name => {
  const result = await kit.validate(fixture(name), binding);
  expect(result.status).toBe('PASS'); expect(result.researchReady).toBe(name === 'approved');
  expect(result).not.toHaveProperty('buildAuthorized');
  expect(result.receipt).toMatchObject({ validatorRevision: provenance.validatorRevision, binding });
  const bytes = await kit.readVerified(result.receipt!.id, binding);
  expect(bytes.equals(await readFile(fixture(name)))).toBe(true);
  if (name === 'legacy-review') expect(result.state).toBe('REVIEW_REQUIRED');
}, 60000);

test.each(['unsupported', 'mixed-era', 'contradictory', 'tampered', 'missing-capture', 'broken-chain', 'broken-citation', 'traversal', 'duplicate', 'symlink', 'bomb'])('consumer fails closed for %s', async name => {
  const result = await kit.validate(fixture(name), binding);
  expect(result.status).not.toBe('PASS'); expect(result.researchReady).toBe(false); expect(result.receipt).toBeNull();
}, 60000);

test.each(['clientRef', 'repository', 'ref', 'commit', 'workflow', 'workflowRunId', 'runAttempt'] as const)('rejects wrong dispatch %s', async field => {
  const changed = { ...binding, [field]: typeof binding[field] === 'number' ? 2 : field === 'commit' ? '0'.repeat(40) : 'other' };
  if (field === 'repository') changed.repository = 'other/repo';
  const result = await kit.validate(fixture('approved'), changed);
  expect(result.researchReady).toBe(false); expect(result.receipt).toBeNull();
}, 60000);

test('retained reads reject stale revisions, replacement bytes and unknown receipts after restart', async () => {
  const input = join(root, 'selected.zip'); await cp(fixture('approved'), input);
  const result = await kit.validate(input, binding); const receipt = result.receipt!;
  await writeFile(input, 'replaced source');
  expect(digest(await kit.readVerified(receipt.id, binding))).toBe(receipt.artifactSha256);
  await expect(kit.readVerified(receipt.id, { ...binding, jobRevision: 2 })).rejects.toThrow('STALE_VERIFICATION');
  await expect(kit.readVerified(receipt.id, { ...binding, projectRevision: 2 })).rejects.toThrow('STALE_VERIFICATION');
  const restarted = new ResearchKit(config());
  await expect(restarted.readVerified(receipt.id, binding)).rejects.toThrow('STALE_VERIFICATION'); await restarted.close();
  await writeFile(join(config().storageRoot, 'artifacts', receipt.artifactSha256 + '.zip'), 'tampered retained bytes');
  await expect(kit.readVerified(receipt.id, binding)).rejects.toThrow('STALE_VERIFICATION');
}, 60000);

test('changed runtime and missing installation fail closed', async () => {
  for (const patch of [{ nodeSha256: '0'.repeat(64) }, { kitRoot: join(root, 'missing') }]) {
    const other = new ResearchKit({ ...config(), ...patch, storageRoot: join(root, 'bad-' + Object.keys(patch)[0]) });
    try { const result = await other.validate(fixture('approved'), binding); expect(result).toMatchObject({ researchReady: false, receipt: null, error: 'INSTALLATION_INVALID' }); }
    finally { await other.close(); }
  }
}, 60000);

test('a modified installed CLI is rejected before it can execute', async () => {
  const source = join(root, 'changed-kit'); await cp(config().kitRoot, source, { recursive: true });
  const marker = join(root, 'untrusted-started');
  await writeFile(join(source, 'bin/artifact.mjs'), `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'started');`);
  const other = new ResearchKit({ ...config(), kitRoot: source, storageRoot: join(root, 'modified-installation') });
  try { expect(await other.validate(fixture('approved'), binding)).toMatchObject({ error: 'INSTALLATION_INVALID', receipt: null }); await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' }); }
  finally { await other.close(); }
}, 60000);

test('Stop and bounded input return sanitized failures and no receipt', async () => {
  const controller = new AbortController(); controller.abort();
  expect(await kit.validate(fixture('approved'), binding, controller.signal)).toMatchObject({ error: 'CANCELLED', receipt: null });
  const large = join(root, 'large.zip'); await writeFile(large, Buffer.alloc(32 * 1024 ** 2 + 1));
  expect(await kit.validate(large, binding)).toMatchObject({ error: 'INPUT_LIMIT', receipt: null });
  // Neither early refusal creates work; an earlier test in the file may or may not have created the directory.
  expect(await readdir(join(config().storageRoot, 'work')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; })).toEqual([]);
}, 60000);

test('strict owned contracts reject extra caller authority and inherited credentials', () => {
  expect(() => BindingSchema.parse({ ...binding, executable: 'anything' })).toThrow();
  const env = validatorEnvironment(root, { SystemRoot: 'C:\\Windows', PATH: 'leak', NODE_OPTIONS: '--require attacker', GH_TOKEN: 'synthetic-secret' });
  expect(env).toEqual({ SystemRoot: 'C:\\Windows', TEMP: root, TMP: root, TMPDIR: root, HOME: root, USERPROFILE: root });
});

test('malformed, oversized or contradictory process results cannot become a PASS', () => {
  const report = provenance.fixtures[0]!.expected.report;
  const run = { status: 'exited' as const, code: 0, output: JSON.stringify(report), truncated: false, cancelled: false, timedOut: false };
  expect(parseValidatorReport(run)).toEqual(report);
  for (const patch of [{ output: '{}' }, { code: 1 }, { truncated: true }, { cancelled: true }, { timedOut: true }, { status: 'unknown' as const }, { output: 'x'.repeat(262145) }]) expect(() => parseValidatorReport({ ...run, ...patch })).toThrow();
});
