import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import provenance from './fixtures/research-kit/provenance.json';
import { ResearchKit } from '../src/adapters/research-kit/adapter';
import { privateDirectory } from '../src/models/artifact-files';
import { classifyPreflight } from '../src/main/review';
import { materialise, readPackage, reviewFolder, sameInventory, treeInventory } from '../src/main/review-workspace';

// P5-14 (gap-audit G5): the review's kit children through the real native helper. Every other review test injects a
// child_process runner; this one builds the kit as src/main/index.ts does for prepareReview - no runner, so spawnOwned
// with the helper at .build/native/MoonAlizaHost.exe, the guarded read locks and the pre-start rehash - and runs
// preflight and create over the materialised collected fixture, then validates what create wrote. The helper exists only
// on Windows, so elsewhere the file is collected and skipped (as tests/guarded-fs-semantics.test.ts is).
const windows = process.platform === 'win32';
const SKIP_REASON = 'Windows only: the native helper MoonAlizaHost.exe';
const kitRoot = resolve('.build/research-kit-external/research-kit');
const helperPath = resolve('.build/native/MoonAlizaHost.exe');
const collectedFixture = resolve('tests/fixtures/research-kit/collected.zip');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let root: string;
beforeAll(async () => { if (windows) root = await mkdtemp(join(tmpdir(), 'moonzila-review-native-')); });
afterAll(async () => {
  if (!root) return;
  const child = relative(resolve(tmpdir()), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('UNSAFE_TEST_CLEANUP');
  await rm(root, { recursive: true, force: true });
});

describe.skipIf(!windows)(`review kit children through the native helper (${SKIP_REASON})`, () => {
  test('preflight and create run under the helper\'s read locks over the materialised collected corpus, and create\'s package validates', async () => {
    const nodeSha256 = digest(await readFile(process.execPath));
    // The production wiring (src/main/index.ts): the installation's kit and node, storage under userData, the helper path.
    const kit = new ResearchKit({ kitRoot, nodePath: process.execPath, nodeSha256, storageRoot: join(root, 'storage'), helperPath });
    try {
      const collected = await readFile(collectedFixture);
      const id = 'j1'; const binding = { projectId: 'p', projectRevision: 1, jobId: id, jobRevision: 5, ...provenance.identity };
      // 1. Materialised as a review start does it, into storage/review/<id>/project.
      const launch = await kit.prepareReview();
      const folder = reviewFolder(launch.root, id);
      const base = await materialise(collected, folder.job);
      const tree = await treeInventory(folder.project);
      expect(sameInventory(tree, base)).toBe(true);
      const locks = tree.map(entry => join(folder.project, ...entry.path.split('/')));
      const locked = locks.find(path => path.endsWith('EVIDENCE.md'))!;
      // While the helper holds its read locks this process cannot write a locked file (the guard is real, not a runner's).
      const refusedWrite = async () => { try { await writeFile(locked, 'changed'); return 'ok'; } catch (error) { return String((error as NodeJS.ErrnoException).code); } };

      // 2a. preflight, as the freeze runs it: cwd the workspace, a private temp, every workspace file locked.
      const preflightTemp = await privateDirectory(join(folder.job, `temp-${randomUUID()}`));
      const checks: string[] = [];
      const preflight = await launch.run({ tool: 'preflight' }, { cwd: folder.project, temp: preflightTemp, locks, signal: new AbortController().signal, check: async () => {
        checks.push(await refusedWrite());
        expect(sameInventory(await treeInventory(folder.project), tree)).toBe(true);
      } });
      expect(preflight).toMatchObject({ status: 'exited', truncated: false, cancelled: false, timedOut: false });
      expect(classifyPreflight(preflight)).not.toBeNull();

      // 2b. create, as packaging runs it: cwd and temp a private folder, output under out-<id>, the same locks.
      const outId = randomUUID(); const out = await privateDirectory(join(folder.job, `out-${outId}`)); const temp = await privateDirectory(join(folder.job, `temp-${outId}`));
      const output = join(out, 'reviewed.zip');
      const identity = { clientRef: binding.clientRef, repository: binding.repository, ref: binding.ref, commit: binding.commit, workflow: binding.workflow, workflowRunId: binding.workflowRunId, runAttempt: binding.runAttempt, ...(await readPackage(collected)).source };
      const create = await launch.run({ tool: 'create', root: folder.project, output, identity }, { cwd: temp, temp, locks, signal: new AbortController().signal, check: async () => { checks.push(await refusedWrite()); } });
      expect(create).toMatchObject({ status: 'exited', code: 0, truncated: false, cancelled: false, timedOut: false });
      // Both guarded starts ran, each refusing a write to a locked file.
      expect(checks).toEqual([expect.not.stringMatching(/^ok$/), expect.not.stringMatching(/^ok$/)]);
      expect(await readFile(locked, 'utf8')).not.toBe('changed');

      // 3. The produced package validates under the job's binding (the validator again through the helper), and holds
      // exactly the workspace that was locked.
      const result = await kit.validate(output, binding);
      expect(result).toMatchObject({ status: 'PASS', error: null });
      const produced = (await readPackage(await kit.readVerified(result.receipt!.id, binding))).base;
      expect(sameInventory(produced, tree)).toBe(true);
    } finally { await kit.close(); }
  }, 300000);
});
