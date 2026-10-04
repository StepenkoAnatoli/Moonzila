import { afterAll, beforeAll, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { crc32 } from 'node:zlib';
import { copyWorkspace, excludedByCreate, foldExpected, listReviewFolders, materialise, readPackage, removeJournalTemps, reviewDigest, reviewFolder, sameInventory, treeInventory } from '../src/main/review-workspace';

// The private review workspace (spec "The private workspace"). Every path stays inside this test's own mkdtemp root.
let root: string;
const fixture = resolve('tests/fixtures/research-kit/collected.zip');
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
let n = 0; const fresh = async () => { const dir = join(root, `case-${++n}`); await mkdir(dir); return dir; };

/** A minimal stored (uncompressed) ZIP, so a test can craft a manifest and entries the validator would never see. */
function storedZip(entries: Array<[string, Buffer | string]>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const [name, raw] of entries) {
    const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw); const fileName = Buffer.from(name); const crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fileName.length, 28); central.writeUInt32LE((0o100644 << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, data); centrals.push(central, fileName); offset += 30 + fileName.length + data.length;
  }
  const directory = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
/** A package whose manifest declares `declared` (path -> content) and whose entries are `actual`. */
function crafted(declared: Record<string, string>, actual: Record<string, string> = declared, source: Record<string, unknown> = {}): Buffer {
  const files = Object.entries(declared).map(([path, content]) => ({ path: `project/${path}`, sha256: digest(content), byteLength: Buffer.byteLength(content) }));
  return storedZip([...Object.entries(actual).map(([path, content]): [string, string] => [`project/${path}`, content]), ['manifest.json', JSON.stringify({ files, source })]]);
}

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'moonzila-review-workspace-')); });
afterAll(async () => { if (root) { const rel = relative(resolve(tmpdir()), root); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); } });

test('materialisation writes exactly the manifest\'s project files, checked by hash, and nothing outside project/', async () => {
  const bytes = await readFile(fixture); const job = await fresh();
  const base = await materialise(bytes, job);
  const { base: declared, source } = await readPackage(bytes);
  expect(base).toEqual(declared);
  expect(base.map(entry => entry.path)).toEqual(['.gitattributes', '.gitignore', 'AGENTS.md', 'START_HERE.md', 'docs/ARCHITECTURE.md', 'research/BRIEF.md', 'research/DISCOVERY.md', 'research/EVIDENCE.md', 'research/MAP.md',
    'research/SOURCES.md', 'research/TIMELINE.md', 'research/kit.json', 'research/plan.json', 'research/raw/.fetches.jsonl', 'research/raw/2026-09-30-limits-example-a4e22bcd.md']);
  // The tree on disk is the manifest's, byte for byte; README-FIRST.md, reports/ and schemas/ never reach the workspace.
  expect(await treeInventory(join(job, 'project'))).toEqual(base);
  expect(await readdir(job)).toEqual(['project']);
  expect(source).toEqual({ apiVersion: '2026-03-10', runUrl: 'https://api.github.com/repos/moonaliza-fixtures/synthetic/actions/runs/1', htmlUrl: 'https://github.com/moonaliza-fixtures/synthetic/actions/runs/1' });
});

test('an entry whose bytes differ from its manifest hash, a missing entry or an undeclared one refuses, and the old project stays', async () => {
  const job = await fresh();
  await materialise(crafted({ 'research/MAP.md': 'old map' }), job);
  for (const bad of [
    crafted({ 'research/MAP.md': 'declared' }, { 'research/MAP.md': 'other bytes' }),
    crafted({ 'research/MAP.md': 'a', 'research/EVIDENCE.md': 'b' }, { 'research/MAP.md': 'a' }),
    crafted({ 'research/MAP.md': 'a' }, { 'research/MAP.md': 'a', 'research/EXTRA.md': 'x' }),
  ]) {
    await expect(materialise(bad, job)).rejects.toThrow('ARTIFACT_INVALID');
    // Never a half-written project: the previous workspace is untouched and no staging folder stays.
    expect(await readFile(join(job, 'project', 'research', 'MAP.md'), 'utf8')).toBe('old map');
    expect(await readdir(job)).toEqual(['project']);
  }
});

test('a name create would exclude, a path the journal would refuse, or a case duplicate refuses the package', async () => {
  const job = await fresh();
  for (const name of ['.env', 'research/raw/.fetches.lock', 'research/GATE_OFF', 'keys/server.pem', 'node_modules/x.js', '.git/config', 'docs/.gitkeep']) {
    expect(excludedByCreate(name)).toBe(true);
    await expect(materialise(crafted({ [name]: 'x' }), job)).rejects.toThrow('ARTIFACT_INVALID');
  }
  await expect(materialise(crafted({ 'research/con': 'x' }), job)).rejects.toThrow();
  await expect(materialise(crafted({ 'research/MAP.md': 'a', 'research/map.md': 'b' }), job)).rejects.toThrow('ARTIFACT_INVALID');
  expect(excludedByCreate('research/MAP.md')).toBe(false);
});

test('more than 1,900 project files refuses with REVIEW_WORKSPACE_TOO_LARGE before anything is written', async () => {
  const job = await fresh();
  const declared = Object.fromEntries(Array.from({ length: 1901 }, (_, index) => [`r/${index}`, `${index}`]));
  await expect(materialise(crafted(declared), job)).rejects.toThrow('REVIEW_WORKSPACE_TOO_LARGE');
  expect(await readdir(job).catch(() => [])).toEqual([]);
  // Exactly the bound is accepted.
  const at = Object.fromEntries(Array.from({ length: 1900 }, (_, index) => [`r/${index}`, `${index}`]));
  expect(await materialise(crafted(at), job)).toHaveLength(1900);
}, 60000);

