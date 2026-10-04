import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile, link, symlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnOwned, safeCommandEnvironment } from '../src/tools/commands';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'moonzila-guard-')); roots.push(root);
  const folder = join(root, 'locked'); await mkdir(folder);
  const file = join(folder, 'input.txt'); await writeFile(file, 'verified bytes');
  return { root, folder, file };
}
afterEach(async () => { for (const root of roots.splice(0)) { const child = relative(resolve(tmpdir()), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('FIXTURE_PATH'); await rm(root, { recursive: true, force: true }); } });
const request = (cwd: string, args: string[]) => ({ executable: process.execPath, args, cwd, env: safeCommandEnvironment(), timeoutMs: 5000, maxOutputBytes: 8192 });

test('guarded admission locks the exact file and its directory before verification and execution', async () => {
  const { root, folder, file } = await fixture(); let checked = false;
  const result = await spawnOwned(request(root, ['-e', 'console.log(require("fs").readFileSync(process.argv[1],"utf8"))', file]), undefined, {
    readLocks: [file, process.execPath],
    beforeStart: async () => {
      checked = true;
      expect(await readFile(file, 'utf8')).toBe('verified bytes');
      await expect(writeFile(file, 'changed')).rejects.toThrow();
      await expect(rename(folder, join(root, 'swapped'))).rejects.toThrow();
    },
  });
  expect(checked).toBe(true); expect(result).toMatchObject({ status: 'exited', code: 0, output: 'verified bytes\n' });
  await writeFile(file, 'unlocked'); expect(await readFile(file, 'utf8')).toBe('unlocked');
});

test('failed byte verification never launches a child and releases all locks', async () => {
  const { root, file } = await fixture(); const marker = join(root, 'started');
  await expect(spawnOwned(request(root, ['-e', 'require("fs").writeFileSync(process.argv[1],"started")', marker]), undefined, {
    readLocks: [file], beforeStart: async () => { throw new Error('DIGEST_MISMATCH'); },
  })).rejects.toThrow('DIGEST_MISMATCH');
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' }); await writeFile(file, 'unlocked');
});

test('Stop during guarded admission prevents launch and releases its locks', async () => {
  const { root, file } = await fixture(); const marker = join(root, 'started'); const controller = new AbortController();
  const result = await spawnOwned(request(root, ['-e', 'require("fs").writeFileSync(process.argv[1],"started")', marker]), controller.signal, {
    readLocks: [file], beforeStart: async () => { controller.abort(); },
  });
  expect(result.cancelled).toBe(true); await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' }); await writeFile(file, 'unlocked');
});

test('an opted-in output bound stops the owned process rather than waiting for its timeout', async () => {
  const { root } = await fixture();
  const result = await spawnOwned({ ...request(root, ['-e', 'setInterval(()=>process.stdout.write("x".repeat(4096)),1)']), maxOutputBytes: 128 }, undefined, { stopOnOutputLimit: true });
  expect(result).toMatchObject({ status: 'exited', truncated: true, cancelled: true, timedOut: false }); expect(Buffer.byteLength(result.output)).toBe(128);
});

test('a stalled admission has a deadline and releases the file without launching', async () => {
  const { root, file } = await fixture(); const marker = join(root, 'started');
  const result = await spawnOwned({ ...request(root, ['-e', 'require("fs").writeFileSync(process.argv[1],"started")', marker]), timeoutMs: 500 }, undefined, {
    readLocks: [file], beforeStart: () => new Promise(() => {}),
  });
  expect(result.timedOut).toBe(true); await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' }); await writeFile(file, 'unlocked');
});

test('guards refuse linked leaves, junction ancestors and directory-as-file guards', async () => {
  const { root, file, folder } = await fixture();
  const alias = join(root, 'alias'); await symlink(folder, alias, 'junction');
  const hardlink = join(root, 'hardlink'); await link(file, hardlink);
  const regular = join(root, 'regular'); await writeFile(regular, 'unlinked');
  for (const locks of [[hardlink], [join(alias, 'input.txt')], [regular, root]]) {
    let admitted = false;
    const result = await spawnOwned(request(root, ['-e', 'process.exit(0)']), undefined, { readLocks: locks, beforeStart: async () => { admitted = true; } });
    expect(admitted).toBe(false); expect(result.status).toBe('failed');
  }
});

test('guarded execution still reports its owned process identity', async () => {
  const { root, file } = await fixture(); let pid = 0;
  const result = await spawnOwned(request(root, ['-e', 'console.log(process.pid)']), undefined, { readLocks: [file], beforeStart: async () => {}, onStarted: identity => { pid = identity.pid; } });
  expect(result.status).toBe('exited'); expect(Number(result.output.trim())).toBe(pid); expect(pid).toBeGreaterThan(0);
});
