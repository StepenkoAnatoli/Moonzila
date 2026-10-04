import { afterEach, beforeEach, expect, test } from 'vitest';
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/engine/store';
import { FileReader, READ_TOOL_SPECS } from '../src/tools/reads';
import { ToolSpecSchema } from '../src/shared/contracts';

let directory: string;
let root: string;
let store: Store;
let reader: FileReader;
const at = '2026-09-25T12:00:00.000Z';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'monnzila-reads-'));
  root = join(directory, 'project');
  await mkdir(root);
  store = new Store(join(directory, 'state.db'));
  store.putProject({ id: 'p1', name: 'Fixture', rootPath: root, pathLabel: 'project', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'off' }, missing: false, createdAt: at });
  store.putSession({ id: 's1', projectId: 'p1', title: 'Read files', createdAt: at, updatedAt: at });
  store.putProfile({ id: 'profile1', name: 'Local', kind: 'ollama', endpoint: 'http://localhost:11434', model: 'fixture', contextTokens: 8192, outputTokens: 2048, locality: 'local', revision: 1, revisionId: 'profile1-v1', createdAt: at, updatedAt: at });
  store.putRun({ id: 'r1', projectId: 'p1', sessionId: 's1', mode: 'ask', status: 'running', profileId: 'profile1', profileRevisionId: 'profile1-v1', policyRevision: 1, trustRevision: 1, createdAt: at });
  reader = new FileReader(store);
});

afterEach(async () => {
  store.close();
  await rm(directory, { recursive: true, force: true });
});

test('reads the requested real UTF-8 lines with explicit omitted-content information', async () => {
  await writeFile(join(root, 'hello.txt'), 'one\r\nשלום\r\nthree\r\nfour');
  const result = JSON.parse(await reader.execute('r1', 'read_file', { path: 'hello.txt', startLine: 2, lineCount: 2 }));
  expect(result).toEqual({ path: 'hello.txt', startLine: 2, endLine: 3, totalLines: 4, text: 'שלום\nthree', truncated: true });
  expect(JSON.parse(await reader.execute('r1', 'read_file', { path: 'hello.txt' })).truncated).toBe(false);
});

test('normalizes valid Windows path separators', async () => {
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'main.ts'), 'export const value = 1;');
  expect(JSON.parse(await reader.execute('r1', 'read_file', { path: 'src\\main.ts' })).path).toBe('src/main.ts');
});

test.each([
  ['read_file', { path: '../outside' }],
  ['read_file', { path: 'C:\\secret.txt' }],
  ['read_file', { path: 'a.txt:stream' }],
  ['read_file', { path: 'a.txt', startLine: 0 }],
  ['read_file', { path: 'a.txt', lineCount: 201 }],
  ['read_file', { path: 'a.txt', secret: 'not accepted' }],
  ['list_files', { depth: 6 }],
  ['search_text', { query: '' }],
  ['search_text', { query: 'a'.repeat(201) }],
  ['search_text', { query: 'a', regex: true }],
] as const)('rejects invalid or unbounded %s parameters', async (name, input) => {
  await expect(reader.execute('r1', name, input)).rejects.toThrow();
});

test('advertises strict tool schemas accepted by the shared model contract', () => {
  expect(READ_TOOL_SPECS.map(spec => ToolSpecSchema.parse(spec).name)).toEqual(['read_file', 'list_files', 'search_text']);
  expect(READ_TOOL_SPECS.every(spec => spec.parameters.additionalProperties === false)).toBe(true);
});

test('lists only permitted text files and directories to the selected depth', async () => {
  await mkdir(join(root, 'src', 'nested'), { recursive: true });
  await mkdir(join(root, '.git'));
  await writeFile(join(root, '.git', 'config'), 'private');
  await writeFile(join(root, '.env'), 'TOKEN=secret');
  await writeFile(join(root, '.env.example'), 'TOKEN=example');
  await writeFile(join(root, 'src', 'main.ts'), 'source');
  await writeFile(join(root, 'src', 'nested', 'deep.ts'), 'deep');
  await writeFile(join(root, 'image.bin'), Buffer.from([0, 1, 2]));
  const result = JSON.parse(await reader.execute('r1', 'list_files', { depth: 2 }));
  expect(result.entries.map((entry: { path: string }) => entry.path).sort()).toEqual(['.env.example', 'src', 'src/main.ts', 'src/nested']);
  expect(result.truncated).toBe(true);
});

