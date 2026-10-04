import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join, parse, relative, resolve, sep } from 'node:path';
import { fromBufferPromise } from 'yauzl';
import { createHash } from 'node:crypto';
import type { Control } from '../engine/control';
import { ResearchContextSchema } from '../engine/research';
import { ResearchReviewContextSchema, type ResearchReviewContext } from '../engine/review-contract';
import type { ResearchDocumentSchema } from '../shared/params';
import type { z } from 'zod';
import type { ReviewKit } from './review';
import { reviewBinding } from './review';
import { containedFolder, readPackage, reviewFolder } from './review-workspace';

/**
 * The reader `research.document.read` (docs/specification/research-review-ui.md, section 3): the redacted text of a job's
 * brief or evidence table. The request names a document, never a path; the job's status decides the source. Every
 * outcome is one result or one `DOCUMENT_*` / `RESEARCH_KIT_UNAVAILABLE` code, and no error carries document text.
 */
export type ResearchDocument = z.infer<typeof ResearchDocumentSchema>;
export type DocumentName = 'brief' | 'evidence';
export interface DocumentDeps {
  control(control: Control): Promise<unknown>;
  /** The kit, or null when research is not installed (a verified source is then `RESEARCH_KIT_UNAVAILABLE`). */
  kit: Pick<ReviewKit, 'verifyRetained'> | null;
  /** `<userData>/research-kit/storage/review`: one workspace folder per job. */
  reviewRoot: string;
  /** The vault redactor; it throws when it cannot run. */
  redact(text: string): Promise<string>;
}

/** The whole document is read, at most this many bytes; one more is `DOCUMENT_TOO_LARGE`. */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
/** The result's cap, applied after redaction. */
export const MAX_DOCUMENT_TEXT_BYTES = 262_144;
const FILES: Record<DocumentName, readonly [string, string]> = { brief: ['research', 'BRIEF.md'], evidence: ['research', 'EVIDENCE.md'] };
const WORKSPACE_STATUSES: ReadonlySet<string> = new Set(['reviewing', 'packaging', 'not_ready']);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const missing = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
const fail = (code: string): never => { throw new Error(code); };

/** Cuts UTF-8 text to at most `max` bytes at a character boundary, never inside one. */
export function cutUtf8(text: string, max: number = MAX_DOCUMENT_TEXT_BYTES): { text: string; truncated: boolean } {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= max) return { text: bytes.toString('utf8'), truncated: false };
  let end = max;
  // A continuation byte (10xxxxxx) at the cut means the cut is inside a character: back off to its first byte.
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return { text: bytes.subarray(0, end).toString('utf8'), truncated: true };
}

export async function readResearchDocument(deps: DocumentDeps, researchId: string, document: DocumentName): Promise<ResearchDocument> {
  const ctx = ResearchReviewContextSchema.parse(await deps.control({ method: 'research.review.context', researchId }));
  const file = FILES[document];
  if (ctx.status === 'approved') {
    const unverified: ResearchDocument = { text: '', truncated: false, source: 'reviewed', verified: false };
    if (!ctx.reviewedPackage || !ctx.verification) return unverified;
    const projectId = await projectOf(deps, researchId);
    const bytes = await verified(deps, ctx.reviewedPackage.sha256, reviewBinding(projectId, researchId, ctx.verification, ctx.reviewedPackage.boundRevision));
    if (!bytes) return unverified;
    const raw = await entry(bytes, file);
    if (raw === 'invalid') return unverified;
    return { ...await present(deps, raw), source: 'reviewed', verified: true };
  }
  if (ctx.status === 'collected') return collected(deps, ctx, researchId, file);
  if (WORKSPACE_STATUSES.has(ctx.status)) {
    const raw = await readWorkspace(deps.reviewRoot, researchId, file);
    // Only an absent job folder falls back to the collected package; every containment failure threw DOCUMENT_UNSAFE.
    if (raw === null) return collected(deps, ctx, researchId, file);
    return { ...await present(deps, raw), source: 'workspace', verified: false };
  }
  return fail('DOCUMENT_NOT_AVAILABLE');
}

/** The retained collected package, validated in this call under the job's journaled binding; text from the returned buffer. */
async function collected(deps: DocumentDeps, ctx: ResearchReviewContext, researchId: string, file: readonly [string, string]): Promise<ResearchDocument> {
  if (!ctx.verification) return fail('DOCUMENT_NOT_AVAILABLE');
  const projectId = await projectOf(deps, researchId);
  const bytes = await verified(deps, ctx.verification.artifactSha256, reviewBinding(projectId, researchId, ctx.verification, ctx.verification.jobRevision));
  if (!bytes) return fail('DOCUMENT_UNVERIFIED');
  const raw = await entry(bytes, file);
  if (raw === 'invalid') return fail('DOCUMENT_UNVERIFIED');
  return { ...await present(deps, raw), source: 'collected', verified: true };
}

async function projectOf(deps: DocumentDeps, researchId: string): Promise<string> {
  return ResearchContextSchema.parse(await deps.control({ method: 'research.context', researchId })).research.projectId;
}

/**
 * A fresh validation of the retained package (no receipt cache): its verified bytes, or null when the package is
 * missing or does not verify. A validator that cannot run is `RESEARCH_KIT_UNAVAILABLE`, never "does not verify".
 */
async function verified(deps: DocumentDeps, digest: string, binding: ReturnType<typeof reviewBinding>): Promise<Buffer | null> {
  if (!deps.kit) return fail('RESEARCH_KIT_UNAVAILABLE');
  try { return (await deps.kit.verifyRetained(digest, binding)).bytes; }
  catch (error) {
    // INSTALLATION_INVALID and VALIDATOR_UNAVAILABLE (a validator that could not finish) are both this machine's.
    if (error instanceof Error && error.message === 'STALE_VERIFICATION') return null;
    return fail('RESEARCH_KIT_UNAVAILABLE');
  }
}