test('the expected tree folds completed writes over the base; a write whose before-hash disagrees cannot verify', () => {
  const base = [{ path: 'research/MAP.md', sha256: digest('m') }, { path: 'research/EVIDENCE.md', sha256: digest('e') }];
  const expected = foldExpected(base, [
    { path: 'research/EVIDENCE.md', beforeHash: digest('e'), afterHash: digest('e2') },
    { path: 'research/BRIEF.md', beforeHash: null, afterHash: digest('b') },
    { path: 'research/MAP.md', beforeHash: digest('m'), afterHash: null },
  ]);
  expect(expected).toEqual([{ path: 'research/BRIEF.md', sha256: digest('b') }, { path: 'research/EVIDENCE.md', sha256: digest('e2') }]);
  expect(() => foldExpected(base, [{ path: 'research/MAP.md', beforeHash: digest('x'), afterHash: digest('y') }])).toThrow('REVIEW_WORKSPACE_CHANGED');
  expect(() => foldExpected(base, [{ path: 'research/BRIEF.md', beforeHash: digest('x'), afterHash: digest('y') }])).toThrow('REVIEW_WORKSPACE_CHANGED');
});

test('the review digest is the SHA-256 of the canonical JSON of the sorted [path, sha256] list, whatever the input order', () => {
  const a = { path: 'research/MAP.md', sha256: digest('m') }; const b = { path: 'AGENTS.md', sha256: digest('a') };
  expect(reviewDigest([a, b])).toBe(digest(JSON.stringify([[b.path, b.sha256], [a.path, a.sha256]])));
  expect(reviewDigest([a, b])).toBe(reviewDigest([b, a]));
  expect(sameInventory([a], [{ ...a, sha256: digest('other') }])).toBe(false);
});

test('the inventory fails on a link, a junction or a hard link, and the journal\'s temporary files are removed first', async () => {
  const job = await fresh(); await materialise(await readFile(fixture), job); const project = join(job, 'project');
  const before = await treeInventory(project);
  const temp = join(project, 'research', '.moonaliza-0b8e2f7c-1d2e-4f00-8a9b-0123456789ab.tmp');
  await writeFile(temp, 'half an edit');
  await expect(treeInventory(project)).resolves.toHaveLength(before.length + 1);
  await removeJournalTemps(project);
  expect(await treeInventory(project)).toEqual(before);
  // A look-alike name is not the journal's, so it stays and the tree no longer verifies.
  await writeFile(join(project, 'research', '.moonaliza-not-a-uuid.tmp'), 'x');
  await removeJournalTemps(project);
  expect(sameInventory(await treeInventory(project), before)).toBe(false);
  await rm(join(project, 'research', '.moonaliza-not-a-uuid.tmp'));
  // A junction to a folder outside the workspace.
  const outside = await fresh(); await writeFile(join(outside, 'x.md'), 'x');
  await symlink(outside, join(project, 'docs', 'linked'), 'junction');
  expect((await realpath(join(project, 'docs', 'linked'))).toLowerCase()).toBe((await realpath(outside)).toLowerCase());
  await expect(treeInventory(project)).rejects.toThrow('REVIEW_WORKSPACE_CHANGED');
  await rm(join(project, 'docs', 'linked'));
  expect(await treeInventory(project)).toEqual(before);
  // A hard link: two names for one file.
  await link(join(project, 'research', 'MAP.md'), join(outside, 'map-alias.md'));
  await expect(treeInventory(project)).rejects.toThrow('REVIEW_WORKSPACE_CHANGED');
});

test('the inventory refuses a tree over the file bound, and the scratch copy holds exactly the inventoried bytes', async () => {
  const job = await fresh(); await materialise(await readFile(fixture), job); const project = join(job, 'project');
  const inventory = await treeInventory(project);
  await expect(treeInventory(project, inventory.length - 1)).rejects.toThrow('REVIEW_WORKSPACE_CHANGED');
  const scratch = await fresh();
  const copy = await copyWorkspace(project, inventory, scratch);
  expect(await treeInventory(copy)).toEqual(inventory);
  // A workspace file changed after its inventory is not copied as if it were the inventoried one.
  await writeFile(join(project, 'research', 'EVIDENCE.md'), 'changed');
  await expect(copyWorkspace(project, inventory, await fresh())).rejects.toThrow('REVIEW_WORKSPACE_CHANGED');
});

test('only plain names are job folders, and the listing is bounded', async () => {
  const reviewRoot = await fresh();
  for (const name of ['job-b', 'job-a', '.hidden', 'has space']) await mkdir(join(reviewRoot, name));
  expect(await listReviewFolders(reviewRoot)).toEqual(['job-a', 'job-b']);
  expect(await listReviewFolders(reviewRoot, 1)).toEqual(['job-a']);
  expect(await listReviewFolders(join(reviewRoot, 'absent'))).toEqual([]);
  expect(() => reviewFolder(reviewRoot, '..')).toThrow('REVIEW_NOT_AVAILABLE');
  expect(reviewFolder(reviewRoot, 'job-a')).toEqual({ job: join(reviewRoot, 'job-a'), project: join(reviewRoot, 'job-a', 'project') });
});
