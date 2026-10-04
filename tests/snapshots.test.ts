import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, test } from 'vitest';
import { SnapshotStore } from '../src/tools/snapshots';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(limit = 12) {
  const root = await mkdtemp(join(tmpdir(), 'monnzila-snapshots-')); roots.push(root);
  const pinned = new Set<string>(); const storage = new SnapshotStore(root, () => pinned, limit);
  const save = (text: string) => storage.retain([Buffer.from(text)], hashes => hashes[0]!);
  return { root, pinned, storage, save };
}
test('deduplicates contents and reports exact managed usage', async () => {
  const f = await fixture(); const hash = await f.save('1234'); expect(await f.save('1234')).toBe(hash);
  expect(await f.storage.stats()).toEqual({ usedBytes: 4, limitBytes: 12, snapshotCount: 1, protectedBytes: 0 });
  expect(await f.storage.read(hash)).toBe('1234');
});
test('evicts only unprotected snapshots and persists unavailable history after reopen', async () => {
  const f = await fixture(8); const old = await f.save('1234'); const pinned = await f.save('5678'); f.pinned.add(pinned);
  const recent = await f.save('abcd');
  expect(await f.storage.available(old)).toBe(false); expect(await f.storage.read(pinned)).toBe('5678'); expect(await f.storage.read(recent)).toBe('abcd');
  const reopened = new SnapshotStore(f.root, () => f.pinned, 8); expect(await reopened.available(old)).toBe(false); expect((await reopened.stats()).usedBytes).toBe(8);
});
test('reserves a complete before/after pair and refuses exhausted protected storage without evicting it', async () => {
  const f = await fixture(8); const hash = await f.save('1234'); f.pinned.add(hash);
  await expect(f.storage.retain([Buffer.from('before'), Buffer.from('after')], () => {})).rejects.toThrow('SNAPSHOT_QUOTA');
  expect(await f.storage.read(hash)).toBe('1234'); expect((await f.storage.stats()).usedBytes).toBe(4);
  await expect(f.save('123456')).rejects.toThrow('SNAPSHOT_QUOTA'); expect(await f.storage.read(hash)).toBe('1234');
});
test('serializes concurrent reservations until each operation has recorded its protected references', async () => {
  const f = await fixture(8); let release!: () => void; const pause = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const first = f.storage.retain([Buffer.from('123456')], async hashes => { entered(); await pause; f.pinned.add(hashes[0]!); return hashes[0]!; });
  await started; const second = f.save('abcdef'); const rejected = expect(second).rejects.toThrow('SNAPSHOT_QUOTA');
  release(); const hash = await first; await rejected; expect(await f.storage.read(hash)).toBe('123456');
});
test('rejects corrupted snapshots and bounds reads before trusting an existing hash file', async () => {
  const f = await fixture(); const hash = await f.save('1234'); await writeFile(join(f.root, hash), 'xxxx');
  await expect(f.storage.read(hash)).rejects.toThrow('SNAPSHOT_CORRUPT'); await expect(f.save('1234')).rejects.toThrow('SNAPSHOT_CORRUPT');
  expect(await f.storage.available(hash)).toBe(false); await expect(f.storage.read('../outside')).rejects.toThrow('INVALID_SNAPSHOT');
});
test('refuses an unsafe snapshot entry without deleting unrelated files', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'notes.txt'), 'keep');
  await expect(f.save('1234')).rejects.toThrow('SNAPSHOT_CORRUPT'); expect(await readFile(join(f.root, 'notes.txt'), 'utf8')).toBe('keep');
});
