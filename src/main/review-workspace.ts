import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { fromBufferPromise } from 'yauzl';
import { z } from 'zod';
import { inspectArchive, MAX_ARCHIVE } from '../adapters/research-kit/archive';
import { DigestSchema } from '../adapters/research-kit/contracts';
import { privateDirectory, safeArtifactPath } from '../models/artifact-files';
import { validateRelativePath } from '../tools/paths';
import { MAX_REVIEW_WORKSPACE_FILES, type ReviewChange } from '../engine/review-contract';

/**
 * The private review workspace (docs/specification/research-review.md, "The private workspace"): materialisation from
 * verified bytes, the tree inventory and the expected-tree fold. Pure apart from file I/O; it never launches a process.
 */
export interface FileEntry { path: string; sha256: string }
/** Sorted by path (code units), one entry per regular file. */
export type Inventory = FileEntry[];

/** A job folder is one plain name: what `research.recover` returns in `reviewDiscard` is checked the same way. */
export const REVIEW_FOLDER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_ENTRY = 16 * 1024 ** 2;
const MAX_TOTAL = 64 * 1024 ** 2;
/** The edit journal's own temporary files (`src/tools/files.ts` apply), deleted before every inventory. */
const JOURNAL_TEMP = /^\.moonaliza-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/;
/** What the kit's `create` never packages (`lib/artifact.mjs` EXCLUDED, EXCLUDED_NAME, `.gitkeep`). */
const CREATE_EXCLUDED = new Set(['research/raw/.usage.jsonl', 'research/raw/.diagnostics.jsonl', 'research/raw/.failures.jsonl', 'research/raw/.fetches.lock', 'research/overrides.log', 'research/GATE_OFF']);
const CREATE_EXCLUDED_NAME = /(^|\/)(\.env(\..*)?|\.git|node_modules|\.firecrawl)(\/|$)|\.pem$|\.key$/i;

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const byPath = (a: FileEntry, b: FileEntry) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const sorted = (entries: Iterable<FileEntry>): Inventory => [...entries].map(({ path, sha256: digest }) => ({ path, sha256: digest })).sort(byPath);

export function reviewFolder(reviewRoot: string, researchId: string): { job: string; project: string } {
  if (!REVIEW_FOLDER.test(researchId)) throw new Error('REVIEW_NOT_AVAILABLE');
  const job = join(reviewRoot, researchId);
  return { job, project: join(job, 'project') };
}

/**
 * The job's folders under storage/review, contained (Phase 3 containment S1, main's side of the engine's
 * containedReviewWorkspace): every component from the filesystem root down to `<id>` (and `<id>/project` when
 * `project` is set) is a real directory, no symbolic link or junction, as `privateDirectory` requires of every folder main
 * creates; and realpath of the deepest one equals the derived path under realpath(reviewRoot), compared without case on
 * Windows. Otherwise `PATH_OUTSIDE_PROJECT`: a link there would make main write, inventory, package or delete elsewhere.
 */
export async function containedFolder(reviewRoot: string, researchId: string, options: { project: boolean }): Promise<{ job: string; project: string }> {
  const folder = reviewFolder(reviewRoot, researchId);
  const target = options.project ? folder.project : folder.job;
  try {
    const absolute = resolve(target); let current = parse(absolute).root;
    for (const component of relative(current, absolute).split(sep).filter(Boolean)) {
      current = join(current, component);
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('PATH_OUTSIDE_PROJECT');
    }
    const actual = await realpath(target);
    const expected = join(await realpath(reviewRoot), researchId, ...(options.project ? ['project'] : []));
    if (process.platform === 'win32' ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected) throw new Error('PATH_OUTSIDE_PROJECT');
  } catch (error) { throw new Error('PATH_OUTSIDE_PROJECT', { cause: error }); }
  return folder;
}

