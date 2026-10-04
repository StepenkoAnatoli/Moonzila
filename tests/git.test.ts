import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { buildGitCommand } from '../src/tools/git';
import { findCommand } from '../src/main/commands';
import { spawnOwned } from '../src/tools/commands';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'moonzila-git-')); roots.push(root);
  const git = await findCommand('git', process.env, []);
  const run = (...args: string[]) => execFileSync(git, args, { cwd: root, windowsHide: true, stdio: 'pipe' });
  run('init'); run('config', 'user.name', 'Fixture'); run('config', 'user.email', 'fixture@example.test');
  await writeFile(join(root, 'hello.txt'), 'before\n'); await writeFile(join(root, '.env'), 'PRIVATE=before\n');
  run('add', '.'); run('-c', 'commit.gpgsign=false', 'commit', '-m', 'Initial fixture');
  await writeFile(join(root, 'hello.txt'), 'after\n'); await writeFile(join(root, '.env'), 'PRIVATE=after\n');
  return { root, git, run, inspect: async (name: string, input: unknown = {}) => spawnOwned(await buildGitCommand(git, root, name, input)) };
}
test('fixed status, per-file diff and bounded log inspect a real repository without updating index', async () => {
  const f = await fixture(); const before = await readFile(join(f.root, '.git', 'index'));
  expect((await f.inspect('git_status')).output).toContain('hello.txt');
  const diff = await f.inspect('git_diff', { path: 'hello.txt' }); expect(diff.code).toBe(0); expect(diff.output).toContain('+after');
  expect((await f.inspect('git_log', { limit: 1 })).output).toContain('Initial fixture');
  expect((await f.inspect('git_diff')).output).not.toContain('PRIVATE=');
  expect(await readFile(join(f.root, '.git', 'index'))).toEqual(before);
});
test.each(['core.fsmonitor', 'core.hooksPath', 'diff.external', 'filter.fixture.clean', 'include.path', 'core.worktree'])('rejects dangerous local configuration %s before spawning', async key => {
  const f = await fixture(); const marker = join(f.root, 'should-not-exist.txt');
  f.run('config', key, `echo unsafe > "${marker}"`);
  await expect(f.inspect('git_status')).rejects.toThrow('GIT_UNSAFE_REPOSITORY');
  await expect(readFile(marker)).rejects.toThrow();
});
test('rejects sensitive or escaping patch paths and unknown command fields', async () => {
  const f = await fixture();
  for (const path of ['.env', '../outside.txt', '.git/config', '']) await expect(f.inspect('git_diff', { path })).rejects.toThrow();
  await expect(f.inspect('git_log', { args: ['--output=owned.txt'] })).rejects.toThrow();
  await expect(f.inspect('git_status', { command: 'reset' })).rejects.toThrow();
});
test('a file path cannot expand into a deleted directory containing private files', async () => {
  const f = await fixture(); await mkdir(join(f.root, 'former-directory'));
  await writeFile(join(f.root, 'former-directory', '.env'), 'PRIVATE_SENTINEL=value');
  f.run('add', 'former-directory');
  await rm(join(f.root, 'former-directory'), { recursive: true });
  await writeFile(join(f.root, 'former-directory'), 'ordinary file');
  expect((await f.inspect('git_diff', { path: 'former-directory' })).output).not.toContain('PRIVATE_SENTINEL');
});
test('rejects external object stores and linked worktrees', async () => {
  const f = await fixture(); await mkdir(join(f.root, '.git', 'objects', 'info'), { recursive: true });
  await writeFile(join(f.root, '.git', 'objects', 'info', 'alternates'), 'C:/outside');
  await expect(f.inspect('git_status')).rejects.toThrow('GIT_UNSAFE_REPOSITORY');
  const linked = await mkdtemp(join(tmpdir(), 'moonzila-linked-')); roots.push(linked);
  await writeFile(join(linked, '.git'), `gitdir: ${join(f.root, '.git')}`);
  await expect(buildGitCommand(f.git, linked, 'git_status', {})).rejects.toThrow('GIT_UNSAFE_REPOSITORY');
});