/**
 * The document's bytes from verified package bytes, in memory: the entry `project/<file>`, checked against the manifest's
 * hash. `invalid` when the bytes cannot be read as the package they verified as; `DOCUMENT_NOT_AVAILABLE` when the
 * package has no such document.
 */
async function entry(bytes: Buffer, file: readonly [string, string]): Promise<Buffer | 'invalid'> {
  const path = file.join('/'); const name = `project/${path}`;
  let expected: string | undefined;
  try { expected = (await readPackage(bytes)).base.find(item => item.path === path)?.sha256; } catch { return 'invalid'; }
  if (expected === undefined) return fail('DOCUMENT_NOT_AVAILABLE');
  let found: Buffer | undefined;
  try {
    const zip = await fromBufferPromise(bytes, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true });
    try {
      for await (const item of zip.eachEntry()) {
        if (item.fileName !== name) continue;
        if (item.uncompressedSize > MAX_DOCUMENT_BYTES) return fail('DOCUMENT_TOO_LARGE');
        const stream = await zip.openReadStreamPromise(item); const chunks: Buffer[] = []; let size = 0;
        try { for await (const chunk of stream as AsyncIterable<Buffer>) { size += chunk.length; if (size > MAX_DOCUMENT_BYTES) return fail('DOCUMENT_TOO_LARGE'); chunks.push(chunk); } }
        finally { stream.destroy(); }
        found = Buffer.concat(chunks); break;
      }
    } finally { zip.close(); }
  } catch (error) {
    if (error instanceof Error && error.message === 'DOCUMENT_TOO_LARGE') throw error;
    return 'invalid';
  }
  return found !== undefined && sha256(found) === expected ? found : 'invalid';
}

/**
 * The workspace document's bytes, or null when the job's workspace folder does not exist. Before opening: every folder
 * from the filesystem root to `<id>` a real directory, then `containedFolder` for `<id>/project` (realpath equal to the
 * derived path), then each component below it lstat-checked. Open without following a final link, then fstat: a regular
 * file, one link, the identity the lstat saw. Any link, junction, second hard link or replaced file is `DOCUMENT_UNSAFE`.
 * `hooks.beforeOpen` is a test seam between the lstat and the open; main never passes it.
 */
export async function readWorkspace(reviewRoot: string, researchId: string, file: readonly [string, string], hooks: { beforeOpen?(): Promise<void> } = {}): Promise<Buffer | null> {
  let folder: ReturnType<typeof reviewFolder>;
  try { folder = reviewFolder(reviewRoot, researchId); } catch { return null; }
  const absolute = resolve(folder.job); let current = parse(absolute).root;
  for (const component of relative(current, absolute).split(sep).filter(Boolean)) {
    current = join(current, component);
    let info;
    try { info = await lstat(current); } catch (error) { if (missing(error)) return null; return fail('DOCUMENT_UNSAFE'); }
    if (!info.isDirectory() || info.isSymbolicLink()) return fail('DOCUMENT_UNSAFE');
  }
  try { await lstat(folder.project); } catch (error) { return fail(missing(error) ? 'DOCUMENT_NOT_AVAILABLE' : 'DOCUMENT_UNSAFE'); }
  const contained = () => containedFolder(reviewRoot, researchId, { project: true }).catch(() => fail('DOCUMENT_UNSAFE'));
  await contained();
  let target = folder.project;
  for (let index = 0; index < file.length; index++) {
    target = join(target, file[index]!);
    let info;
    try { info = await lstat(target, { bigint: true }); } catch (error) { return fail(missing(error) ? 'DOCUMENT_NOT_AVAILABLE' : 'DOCUMENT_UNSAFE'); }
    if (info.isSymbolicLink()) return fail('DOCUMENT_UNSAFE');
    if (index < file.length - 1) { if (!info.isDirectory()) return fail('DOCUMENT_UNSAFE'); continue; }
    if (!info.isFile() || info.nlink !== 1n) return fail('DOCUMENT_UNSAFE');
    await hooks.beforeOpen?.();
    const bytes = await readIdentified(target, info);
    // A folder swapped for a link while the file was read: the bytes are not the workspace's.
    await contained();
    return bytes;
  }
  return fail('DOCUMENT_UNSAFE');
}

async function readIdentified(target: string, seen: { dev: bigint; ino: bigint }): Promise<Buffer> {
  let handle;
  try { handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); } catch { return fail('DOCUMENT_UNSAFE'); }
  try {
    const info = await handle.stat({ bigint: true });
    if (!info.isFile() || info.nlink !== 1n || info.dev !== seen.dev || info.ino !== seen.ino) return fail('DOCUMENT_UNSAFE');
    if (info.size > BigInt(MAX_DOCUMENT_BYTES)) return fail('DOCUMENT_TOO_LARGE');
    const bytes = Buffer.alloc(MAX_DOCUMENT_BYTES + 1); let offset = 0;
    while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) break; offset += bytesRead; }
    if (offset > MAX_DOCUMENT_BYTES) return fail('DOCUMENT_TOO_LARGE');
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}

/** Decode the whole document, redact the whole text, then cut: a secret is never split before it is matched. */
async function present(deps: DocumentDeps, raw: Buffer): Promise<{ text: string; truncated: boolean }> {
  const text = new TextDecoder('utf-8').decode(raw);
  let redacted: string;
  // No cause: whatever the redactor threw stays in main.
  try { redacted = await deps.redact(text); } catch { return fail('DOCUMENT_REDACTION_UNAVAILABLE'); }
  return cutUtf8(redacted);
}