test('search treats regex metacharacters as literal text and keeps real line numbers', async () => {
  await writeFile(join(root, 'main.ts'), 'literal a.*b\nplain ab\nsecond a.*b');
  await writeFile(join(root, '.env'), 'secret a.*b');
  await writeFile(join(root, 'private.key'), 'secret a.*b');
  await writeFile(join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28]));
  const result = JSON.parse(await reader.execute('r1', 'search_text', { query: 'a.*b' }));
  expect(result.matches).toEqual([{ path: 'main.ts', line: 1, text: 'literal a.*b' }, { path: 'main.ts', line: 3, text: 'second a.*b' }]);
  expect(result.truncated).toBe(false);
});

test.each(['.env', 'private.key', '.npmrc', 'credentials'])('refuses direct credential-path access: %s', async name => {
  await writeFile(join(root, name), 'credential fixture');
  await expect(reader.execute('r1', 'read_file', { path: name })).rejects.toThrow('CONTEXT_PATH_EXCLUDED');
});

test('rejects junctions inside the workspace even when they target another workspace directory', async () => {
  await mkdir(join(root, 'original'));
  await writeFile(join(root, 'original', 'source.ts'), 'source');
  await symlink(join(root, 'original'), join(root, 'alias'), 'junction');
  await expect(reader.execute('r1', 'read_file', { path: 'alias/source.ts' })).rejects.toThrow('FILE_LINK_DENIED');
  const listed = JSON.parse(await reader.execute('r1', 'list_files', { depth: 3 }));
  expect(listed.entries.some((entry: { path: string }) => entry.path.startsWith('alias'))).toBe(false);
});

test('rejects hardlinks that could expose content outside the project', async () => {
  await writeFile(join(directory, 'outside.txt'), 'outside secret');
  await link(join(directory, 'outside.txt'), join(root, 'copy.txt'));
  await expect(reader.execute('r1', 'read_file', { path: 'copy.txt' })).rejects.toThrow('FILE_LINK_DENIED');
  expect(JSON.parse(await reader.execute('r1', 'search_text', { query: 'secret' })).matches).toEqual([]);
});

test('excludes protected application data via both canonical and alias roots', async () => {
  const protectedDirectory = join(root, 'app-data');
  await mkdir(protectedDirectory);
  await writeFile(join(protectedDirectory, 'state.txt'), 'private application state');
  const alias = join(directory, 'app-alias');
  await symlink(protectedDirectory, alias, 'junction');
  reader = new FileReader(store, [alias]);
  await expect(reader.execute('r1', 'read_file', { path: 'app-data/state.txt' })).rejects.toThrow('CONTEXT_PATH_EXCLUDED');
  expect(JSON.parse(await reader.execute('r1', 'list_files', { depth: 3 })).entries).toEqual([]);
  expect(JSON.parse(await reader.execute('r1', 'search_text', { query: 'private' })).matches).toEqual([]);
});

test('rejects binary, malformed UTF-8, and files larger than one MiB', async () => {
  await writeFile(join(root, 'binary.txt'), Buffer.from([97, 0, 98]));
  await writeFile(join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28]));
  await writeFile(join(root, 'huge.txt'), Buffer.alloc(1024 * 1024 + 1, 97));
  await expect(reader.execute('r1', 'read_file', { path: 'binary.txt' })).rejects.toThrow('FILE_NOT_TEXT');
  await expect(reader.execute('r1', 'read_file', { path: 'invalid.txt' })).rejects.toThrow('FILE_NOT_TEXT');
  await expect(reader.execute('r1', 'read_file', { path: 'huge.txt' })).rejects.toThrow('FILE_TOO_LARGE');
});

