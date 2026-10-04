import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import fsp, { link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import * as archive from '../src/adapters/research-kit/archive';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { crc32 } from 'node:zlib';

/**
 * The private workspace's layered checks, each by an input only it catches (Phase 3 mutation survivors W3e, W7a, W7b,
 * W7d, W7e). One layer is bypassed: `lstat` answers what a file swapped between two looks would show, and the archive
 * reader's own checks are replaced by a manifest. Every path stays inside this test's own mkdtemp root.
 */
// The node test project runs files in one worker without isolation, so no vi.mock here: lstat is swapped on the builtin
// module and synced to every importer (module.syncBuiltinESMExports), and restored after each test; the archive reader is
// spied on, and restoreMocks undoes it.
const realLstat = fsp.lstat;
function swapLstat(lstat?: (path: string, real: (path: string) => Promise<Stats>) => Promise<Stats>) {
  (fsp as { lstat: unknown }).lstat = lstat ? (path: string) => lstat(path, file => realLstat(file) as Promise<Stats>) : realLstat;
  syncBuiltinESMExports();
}
const { materialise, treeInventory } = await import('../src/main/review-workspace');

let root: string; let n = 0;
const fresh = async () => { const dir = join(root, `case-${++n}`); await mkdir(dir); return dir; };
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'moonzila-review-layers-')); });
afterEach(() => { swapLstat(); });
afterAll(async () => { if (root) { const rel = relative(resolve(tmpdir()), root); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); } });

/** The real Stats of `path` with some fields overridden; the type predicates can be overridden too. */
async function stats(real: (path: string) => Promise<Stats>, path: string, override: Partial<Pick<Stats, 'nlink'>> & { file?: boolean }): Promise<Stats> {
  const info = await real(path);
  const copy = Object.assign(Object.create(Object.getPrototypeOf(info) as object) as Stats, info, override.nlink === undefined ? {} : { nlink: override.nlink });
  if (override.file === false) { copy.isFile = () => false; copy.isDirectory = () => false; }
  return copy;
}
/** For `target` only, its first lstat (the walk) and its second (the hash) answer as given. */
function onLooks(target: string, first: Parameters<typeof stats>[2] | null, second: Parameters<typeof stats>[2] | null) {
  let looks = 0;
  swapLstat((path, real) => {
    if (resolve(path) !== resolve(target)) return real(path);
    const look = ++looks === 1 ? first : looks === 2 ? second : null;
    return look ? stats(real, path, look) : real(path);
  });
}
async function workspace() {
  const project = await fresh(); await mkdir(join(project, 'research'));
  await writeFile(join(project, 'research', 'MAP.md'), 'map'); await writeFile(join(project, 'AGENTS.md'), 'agents');
  return { project, map: join(project, 'research', 'MAP.md') };
}

test('a file that is no regular file at the walk, but is at the hash, is refused by the walk', async () => {
  // Guard: treeInventory's walk refuses a non-file entry (W7a).
  const { project, map } = await workspace();
  onLooks(map, { file: false }, null);
  await expect(treeInventory(project)).rejects.toThrow('REVIEW_WORKSPACE_CHANGED');
});

test('a file that is regular at the walk, but not at the hash, is refused by the hash', async () => {
  // Guard: hashRegular's own type check of its lstat (W7b).
  const { project, map } = await workspace();
  onLooks(map, null, { file: false });
  await expect(treeInventory(project)).rejects.toThrow('REVIEW_WORKSPACE_CHANGED');
});

test('a second name seen only by the lstat, or only by the opened handle, is refused by that one', async () => {
  // Guards: hashRegular's link count on the lstat (W7d) and on the opened handle (W7e).
  const first = await workspace();
  onLooks(first.map, null, { nlink: 2 });
  await expect(treeInventory(first.project)).rejects.toThrow('REVIEW_WORKSPACE_CHANGED');
  // A real hard link, which the lstat is made to miss: only the handle's count shows it.
  const second = await workspace();
  await link(second.map, join(await fresh(), 'alias.md'));
  onLooks(second.map, null, { nlink: 1 });
  await expect(treeInventory(second.project)).rejects.toThrow('REVIEW_WORKSPACE_CHANGED');
  swapLstat();
  expect(await readFile(second.map, 'utf8')).toBe('map');
});

/** A stored ZIP whose entries may repeat a name, which the archive reader would refuse. */
function storedZip(entries: Array<[string, string]>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const [name, text] of entries) {
    const data = Buffer.from(text); const fileName = Buffer.from(name); const crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fileName.length, 28); central.writeUInt32LE((0o100644 << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, data); centrals.push(central, fileName); offset += 30 + fileName.length + data.length;
  }
  const directory = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('an entry name repeated in the archive is refused by materialisation itself when the archive reader is bypassed', async () => {
  // Guard: materialise's own duplicate-name check (W3e); without it, the second write fails with EEXIST instead.
  vi.spyOn(archive, 'inspectArchive').mockResolvedValue({ files: [{ path: 'project/research/MAP.md', sha256: digest('map'), byteLength: 3 }], source: {} });
  const job = await fresh();
  await expect(materialise(storedZip([['project/research/MAP.md', 'map'], ['project/research/MAP.md', 'map'], ['manifest.json', '{}']]), job)).rejects.toThrow('ARTIFACT_INVALID');
});
