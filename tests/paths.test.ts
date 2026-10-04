import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProjectPath, validateRelativePath, isSensitiveContextPath } from '../src/tools/paths';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

test.each(['../x', 'C:\\x', '\\\\server\\share', 'src/NUL', 'a:stream', 'a?.txt', 'a. ', 'a//b', 'a/../b', 'x/' + 'a'.repeat(256)])(
  'rejects a path that cannot identify a permitted project file: %s', value => {
    expect(() => validateRelativePath(value)).toThrow('PATH_OUTSIDE_PROJECT');
  }
);

test('normalizes separators while preserving valid names', () => {
  expect(validateRelativePath('src\\hello world.ts')).toBe('src/hello world.ts');
});

test('resolves absent files beneath an existing safe ancestor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'moonzila-paths-'));
  roots.push(root);
  await mkdir(join(root, 'src'));
  expect(await resolveProjectPath(root, 'src/new.ts', { allowMissing: true })).toBe(join(await realpath(root), 'src', 'new.ts'));
});

test('rejects a junction escaping the project root', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moonzila-paths-'));
  roots.push(directory);
  const root = join(directory, 'project');
  const outside = join(directory, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await writeFile(join(outside, 'secret.txt'), 'fixture');
  await symlink(outside, join(root, 'link'), 'junction');
  await expect(resolveProjectPath(root, 'link/secret.txt')).rejects.toThrow('PATH_OUTSIDE_PROJECT');
});

test.each(['.env', 'src/.env.production', 'keys/private.pem', '.git/config', 'node_modules/pkg/index.js', '.moonaliza/vault/key.bin'])(
  'excludes sensitive/generated files from automatic context: %s', value => expect(isSensitiveContextPath(value)).toBe(true)
);

test('source and documented environment examples remain available', () => {
  expect(isSensitiveContextPath('src/index.ts')).toBe(false);
  expect(isSensitiveContextPath('.env.example')).toBe(false);
});