test('bounds JSON output even when an individual line expands through JSON escaping', async () => {
  await writeFile(join(root, 'long.txt'), '\\'.repeat(100000));
  const output = await reader.execute('r1', 'read_file', { path: 'long.txt' });
  expect(output.length).toBeLessThanOrEqual(60000);
  expect(JSON.parse(output).truncated).toBe(true);
  expect(JSON.parse(output).text.length).toBeGreaterThan(0);
});

// Real Windows path/content revalidation across 200 files; this asserts result bounds, not a 15-second SLA.
test('bounds directory results and literal search match counts', async () => {
  await Promise.all(Array.from({ length: 210 }, (_, index) => writeFile(join(root, `${index}.txt`), 'match\n'.repeat(110))));
  const listed = JSON.parse(await reader.execute('r1', 'list_files', {}));
  expect(listed.entries).toHaveLength(200);
  expect(listed.truncated).toBe(true);
  const searched = JSON.parse(await reader.execute('r1', 'search_text', { query: 'match' }));
  expect(searched.matches).toHaveLength(100);
  expect(searched.truncated).toBe(true);
  expect(searched.filesScanned).toBeLessThanOrEqual(100);
}, 30000);

test('bounds search file admission when none of the first files match', async () => {
  await Promise.all(Array.from({ length: 110 }, (_, index) => writeFile(join(root, `${index}.txt`), 'ordinary source')));
  const result = JSON.parse(await reader.execute('r1', 'search_text', { query: 'not present' }));
  expect(result.filesScanned).toBe(100);
  expect(result.matches).toEqual([]);
  expect(result.truncated).toBe(true);
});

test.each(['completed', 'cancelled', 'interrupted', 'cancelling', 'awaiting_approval'] as const)('refuses tools for a %s run', async status => {
  await writeFile(join(root, 'source.txt'), 'source');
  store.appendEvent('r1', 'test.status', {}, { status });
  await expect(reader.execute('r1', 'read_file', { path: 'source.txt' })).rejects.toThrow('RUN_NOT_ACTIVE');
});

test('revocation or cancellation during an asynchronous read prevents content return', async () => {
  await writeFile(join(root, 'source.txt'), 'protected source');
  const first = reader.execute('r1', 'read_file', { path: 'source.txt' });
  store.putProject({ ...store.getProject('p1')!, trusted: false, trustRevision: 2 });
  await expect(first).rejects.toThrow('PROJECT_UNTRUSTED');
  store.putProject({ ...store.getProject('p1')!, trusted: true, trustRevision: 1 });
  const controller = new AbortController();
  const second = reader.execute('r1', 'read_file', { path: 'source.txt' }, controller.signal);
  controller.abort();
  await expect(second).rejects.toThrow('RUN_CANCELLED');
});

test('denies stale trust and policy revisions even when the project remains trusted', async () => {
  await writeFile(join(root, 'source.txt'), 'source');
  store.putProject({ ...store.getProject('p1')!, trustRevision: 2 });
  await expect(reader.execute('r1', 'read_file', { path: 'source.txt' })).rejects.toThrow('POLICY_CHANGED');
  store.putProject({ ...store.getProject('p1')!, trustRevision: 1, policy: { revision: 2, inference: 'local-only', research: 'off' } });
  await expect(reader.execute('r1', 'list_files', {})).rejects.toThrow('POLICY_CHANGED');
});


test.each(['.', './', '.\\'])('directory root alias %s lists and searches the attached folder', async path => {
  await writeFile(join(root, 'README.md'), 'Monnzila local checkout');
  const listed = JSON.parse(await reader.execute('r1', 'list_files', { path }));
  expect(listed.entries).toEqual([{ path: 'README.md', type: 'file' }]);
  const searched = JSON.parse(await reader.execute('r1', 'search_text', { path, query: 'local checkout' }));
  expect(searched.matches).toEqual([{ path: 'README.md', line: 1, text: 'Monnzila local checkout' }]);
});

test.each(['../', './..', '.\\..', './.env', 'src/../.env'])('root aliases do not admit unsafe or unnormalized path %s', async path => {
  await writeFile(join(root, '.env'), 'do not reveal');
  await expect(reader.execute('r1', 'list_files', { path })).rejects.toThrow();
});
