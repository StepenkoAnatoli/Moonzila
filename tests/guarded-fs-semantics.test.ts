import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, open, readFile, readdir, rename, rm, rmdir, stat, truncate, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnOwned, safeCommandEnvironment } from '../src/tools/commands';

// Day-one checks from docs/research/2026-10-03-windows-file-semantics/research/BRIEF.md ("Decision",
// "First build step"). They exercise NTFS share modes and MoveFileExW through the native helper and
// Node's fs, so they mean nothing elsewhere: on other platforms the file is collected and skipped.
const windows = process.platform === 'win32';
const SKIP_REASON = 'Windows only: NTFS share modes, the native helper and MoveFileExW';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'moonaliza-fs-semantics-')); roots.push(root);
  const folder = join(root, 'locked'); await mkdir(folder);
  const file = join(folder, 'input.txt'); await writeFile(file, 'verified bytes');
  return { root, folder, file };
}
afterEach(async () => { for (const root of roots.splice(0)) { const child = relative(resolve(tmpdir()), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('FIXTURE_PATH'); await rm(root, { recursive: true, force: true }); } });

/** 'ok' when the operation succeeded, otherwise the error code it was refused with. */
async function attempt(operation: () => Promise<unknown>): Promise<string> {
  try { await operation(); return 'ok'; } catch (error) { return String((error as NodeJS.ErrnoException).code ?? 'NO_CODE'); }
}

/**
 * Holds the helper's read guards on `file` (and so on every ancestor folder) while `whileGuarded` runs.
 * The helper is its own process, so everything `whileGuarded` does comes from a second process.
 */
async function withGuards(root: string, file: string, whileGuarded: () => Promise<void>) {
  let admitted = false;
  const result = await spawnOwned({ executable: process.execPath, args: ['-e', 'process.exit(0)'], cwd: root, env: safeCommandEnvironment(), timeoutMs: 10_000, maxOutputBytes: 8192 }, undefined, {
    readLocks: [file], beforeStart: async () => { admitted = true; await whileGuarded(); },
  });
  expect(admitted).toBe(true); expect(result).toMatchObject({ status: 'exited', code: 0 });
}

describe.skipIf(!windows)(`guarded file semantics (${SKIP_REASON})`, () => {
  test('while guarded, another process cannot write, delete or rename the file, nor rename or delete its folders', async () => {
    const { root, folder, file } = await fixture();
    const replacement = join(root, 'replacement.txt'); await writeFile(replacement, 'swapped bytes');
    const outcomes: Record<string, string> = {};
    // Printed whatever happens, so a red Windows CI run still records what each operation did.
    try {
      await withGuards(root, file, async () => {
        outcomes.read = await attempt(() => readFile(file, 'utf8'));
        outcomes.writeFile = await attempt(() => writeFile(file, 'changed'));
        outcomes.openForWrite = await attempt(async () => { const handle = await open(file, 'r+'); await handle.close(); });
        outcomes.truncate = await attempt(() => truncate(file, 0));
        outcomes.unlink = await attempt(() => unlink(file));
        outcomes.renameFile = await attempt(() => rename(file, join(folder, 'moved.txt')));
        outcomes.renameOverFile = await attempt(() => rename(replacement, file));
        outcomes.renameFolder = await attempt(() => rename(folder, join(root, 'swapped')));
        outcomes.renameAncestor = await attempt(() => rename(root, `${root}-moved`));
        outcomes.rmdirFolder = await attempt(() => rmdir(folder));
        outcomes.rmFolder = await attempt(() => rm(folder, { recursive: true }));
      });
    } finally { console.info('guarded file semantics', JSON.stringify(outcomes)); }
    const { read, ...refusals } = outcomes;
    expect(read).toBe('ok');
    for (const [operation, outcome] of Object.entries(refusals)) expect({ operation, outcome }).not.toMatchObject({ outcome: 'ok' });
    expect(await readFile(file, 'utf8')).toBe('verified bytes');
    expect(await readdir(folder)).toEqual(['input.txt']);
    expect(await readFile(replacement, 'utf8')).toBe('swapped bytes');
    // Control: the same operations succeed once the helper has released its guards.
    await writeFile(file, 'unlocked'); expect(await readFile(file, 'utf8')).toBe('unlocked');
    await rename(folder, join(root, 'swapped')); await rm(join(root, 'swapped'), { recursive: true });
  });

  test('Q9: records whether a new file and subfolder can be created inside a guarded folder', async () => {
    const { root, folder, file } = await fixture();
    const newFile = join(folder, 'new.txt'); const newFolder = join(folder, 'new-folder');
    let fileOutcome = ''; let folderOutcome = ''; let guardBefore = ''; let guardAfter = '';
    // The design must not depend on the answer (spec Q9): print it, even on a red run, and check only that it is one of two outcomes.
    try {
      await withGuards(root, file, async () => {
        guardBefore = await attempt(() => writeFile(file, 'witness'));
        fileOutcome = await attempt(() => writeFile(newFile, 'new entry'));
        folderOutcome = await attempt(() => mkdir(newFolder));
        guardAfter = await attempt(() => writeFile(file, 'witness'));
      });
    } finally { console.info('Q9 guarded folder accepts new entries', JSON.stringify({ file: fileOutcome, folder: folderOutcome, guardBefore, guardAfter })); }
    // Witness: the guarded file refused a write before and after, so the outcomes come from a guarded folder.
    expect(guardBefore).not.toBe('ok'); expect(guardAfter).not.toBe('ok');
    if (fileOutcome === 'ok') expect(await readFile(newFile, 'utf8')).toBe('new entry');
    else await expect(stat(newFile)).rejects.toMatchObject({ code: 'ENOENT' });
    if (folderOutcome === 'ok') expect((await stat(newFolder)).isDirectory()).toBe(true);
    else await expect(stat(newFolder)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(file, 'utf8')).toBe('verified bytes');
  });

  test('fs.rename of a temp file over an existing file in the same folder replaces it', async () => {
    const { folder } = await fixture();
    const destination = join(folder, 'package.zip'); const temporary = join(folder, 'package.zip.tmp');
    await writeFile(destination, 'old package'); await writeFile(temporary, 'new package');
    await rename(temporary, destination);
    expect(await readFile(destination, 'utf8')).toBe('new package');
    await expect(stat(temporary)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('fs.rename over a destination another handle holds open fails and leaves both files in place', async () => {
    const { folder } = await fixture();
    const destination = join(folder, 'package.zip'); const temporary = join(folder, 'package.zip.tmp');
    await writeFile(destination, 'old package'); await writeFile(temporary, 'new package');
    const reader = await open(destination, 'r');
    let outcome: string;
    try { outcome = await attempt(() => rename(temporary, destination)); } finally { await reader.close(); }
    console.info('rename over an open destination', JSON.stringify({ outcome }));
    expect(outcome).not.toBe('ok');
    expect(await readFile(destination, 'utf8')).toBe('old package');
    expect(await readFile(temporary, 'utf8')).toBe('new package');
    // Control: once the reader is closed the same rename replaces the destination.
    await rename(temporary, destination); expect(await readFile(destination, 'utf8')).toBe('new package');
  });
});
