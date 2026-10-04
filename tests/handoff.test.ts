import { execFile } from 'node:child_process';
import { appendFile, cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';

const directories: string[] = [];
const check = (root: string) => promisify(execFile)(process.execPath, [resolve('scripts/check-handoff.mjs'), root], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
afterEach(async () => { for (const root of directories.splice(0)) { const child = relative(resolve(tmpdir()), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('FIXTURE_PATH'); await rm(root, { recursive: true, force: true }); } });
async function checkout() {
  const root = await mkdtemp(join(tmpdir(), 'monnzila-handoff-')); directories.push(root);
  for (const path of ['AGENTS.md', 'HANDOFF.md', 'README.md', 'docs', 'research', '.node-version', 'package.json', '.github']) await cp(resolve(path), join(root, path), { recursive: true });
  return root;
}

test('handoff verification needs only checkout files and accounts for every historical artifact', async () => {
  const root = await checkout();
  const { stdout } = await check(root);
  expect(JSON.parse(stdout)).toMatchObject({ sourceFiles: 81, included: 76, metadataOnly: 5 });
});

test('changed research bytes fail the handoff check instead of silently changing retained evidence', async () => {
  const root = await checkout();
  const manifest = JSON.parse(await readFile(join(root, 'docs/handoff/manifest.json'), 'utf8'));
  const entry = manifest.files.find((file: { disposition: string }) => file.disposition === 'included');
  await appendFile(join(root, 'docs/handoff', entry.path), 'modified');
  await expect(check(root)).rejects.toMatchObject({ stderr: expect.stringContaining('HANDOFF_INTEGRITY') });
});

test('a broken continuation link is reported before handing a checkout to another developer', async () => {
  const root = await checkout(); await appendFile(join(root, 'HANDOFF.md'), '\n[Required continuation](missing-required.md)\n');
  await expect(check(root)).rejects.toMatchObject({ stderr: expect.stringContaining('HANDOFF_LINK') });
});
