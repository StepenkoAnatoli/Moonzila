import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { extractRuntimeArchive } from '../src/models/archive';
import { zipFixture } from './fixtures/zip';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(entries: Parameters<typeof zipFixture>[0]) {
  const root = await mkdtemp(join(tmpdir(), 'monnzila-zip-')); roots.push(root);
  const archive = join(root, 'runtime.zip'), destination = join(root, 'extracted'); await writeFile(archive, zipFixture(entries)); return { root, archive, destination };
}
const limits = { maxExpandedBytes: 1024, maxEntries: 10 };
test('streams safe runtime contents with actual sizes and SHA-256 identities', async () => {
  const f = await fixture([{ name: 'lib/' }, { name: 'lib/cpu.dll', content: 'abc' }, { name: 'ollama.exe', content: 'test' }]);
  const report = await extractRuntimeArchive(f.archive, f.destination, limits);
  expect(await readFile(join(f.destination, 'lib/cpu.dll'), 'utf8')).toBe('abc');
  expect(report).toEqual({ expandedBytes: 7, files: [{ path: 'lib/cpu.dll', sizeBytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }, { path: 'ollama.exe', sizeBytes: 4, sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' }] });
});
test.each(['../outside', '/absolute', 'C:/outside', 'dir\\outside', 'file:stream', 'CON.txt', 'dir/../x', 'dir//x', 'dir./x', 'file ', 'LPT1', 'dir/./x'])('rejects unsafe Windows archive path %s and removes its own staging', async name => {
  const f = await fixture([{ name: 'good', content: 'temporary' }, { name, content: 'bad' }]);
  await expect(extractRuntimeArchive(f.archive, f.destination, limits)).rejects.toThrow(/ARCHIVE_/);
  await expect(stat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(stat(join(f.root, 'outside'))).rejects.toMatchObject({ code: 'ENOENT' });
});
test.each([
  [{ name: 'same' }, { name: 'same' }], [{ name: 'File' }, { name: 'file' }],
  [{ name: 'Dir/a' }, { name: 'dir/b' }], [{ name: 'dir/' }, { name: 'dir/' }],
  [{ name: 'dir' }, { name: 'dir/a' }], [{ name: 'link', mode: 0o120777, content: '../outside' }],
  [{ name: 'encrypted', flags: 1 }], [{ name: 'bad', content: 'hello', badCrc: true }],
].map(entries => ({ entries })))('rejects aliases, links, encryption and corrupt CRC %j', async ({ entries }) => {
  const f = await fixture(entries); await expect(extractRuntimeArchive(f.archive, f.destination, limits)).rejects.toThrow(/ARCHIVE_/);
  await expect(stat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('enforces declared and actual expansion and entry count limits', async () => {
  for (const entries of [[{ name: 'large', content: 'a'.repeat(1025) }], [{ name: 'lying', content: 'a'.repeat(1025), declaredSize: 2 }], Array.from({ length: 11 }, (_, i) => ({ name: `item${i}` }))]) {
    const f = await fixture(entries); await expect(extractRuntimeArchive(f.archive, f.destination, limits)).rejects.toThrow(/ARCHIVE_/); await expect(stat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
  }
});
test('cancellation never publishes a partially extracted runtime', async () => {
  const f = await fixture([{ name: 'large', content: 'a'.repeat(1024 * 1024) }]); const controller = new AbortController();
  controller.abort(); await expect(extractRuntimeArchive(f.archive, f.destination, { ...limits, signal: controller.signal })).rejects.toThrow('ARCHIVE_CANCELLED'); await expect(stat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('refuses an existing destination and preserves its files', async () => {
  const f = await fixture([{ name: 'existing', content: 'changed' }]); await mkdir(f.destination); await writeFile(join(f.destination, 'existing'), 'original');
  await expect(extractRuntimeArchive(f.archive, f.destination, limits)).rejects.toThrow('ARCHIVE_DESTINATION_EXISTS'); expect(await readFile(join(f.destination, 'existing'), 'utf8')).toBe('original');
});