/** True for a project path the kit's `create` would leave out of a package. */
export function excludedByCreate(path: string): boolean {
  return CREATE_EXCLUDED.has(path) || CREATE_EXCLUDED_NAME.test(path) || path.split('/').at(-1) === '.gitkeep';
}

/**
 * A strict projection of the manifest's `files[]` and the three `source` values `create` carries over (Decisions, Q8).
 * Only consumed after the real validator has checked the package, so it narrows; it never validates provenance.
 */
const ManifestFilesProjection = z.object({
  files: z.array(z.object({ path: z.string().min(1).max(1024), sha256: DigestSchema, byteLength: z.number().int().min(0).max(MAX_ENTRY) }).strip()).max(5000),
  source: z.object({ runUrl: z.string().max(2048).optional(), htmlUrl: z.string().max(2048).optional(), apiVersion: z.string().max(64).optional() }).strip(),
}).strip();
export interface PackageView { base: Inventory; source: { runUrl?: string; htmlUrl?: string; apiVersion?: string } }

/** The `project/` entries of a manifest, as the base inventory. Any malformed entry refuses the whole package. */
export function projectInventory(manifest: unknown): PackageView {
  const parsed = ManifestFilesProjection.safeParse(manifest);
  if (!parsed.success) throw new Error('ARTIFACT_INVALID');
  const base = new Map<string, FileEntry>(); const lower = new Set<string>();
  for (const file of parsed.data.files) {
    if (!file.path.startsWith('project/')) continue;
    const path = file.path.slice('project/'.length);
    if (!safeArtifactPath(file.path) || validateRelativePath(path) !== path || excludedByCreate(path) || lower.has(path.toLowerCase())) throw new Error('ARTIFACT_INVALID');
    lower.add(path.toLowerCase()); base.set(path, { path, sha256: file.sha256 });
  }
  const { runUrl, htmlUrl, apiVersion } = parsed.data.source;
  return { base: sorted(base.values()), source: { ...(runUrl === undefined ? {} : { runUrl }), ...(htmlUrl === undefined ? {} : { htmlUrl }), ...(apiVersion === undefined ? {} : { apiVersion }) } };
}

/** The manifest of verified bytes, read with the archive's limits, projected to the base inventory. */
export async function readPackage(bytes: Buffer): Promise<PackageView> {
  return projectInventory(await inspectArchive(bytes));
}

/**
 * Writes the verified package's `project/` entries into `<job>/staging-<uuid>/project`, each with `wx` and checked
 * against the manifest, then replaces `<job>/project` by rename. A crash leaves the old folder or a stray staging folder,
 * never a half-written project. Returns the base inventory.
 */
