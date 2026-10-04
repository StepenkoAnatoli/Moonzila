import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Store } from '../engine/store';
import type { ToolSpec } from '../shared/contracts';
import { assertToolPolicy } from '../engine/policy';
import { projectRoot, type RunRootResolver } from '../engine/research-review';
import { isSensitiveContextPath, resolveProjectPath, validateRelativePath } from './paths';

const MAX_BYTES = 1024 * 1024;
const MAX_OUTPUT = 60000;
const MAX_ENTRIES = 2000;
const relativePath = z.string().min(1).max(2048);
const directoryPath = z.string().max(2048).default('');
const readInput = z.object({ path: relativePath, startLine: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1), lineCount: z.number().int().min(1).max(200).default(200) }).strict();
const listInput = z.object({ path: directoryPath, depth: z.number().int().min(1).max(5).default(1) }).strict();
const searchInput = z.object({ query: z.string().min(1).max(200).refine(value => value.trim().length > 0 && !value.includes('\0')), path: directoryPath }).strict();
type ToolName = 'read_file' | 'list_files' | 'search_text';

export const READ_TOOL_SPECS: ToolSpec[] = [
  { name: 'read_file', description: 'Read up to 200 lines from a permitted UTF-8 file in the attached local folder. Paths are relative to that folder, never web URLs. Results include line numbers and whether content was omitted.', parameters: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', minLength: 1, maxLength: 2048 }, startLine: { type: 'integer', minimum: 1 }, lineCount: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['path'] } },
  { name: 'list_files', description: 'List permitted text files and directories in the attached local folder. Omit path or use . for its root. This does not open GitHub URLs or remote repositories. Sensitive files and filesystem links are excluded.', parameters: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', maxLength: 2048 }, depth: { type: 'integer', minimum: 1, maximum: 5 } }, required: [] } },
  { name: 'search_text', description: 'Find literal text in permitted UTF-8 files in the attached local folder. Omit path or use . for its root; paths are local, not GitHub or web addresses. Search is case-sensitive, bounded, and does not execute regular expressions.', parameters: { type: 'object', additionalProperties: false, properties: { query: { type: 'string', minLength: 1, maxLength: 200 }, path: { type: 'string', maxLength: 2048 } }, required: ['query'] } },
];

interface CheckedPath { absolute: string; relative: string; stats: BigIntStats }
interface Context {
  runId: string; projectId: string; root: string; sourceRoot: string; signal?: AbortSignal;
  /** `exempt`: a review run's own workspace, the one place inside the protected data folder it may read. */
  protectedPaths: string[]; exempt: string[]; snapshots: Map<string, CheckedPath>;
}
interface Traversal { entriesScanned: number; truncated: boolean }
interface Entry { path: string; type: 'file' | 'directory' }
interface Match { path: string; line: number; text: string }

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
}
function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function sameFile(before: BigIntStats, after: BigIntStats): boolean {
  return before.dev === after.dev && before.ino === after.ino && before.isDirectory() === after.isDirectory();
}
function sameContents(before: BigIntStats, after: BigIntStats): boolean {
  return sameFile(before, after) && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}
function denied(error: unknown): boolean {
  return error instanceof Error && ['CONTEXT_PATH_EXCLUDED', 'FILE_LINK_DENIED', 'FILE_NOT_TEXT', 'FILE_TOO_LARGE', 'FILE_NOT_REGULAR', 'FILE_UNAVAILABLE', 'PATH_OUTSIDE_PROJECT'].includes(error.message);
}
function normalize(relative: string): string { return relative ? validateRelativePath(relative) : ''; }
function splitLines(text: string): string[] {
  if (!text.length) return [];
  const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** Reads are admitted against live engine state; all returned data is bounded and untrusted. */
export class FileReader {
  constructor(private readonly store: Store, private readonly protectedRoots: string[] = [], private readonly rootFor: RunRootResolver = projectRoot) {}

  private authorize(runId: string, signal?: AbortSignal): { id: string; root: string; review: boolean } {
    if (signal?.aborted) throw new Error('RUN_CANCELLED');
    const run = this.store.getRun(runId);
    if (!run || run.status !== 'running') throw new Error('RUN_NOT_ACTIVE');
    if (run.projectId === null) throw new Error('PROJECT_REQUIRED');
    if (this.store.getSession(run.sessionId)?.policy.revision !== run.sessionPolicyRevision) throw new Error('RUN_CANCELLED');
    const project = this.store.getProject(run.projectId);
    if (!project || project.missing) throw new Error('PROJECT_UNAVAILABLE');
    assertToolPolicy(run.mode, 'read', project, signal);
    if (project.trustRevision !== run.trustRevision || project.policy.revision !== run.policyRevision) throw new Error('POLICY_CHANGED');
    const root = this.rootFor(run, project);
    if (!root.current) throw new Error('RUN_NOT_ACTIVE');
    return { id: project.id, root: root.root, review: root.review };
  }
  private isProtected(ctx: Context, candidate: string): boolean {
    return ctx.protectedPaths.some(root => inside(root, candidate)) && !ctx.exempt.some(root => inside(root, candidate));
  }

  private async protectedPaths(): Promise<string[]> {
    const roots: string[] = [];
    for (const root of this.protectedRoots) {
      roots.push(path.resolve(root));
      try { roots.push(await realpath(root)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('PROTECTED_ROOT_UNAVAILABLE', { cause: error }); }
    }
    return roots;
  }

  private async context(runId: string, signal?: AbortSignal): Promise<Context> {
    const project = this.authorize(runId, signal);
    const sourceRoot = path.resolve(project.root);
    const root = await realpath(sourceRoot);
    let ancestor = path.parse(sourceRoot).root;
    for (const part of sourceRoot.slice(ancestor.length).split(path.sep).filter(Boolean)) {
      ancestor = path.join(ancestor, part);
      if ((await lstat(ancestor)).isSymbolicLink()) throw new Error('FILE_LINK_DENIED');
    }
    // Exactly the review workspace is exempt from the protected data folder; the rest of that folder stays excluded.
    const exempt = project.review ? [sourceRoot, root] : [];
    const ctx: Context = { runId, projectId: project.id, root, sourceRoot, signal, protectedPaths: await this.protectedPaths(), exempt, snapshots: new Map() };
    await this.checked(ctx, '');
    return ctx;
  }

  private assertContext(ctx: Context): void {
    const project = this.authorize(ctx.runId, ctx.signal);
    if (project.id !== ctx.projectId || !samePath(project.root, ctx.sourceRoot)) throw new Error('POLICY_CHANGED');
  }

  private async checked(ctx: Context, relative: string): Promise<CheckedPath> {
    this.assertContext(ctx);
    const normalized = normalize(relative);
    const candidate = path.resolve(ctx.root, ...normalized.split('/').filter(Boolean));
    if (!inside(ctx.root, candidate)) throw new Error('PATH_OUTSIDE_PROJECT');
    if (isSensitiveContextPath(normalized) || isSensitiveContextPath(candidate) || this.isProtected(ctx, candidate)) throw new Error('CONTEXT_PATH_EXCLUDED');
    let current = ctx.root;
    const components = [ctx.root, ...normalized.split('/').filter(Boolean).map(part => { current = path.join(current, part); return current; })];
    let finalStats: BigIntStats | undefined;
    for (const component of components) {
      const stats = await lstat(component, { bigint: true });
      if (stats.isSymbolicLink() || (stats.isFile() && stats.nlink > 1n)) throw new Error('FILE_LINK_DENIED');
      const canonical = await realpath(component);
      if (!inside(ctx.root, canonical)) throw new Error('PATH_OUTSIDE_PROJECT');
      if (this.isProtected(ctx, canonical)) throw new Error('CONTEXT_PATH_EXCLUDED');
      if (!samePath(component, canonical)) throw new Error('FILE_LINK_DENIED');
      const previous = ctx.snapshots.get(component);
      if (previous && !sameFile(previous.stats, stats)) throw new Error('FILE_CHANGED');
      if (!previous) ctx.snapshots.set(component, { absolute: component, relative: path.relative(ctx.root, component).replaceAll('\\', '/'), stats });
      finalStats = stats;
    }
    if (normalized) {
      const resolved = await resolveProjectPath(ctx.root, normalized);
      if (!samePath(resolved, candidate)) throw new Error('FILE_CHANGED');
    }
    this.assertContext(ctx);
    return { absolute: candidate, relative: normalized, stats: finalStats! };
  }

  private async readText(ctx: Context, relative: string): Promise<string> {
    const checked = await this.checked(ctx, relative);
    if (!checked.stats.isFile()) throw new Error('FILE_NOT_REGULAR');
    if (checked.stats.size > BigInt(MAX_BYTES)) throw new Error('FILE_TOO_LARGE');
    const handle = await open(checked.absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.nlink > 1n) throw new Error('FILE_LINK_DENIED');
      if (!sameContents(checked.stats, before)) throw new Error('FILE_CHANGED');
      const bytes = Buffer.alloc(MAX_BYTES + 1);
      let count = 0;
      while (count < bytes.length) {
        this.assertContext(ctx);
        const { bytesRead } = await handle.read(bytes, count, Math.min(65536, bytes.length - count), count);
        if (!bytesRead) break;
        count += bytesRead;
      }
      if (count > MAX_BYTES) throw new Error('FILE_TOO_LARGE');
      const after = await handle.stat({ bigint: true });
      if (after.nlink > 1n || !sameContents(before, after)) throw new Error('FILE_CHANGED');
      const pathAfter = await this.checked(ctx, relative);
      if (!sameContents(after, pathAfter.stats)) throw new Error('FILE_CHANGED');
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count)); }
      catch { throw new Error('FILE_NOT_TEXT'); }
      if ([...text].some(char => { const code = char.charCodeAt(0); return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127; })) throw new Error('FILE_NOT_TEXT');
      this.assertContext(ctx);
      return text;
    } finally { await handle.close(); }
  }

  private async *walk(ctx: Context, relative: string, depth: number, traversal: Traversal): AsyncGenerator<Entry> {
    const directory = await this.checked(ctx, relative);
    if (!directory.stats.isDirectory()) throw new Error('FILE_NOT_DIRECTORY');
    const entries: string[] = [];
    const handle = await opendir(directory.absolute);
    try {
      for (;;) {
        this.assertContext(ctx);
        if (traversal.entriesScanned >= MAX_ENTRIES) { traversal.truncated = true; break; }
        const entry = await handle.read();
        if (!entry) break;
        traversal.entriesScanned += 1;
        entries.push(entry.name);
      }
    } finally { await handle.close(); }
    entries.sort();
    for (const name of entries) {
      this.assertContext(ctx);
      const child = relative ? `${relative}/${name}` : name;
      let entry: CheckedPath;
      try { entry = await this.checked(ctx, child); }
      catch (error) { if (denied(error) || ['ENOENT', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) continue; throw error; }
      if (entry.stats.isDirectory()) {
        yield { path: child, type: 'directory' };
        if (depth > 1 && traversal.entriesScanned < MAX_ENTRIES) yield* this.walk(ctx, child, depth - 1, traversal);
        else traversal.truncated = true;
      } else if (entry.stats.isFile()) yield { path: child, type: 'file' };
    }
  }

  private async verifyReturn(ctx: Context): Promise<void> {
    this.assertContext(ctx);
    const protectedPaths = await this.protectedPaths();
    for (const item of ctx.snapshots.values()) {
      this.assertContext(ctx);
      const stats = await lstat(item.absolute, { bigint: true });
      if (stats.isSymbolicLink() || (stats.isFile() && stats.nlink > 1n)) throw new Error('FILE_LINK_DENIED');
      if (!sameFile(item.stats, stats) || (stats.isFile() && !sameContents(item.stats, stats))) throw new Error('FILE_CHANGED');
      const canonical = await realpath(item.absolute);
      if (!samePath(canonical, item.absolute) || !inside(ctx.root, canonical)) throw new Error('FILE_CHANGED');
      if (protectedPaths.some(root => inside(root, canonical)) && !ctx.exempt.some(root => inside(root, canonical))) throw new Error('CONTEXT_PATH_EXCLUDED');
    }
    if (!samePath(await realpath(ctx.sourceRoot), ctx.root)) throw new Error('FILE_CHANGED');
    this.assertContext(ctx);
  }

  async execute(runId: string, name: ToolName, input: unknown, signal?: AbortSignal): Promise<string> {
    this.authorize(runId, signal);
    const parsed = name === 'read_file' ? readInput.safeParse(input) : name === 'list_files' ? listInput.safeParse(input) : name === 'search_text' ? searchInput.safeParse(input) : undefined;
    if (!parsed?.success) throw new Error('INVALID_TOOL_INPUT');
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(parsed.data.path)) throw new Error('REMOTE_URL_UNSUPPORTED');
    const directoryRoot = name !== 'read_file' && ['.', './', '.\\'].includes(parsed.data.path);
    const requestedPath = directoryRoot ? '' : normalize(parsed.data.path);
    let ctx: Context;
    try { ctx = await this.context(runId, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code) throw new Error('PROJECT_UNAVAILABLE', { cause: error }); throw error; }
    let result: { truncated: boolean; [key: string]: unknown };
    try {
      if (name === 'read_file') {
        const options = parsed.data as z.infer<typeof readInput>;
        const lines = splitLines(await this.readText(ctx, requestedPath));
        const selected = lines.slice(options.startLine - 1, options.startLine - 1 + options.lineCount);
        result = { path: requestedPath, startLine: options.startLine, endLine: selected.length ? options.startLine + selected.length - 1 : options.startLine - 1, totalLines: lines.length, text: selected.join('\n'), truncated: options.startLine > 1 || options.startLine - 1 + selected.length < lines.length };
        if (JSON.stringify(result).length > MAX_OUTPUT) {
          result.truncated = true;
          const source = result.text as string;
          let low = 0; let high = source.length;
          while (low < high) { const middle = Math.ceil((low + high) / 2); result.text = source.slice(0, middle); if (JSON.stringify(result).length <= MAX_OUTPUT) low = middle; else high = middle - 1; }
          result.text = source.slice(0, low);
          result.endLine = (result.text as string).length ? options.startLine + (result.text as string).split('\n').length - 1 : options.startLine - 1;
        }
      } else if (name === 'list_files') {
        const entries: Entry[] = [];
        const traversal: Traversal = { entriesScanned: 0, truncated: false };
        for await (const entry of this.walk(ctx, requestedPath, (parsed.data as z.infer<typeof listInput>).depth, traversal)) {
          if (entry.type === 'file') {
            try { await this.readText(ctx, entry.path); }
            catch (error) { if (denied(error)) continue; throw error; }
          }
          entries.push(entry);
          if (entries.length === 200) { traversal.truncated = true; break; }
        }
        result = { path: requestedPath, entries, truncated: traversal.truncated };
        while (JSON.stringify(result).length > MAX_OUTPUT && entries.length) { entries.pop(); result.truncated = true; }
      } else {
        const query = (parsed.data as z.infer<typeof searchInput>).query;
        const matches: Match[] = [];
        const traversal: Traversal = { entriesScanned: 0, truncated: false };
        let filesScanned = 0;
        for await (const entry of this.walk(ctx, requestedPath, 32, traversal)) {
          if (entry.type !== 'file') continue;
          if (filesScanned >= 100) { traversal.truncated = true; break; }
          filesScanned += 1;
          let text: string;
          try { text = await this.readText(ctx, entry.path); }
          catch (error) { if (denied(error)) { if ((error as Error).message === 'FILE_TOO_LARGE') traversal.truncated = true; continue; } throw error; }
          const lines = splitLines(text);
          for (let index = 0; index < lines.length; index += 1) {
            if (!lines[index]!.includes(query)) continue;
            matches.push({ path: entry.path, line: index + 1, text: lines[index]! });
            if (matches.length === 100) { traversal.truncated = true; break; }
          }
          if (matches.length === 100) break;
        }
        result = { path: requestedPath, query, matches, filesScanned, truncated: traversal.truncated };
        while (JSON.stringify(result).length > MAX_OUTPUT && matches.length) {
          result.truncated = true;
          const last = matches.at(-1)!;
          if (last.text.length > 1000) last.text = last.text.slice(0, 1000);
          else matches.pop();
        }
      }
      await this.verifyReturn(ctx);
      const output = JSON.stringify(result);
      if (output.length > MAX_OUTPUT) throw new Error('TOOL_OUTPUT_LIMIT');
      return output;
    } catch (error) {
      this.assertContext(ctx);
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') throw new Error('NOT_FOUND', { cause: error });
      if (code === 'EACCES' || code === 'EPERM') throw new Error('FORBIDDEN', { cause: error });
      if (code) throw new Error('FILE_UNAVAILABLE', { cause: error });
      throw error;
    }
  }
}