export async function materialise(bytes: Buffer, job: string): Promise<Inventory> {
  if (bytes.length > MAX_ARCHIVE) throw new Error('INPUT_LIMIT');
  const { base } = await readPackage(bytes);
  if (base.length > MAX_REVIEW_WORKSPACE_FILES) throw new Error('REVIEW_WORKSPACE_TOO_LARGE');
  const expected = new Map(base.map(entry => [entry.path, entry.sha256]));
  await privateDirectory(job);
  const staging = join(job, `staging-${randomUUID()}`); const target = join(staging, 'project');
  try {
    await privateDirectory(target);
    const written = new Set<string>();
    const zip = await fromBufferPromise(bytes, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true });
    try {
      if (zip.entryCount > 5000) throw new Error('INPUT_LIMIT');
      const names = new Set<string>(); let total = 0;
      for await (const entry of zip.eachEntry()) {
        // The same limits as inspectArchive, applied again to this pass: the bytes are only ever trusted as verified.
        const name = entry.fileName; const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (!safeArtifactPath(name) || entry.isEncrypted() || (mode !== 0 && mode !== 0x8000) || names.has(name.toLowerCase())) throw new Error('ARTIFACT_INVALID');
        names.add(name.toLowerCase()); total += entry.uncompressedSize;
        if (entry.uncompressedSize > MAX_ENTRY || total > MAX_TOTAL || (entry.uncompressedSize > 1024 ** 2 && entry.uncompressedSize > 200 * entry.compressedSize)) throw new Error('INPUT_LIMIT');
        if (!name.startsWith('project/')) continue;
        const path = name.slice('project/'.length);
        if (validateRelativePath(path) !== path || excludedByCreate(path) || expected.get(path) === undefined) throw new Error('ARTIFACT_INVALID');
        const stream = await zip.openReadStreamPromise(entry); const chunks: Buffer[] = []; let size = 0;
        try { for await (const chunk of stream) { size += chunk.length; if (size > entry.uncompressedSize) throw new Error('INPUT_LIMIT'); chunks.push(chunk); } }
        finally { stream.destroy(); }
        const content = Buffer.concat(chunks);
        if (sha256(content) !== expected.get(path)) throw new Error('ARTIFACT_INVALID');
        const file = join(target, ...path.split('/'));
        await privateDirectory(dirname(file)); await writeFile(file, content, { flag: 'wx' });
        written.add(path);
      }
    } finally { zip.close(); }
    if (written.size !== expected.size) throw new Error('ARTIFACT_INVALID');
    const project = join(job, 'project');
    await rm(project, { recursive: true, force: true });
    await rename(target, project);
    return base;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

/** Deletes the edit journal's temporary files anywhere in the workspace; anything else is left for the inventory to judge. */
export async function removeJournalTemps(project: string): Promise<void> {
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && JOURNAL_TEMP.test(entry.name)) await rm(path, { force: true });
    }
  };
  await walk(project);
}

async function hashRegular(file: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || info.nlink !== 1 || info.size > MAX_ENTRY) throw new Error('REVIEW_WORKSPACE_CHANGED');
  const handle = await open(file, 'r');
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.nlink !== 1 || actual.size !== info.size || actual.ino !== info.ino) throw new Error('REVIEW_WORKSPACE_CHANGED');
    const bytes = Buffer.alloc(actual.size + 1); let offset = 0;
    while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
    if (offset !== actual.size) throw new Error('REVIEW_WORKSPACE_CHANGED');
    return sha256(bytes.subarray(0, offset));
  } finally { await handle.close(); }
}

/**
 * Every regular file of the workspace as `{path, sha256}`. A link (a symbolic link or a junction), a hard link, a FIFO
 * or any other entry, a file over 16 MiB, or more files than the bound, means the tree is not a reviewable workspace.
 */
export async function treeInventory(project: string, maxFiles: number = MAX_REVIEW_WORKSPACE_FILES): Promise<Inventory> {
  const out: FileEntry[] = [];
  const walk = async (folder: string, prefix: string): Promise<void> => {
    for (const name of await readdir(folder)) {
      const path = join(folder, name); const rel = prefix ? `${prefix}/${name}` : name;
      // lstat: a symbolic link or junction is neither a directory nor a file here, so it fails like a FIFO would.
      const info = await lstat(path);
      if (info.isDirectory()) { await walk(path, rel); continue; }
      if (!info.isFile()) throw new Error('REVIEW_WORKSPACE_CHANGED');
      if (out.length >= maxFiles) throw new Error('REVIEW_WORKSPACE_CHANGED');
      out.push({ path: rel, sha256: await hashRegular(path) });
    }
  };
  const root = await lstat(project);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('REVIEW_WORKSPACE_CHANGED');
  await walk(project, '');
  return sorted(out);
}

/** A review write as the fold reads it; a change without a status is a completed one. */
export type FoldChange = Pick<ReviewChange, 'path' | 'beforeHash' | 'afterHash'> & { status?: ReviewChange['status'] };

/**
 * `expected = fold(base, changes)`: each completed review write sets its path to `afterHash`, or removes it when null.
 * A write whose `beforeHash` is not what the fold holds at that point means the journal and the base disagree, so
 * nothing can verify against it. An `unknown` write leaves no single expected tree, so it never verifies here: only
 * `acceptsTree` (a retry's `continued` check) admits one.
 */
export function foldExpected(base: Inventory, changes: readonly FoldChange[]): Inventory {
  const tree = new Map(base.map(entry => [entry.path, entry.sha256]));
  for (const change of changes) {
    if (change.status === 'unknown') throw new Error('REVIEW_WORKSPACE_CHANGED');
    if ((tree.get(change.path) ?? null) !== change.beforeHash) throw new Error('REVIEW_WORKSPACE_CHANGED');
    if (change.afterHash === null) tree.delete(change.path); else tree.set(change.path, change.afterHash);
  }
  return sorted([...tree].map(([path, digest]) => ({ path, sha256: digest })));
}

/**
 * The trees a kept workspace may be in (spec "Crash windows": an edit's rename and its record): per path, the hashes it
 * may hold, `null` for absent. A completed write leaves exactly its `afterHash`; an `unknown` write may or may not be on
 * disk, so it adds its `afterHash` to what the path could already hold. Each write's `beforeHash` must be one of those.
 */
export function foldAccepted(base: Inventory, changes: readonly FoldChange[]): Map<string, ReadonlySet<string | null>> {
  const tree = new Map<string, ReadonlySet<string | null>>(base.map(entry => [entry.path, new Set([entry.sha256])]));
  for (const change of changes) {
    const now = tree.get(change.path) ?? new Set([null]);
    if (!now.has(change.beforeHash)) throw new Error('REVIEW_WORKSPACE_CHANGED');
    tree.set(change.path, change.status === 'unknown' ? new Set([...now, change.afterHash]) : new Set([change.afterHash]));
  }
  return tree;
}
/** True when every file of `tree` holds a hash its path may hold, and every path that may not be absent is present. */
export function acceptsTree(tree: Inventory, accepted: ReadonlyMap<string, ReadonlySet<string | null>>): boolean {
  const present = new Set<string>();
  for (const entry of tree) {
    if (!accepted.get(entry.path)?.has(entry.sha256)) return false;
    present.add(entry.path);
  }
  for (const [path, hashes] of accepted) if (!present.has(path) && !hashes.has(null)) return false;
  return true;
}

/** The review digest: SHA-256 of the canonical JSON of the sorted `[path, sha256]` list. */
export function reviewDigest(inventory: Inventory): string {
  return sha256(Buffer.from(JSON.stringify(sorted(inventory).map(entry => [entry.path, entry.sha256])), 'utf8'));
}
export function sameInventory(a: Inventory, b: Inventory): boolean {
  return reviewDigest(a) === reviewDigest(b);
}

/** Copies the inventoried files into `<destination>/project` and checks each copy's hash (a scratch copy for the brief). */
export async function copyWorkspace(project: string, inventory: Inventory, destination: string): Promise<string> {
  const target = await privateDirectory(join(destination, 'project'));
  for (const entry of inventory) {
    const source = join(project, ...entry.path.split('/')); const file = join(target, ...entry.path.split('/'));
    const handle = await open(source, 'r'); let bytes: Buffer;
    try { const info = await handle.stat(); if (!info.isFile() || info.size > MAX_ENTRY) throw new Error('REVIEW_WORKSPACE_CHANGED'); bytes = await handle.readFile(); }
    finally { await handle.close(); }
    if (sha256(bytes) !== entry.sha256) throw new Error('REVIEW_WORKSPACE_CHANGED');
    await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes, { flag: 'wx' });
  }
  return target;
}

/** The job folder names under storage/review, at most `limit` (the rest wait for the next start). */
export async function listReviewFolders(reviewRoot: string, limit = 1000): Promise<string[]> {
  let names: string[];
  try { names = await readdir(reviewRoot); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  return names.filter(name => REVIEW_FOLDER.test(name)).sort().slice(0, limit);
}
