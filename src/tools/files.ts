import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { Store, type StoreOperation, type StoreProject } from '../engine/store';
import { projectRoot, type RunRootResolver } from '../engine/research-review';
import { assertToolPolicy, approvalMatches, canonicalHash } from '../engine/policy';
import { ApprovalSchema, type Approval } from '../shared';
import { resolveProjectPath, validateRelativePath } from './paths';
import { SnapshotStore } from './snapshots';

const MAX_BYTES = 1_048_576;
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const WriteInput = z.object({ path: z.string(), content: z.string().nullable(), beforeHash: z.string().nullable(), afterHash: z.string().nullable(), undoOf: z.string().optional() }).strict();
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'cancelling']);

/** Writes enter the durable journal before any project mutation. Snapshots are content-addressed. */
export class FileJournal {
  private readonly lanes = new Set<string>();
  readonly snapshots: SnapshotStore;
  /** `rootFor`: where a run's files resolve (the project folder, or a review run's workspace). */
  constructor(private readonly store: Store, snapshots: string, snapshotLimitBytes?: number, private readonly rootFor: RunRootResolver = projectRoot) {
    this.snapshots = new SnapshotStore(snapshots, () => store.protectedSnapshotRefs(), snapshotLimitBytes);
  }

  private authority(runId: string, signal?: AbortSignal): { project: StoreProject; root: string } {
    const run = this.store.getRun(runId); if (!run || terminal.has(run.status)) throw new Error('RUN_CANCELLED');
    if (run.projectId === null) throw new Error('PROJECT_REQUIRED');
    if (this.store.getSession(run.sessionId)?.policy.revision !== run.sessionPolicyRevision) throw new Error('RUN_CANCELLED');
    const project = this.store.getProject(run.projectId); if (!project) throw new Error('PROJECT_NOT_FOUND');
    const root = this.rootFor(run, project);
    // A review run writes only while it is its job's live review run.
    if (!root.current) throw new Error('RUN_CANCELLED');
    assertToolPolicy(run.mode, 'write', project, signal, { reviewWorkspace: root.review });
    if (run.trustRevision !== project.trustRevision || run.policyRevision !== project.policy.revision) throw new Error('APPROVAL_STALE');
    return { project, root: root.root };
  }
  /** Undo and recovery act on a finished run's write, under that run's mode and root (rootFor), never a fixed Build root. */
  private undoAuthority(operation: StoreOperation, signal?: AbortSignal): { project: StoreProject; root: string } {
    const project = this.store.getProject(operation.projectId); if (!project) throw new Error('PROJECT_NOT_FOUND');
    const run = this.store.getRun(operation.runId); if (!run) throw new Error('RUN_NOT_FOUND');
    const root = this.rootFor(run, project);
    assertToolPolicy(run.mode, 'write', project, signal, { reviewWorkspace: root.review });
    if (this.store.listSessions(operation.projectId).some(session => this.store.listRuns(session.id).some(item => !['completed', 'failed', 'cancelled', 'interrupted'].includes(item.status)))) throw new Error('RUN_ACTIVE');
    return { project, root: root.root };
  }
  private operationAuthority(operation: StoreOperation, signal?: AbortSignal) {
    return WriteInput.parse(operation.input).undoOf ? this.undoAuthority(operation, signal) : this.authority(operation.runId, signal);
  }
  private async current(target: string): Promise<Buffer | null> {
    let info;
    try { info = await lstat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('PATH_OUTSIDE_PROJECT');
    if (info.nlink > 1) throw new Error('HARDLINK_REVIEW_REQUIRED');
    if (info.size > MAX_BYTES) throw new Error('FILE_TOO_LARGE');
    const file = await open(target, 'r');
    try {
      const opened = await file.stat();
      if (opened.ino !== info.ino || opened.dev !== info.dev || opened.nlink > 1 || opened.size > MAX_BYTES) throw new Error('FILE_CONFLICT');
      const bytes = Buffer.alloc(MAX_BYTES + 1); let bytesRead = 0;
      while (bytesRead < bytes.length) {
        const chunk = await file.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
        if (!chunk.bytesRead) break;
        bytesRead += chunk.bytesRead;
      }
      if (bytesRead > MAX_BYTES) throw new Error('FILE_TOO_LARGE');
      const result = bytes.subarray(0, bytesRead);
      try { new TextDecoder('utf-8', { fatal: true }).decode(result); } catch { throw new Error('UNSUPPORTED_ENCODING'); }
      if (result.includes(0)) throw new Error('UNSUPPORTED_ENCODING');
      return result;
    } finally { await file.close(); }
  }
  readSnapshot(hash: string): Promise<string> { return this.snapshots.read(hash); }
  async prepareWrite(runId: string, path: string, content: string, signal?: AbortSignal): Promise<StoreOperation> {
    return this.propose(runId, path, content, signal);
  }
  async prepareEdit(runId: string, path: string, search: string, replacement: string, signal?: AbortSignal): Promise<StoreOperation> {
    const { root } = this.authority(runId, signal);
    const before = await this.current(await resolveProjectPath(root, path));
    if (before === null) throw new Error('FILE_CONFLICT');
    const content = before.toString('utf8');
    const crlf = (content.match(/\r\n/g) ?? []).length;
    const lf = (content.match(/(?<!\r)\n/g) ?? []).length;
    const newline = crlf >= lf && crlf > 0 ? '\r\n' : '\n';
    const match = search.replace(/\r\n|\n/g, newline);
    const start = content.indexOf(match);
    if (!match || start < 0 || content.indexOf(match, start + 1) !== -1) throw new Error('EDIT_MATCH_NOT_UNIQUE');
    const next = content.slice(0, start) + replacement.replace(/\r\n|\n/g, newline) + content.slice(start + match.length);
    return this.propose(runId, path, next, signal, digest(before));
  }
  private async propose(runId: string, path: string, content: string, signal?: AbortSignal, expectedBeforeHash?: string): Promise<StoreOperation> {
    const { project, root } = this.authority(runId, signal); const relative = validateRelativePath(path);
    const bytes = Buffer.from(content, 'utf8'); if (bytes.byteLength > MAX_BYTES) throw new Error('FILE_TOO_LARGE');
    if (content.includes('\0') || bytes.toString('utf8') !== content) throw new Error('UNSUPPORTED_ENCODING');
    const target = await resolveProjectPath(root, relative, { allowMissing: true });
    const before = await this.current(target);
    if (expectedBeforeHash !== undefined && (before === null || digest(before) !== expectedBeforeHash)) throw new Error('FILE_CONFLICT');
    return this.snapshots.retain(before === null ? [bytes] : [before, bytes], hashes => {
      const beforeHash = before === null ? null : hashes[0]; const afterHash = hashes.at(-1)!;
      this.authority(runId, signal);
      const input = { path: relative, content, beforeHash, afterHash }; const now = new Date().toISOString();
      const operation: StoreOperation = { id: randomUUID(), runId, projectId: project.id, kind: 'write', inputHash: canonicalHash(input), policyRevision: project.policy.revision, trustRevision: project.trustRevision, status: 'prepared', input, ...(beforeHash ? { beforeRef: beforeHash, snapshotRef: beforeHash } : {}), afterRef: afterHash, createdAt: now, updatedAt: now };
      this.store.putOperation(operation); return operation;
    });
  }
  async prepareUndo(operationId: string, expectedAfterHash: string | null, signal?: AbortSignal, record?: (operation: StoreOperation) => void): Promise<StoreOperation> {
    const original = this.store.getOperation(operationId);
    if (!original || original.kind !== 'write' || original.status !== 'completed') throw new Error('UNDO_UNAVAILABLE');
    // A review edit is never undone: the agent proposes a new edit (spec "Tools").
    if (this.store.getRun(original.runId)?.mode === 'research') throw new Error('UNDO_UNAVAILABLE');
    const previous = WriteInput.parse(original.input);
    if (previous.undoOf) throw new Error('UNDO_UNAVAILABLE');
    return this.snapshots.retainExisting([previous.beforeHash, previous.afterHash].filter((hash): hash is string => hash !== null), () => this.prepareRetainedUndo(original, expectedAfterHash, signal, record)).catch(error => {
      if (['ENOENT', 'SNAPSHOT_CORRUPT'].includes(error.code ?? error.message)) throw new Error('UNDO_UNAVAILABLE', { cause: error }); throw error;
    });
  }
  private async prepareRetainedUndo(original: StoreOperation, expectedAfterHash: string | null, signal?: AbortSignal, record?: (operation: StoreOperation) => void): Promise<StoreOperation> {
    const previous = WriteInput.parse(original.input);
    const { project, root } = this.undoAuthority(original, signal);
    // A relink/retrust invalidates old path authority, even if the relative name still exists.
    if (original.trustRevision !== project.trustRevision) throw new Error('APPROVAL_STALE');
    if (expectedAfterHash !== previous.afterHash) throw new Error('FILE_CONFLICT');
    const target = await resolveProjectPath(root, previous.path, { allowMissing: true });
    const current = await this.current(target);
    const content = previous.beforeHash === null ? null : await this.readSnapshot(previous.beforeHash).catch(() => { throw new Error('UNDO_UNAVAILABLE'); });
    this.undoAuthority(original, signal);
    if (this.store.listOperations(original.runId).some(operation => operation.kind === 'write' && WriteInput.safeParse(operation.input).data?.undoOf === original.id && operation.status !== 'failed')) throw new Error('UNDO_UNAVAILABLE');
    if ((current === null ? null : digest(current)) !== previous.afterHash) throw new Error('FILE_CONFLICT');
    const input = { path: previous.path, content, beforeHash: previous.afterHash, afterHash: previous.beforeHash, undoOf: original.id };
    const now = new Date().toISOString();
    const undo: StoreOperation = { id: randomUUID(), runId: original.runId, projectId: project.id, kind: 'write', inputHash: canonicalHash(input), policyRevision: project.policy.revision, trustRevision: project.trustRevision, status: 'prepared', input, ...(previous.afterHash ? { beforeRef: previous.afterHash } : {}), ...(previous.beforeHash ? { afterRef: previous.beforeHash } : {}), createdAt: now, updatedAt: now };
    if (record) record(undo); else this.store.putOperation(undo);
    return undo;
  }
  /** Recovery inspects the current bytes; it never retries an ambiguous filesystem mutation. */
  async observeRecovery(operationId: string): Promise<'applied' | 'not-applied' | 'conflict'> {
    const operation = this.store.getOperation(operationId);
    if (!operation || operation.kind !== 'write' || operation.status !== 'unknown') throw new Error('OPERATION_NOT_UNKNOWN');
    const input = WriteInput.parse(operation.input);
    const { project, root } = this.undoAuthority(operation);
    if (project.trustRevision !== operation.trustRevision) throw new Error('APPROVAL_STALE');
    const current = await this.current(await resolveProjectPath(root, input.path, { allowMissing: true }));
    const { project: live } = this.undoAuthority(operation);
    if (live.trustRevision !== operation.trustRevision) throw new Error('APPROVAL_STALE');
    const hash = current === null ? null : digest(current);
    return hash === input.afterHash ? 'applied' : hash === input.beforeHash ? 'not-applied' : 'conflict';
  }
  async reconcile(operationId: string): Promise<'applied' | 'not-applied' | 'conflict'> {
    const outcome = await this.observeRecovery(operationId);
    if (outcome === 'applied') {
      const input = WriteInput.parse(this.store.getOperation(operationId)!.input);
      this.store.updateOperation(operationId, { status: 'completed', result: { path: input.path, beforeHash: input.beforeHash, afterHash: input.afterHash, recovered: true } });
    }
    return outcome;
  }
  async apply(operationId: string, approval: Approval, signal?: AbortSignal): Promise<StoreOperation> {
    const operation = this.store.getOperation(operationId);
    if (!operation || operation.kind !== 'write' || operation.status !== 'prepared') throw new Error('OPERATION_NOT_PREPARED');
    const input = WriteInput.parse(operation.input);
    const { project, root } = this.operationAuthority(operation, signal);
    if (!approvalMatches(operation, approval, project) || canonicalHash(input) !== operation.inputHash) throw new Error('APPROVAL_STALE');
    ApprovalSchema.parse(approval);
    const target = await resolveProjectPath(root, input.path, { allowMissing: true });
    const lane = target.toLowerCase(); if (this.lanes.has(lane)) throw new Error('FILE_BUSY'); this.lanes.add(lane);
    const temporary = join(dirname(target), `.moonaliza-${randomUUID()}.tmp`);
    let started = false; let renamed = false;
    try {
      if (!(await stat(dirname(target))).isDirectory()) throw new Error('PATH_OUTSIDE_PROJECT');
      const before = await this.current(target);
      if ((before === null ? null : digest(before)) !== input.beforeHash) throw new Error('FILE_CONFLICT');
      this.store.transaction(() => {
        this.store.putApproval({ ...approval, id: randomUUID(), createdAt: new Date().toISOString() });
        this.store.updateOperation(operationId, { status: 'started' });
      }); started = true;
      if (input.content !== null) {
        if (digest(Buffer.from(input.content)) !== input.afterHash) throw new Error('FILE_CONFLICT');
        const file = await open(temporary, 'wx', 0o600);
        try { await file.writeFile(input.content, 'utf8'); await file.sync(); } finally { await file.close(); }
      }
      const live = this.operationAuthority(operation, signal);
      if (!approvalMatches(operation, approval, live.project)) throw new Error('APPROVAL_STALE');
      if (await resolveProjectPath(live.root, input.path, { allowMissing: true }) !== target) throw new Error('FILE_CONFLICT');
      const current = await this.current(target);
      if ((current === null ? null : digest(current)) !== input.beforeHash) throw new Error('FILE_CONFLICT');
      if (signal?.aborted) throw new Error('RUN_CANCELLED');
      if (input.content === null) await unlink(target); else await rename(temporary, target);
      renamed = true;
      return this.store.updateOperation(operationId, { status: 'completed', result: { path: input.path, beforeHash: input.beforeHash, afterHash: input.afterHash } });
    } catch (error) {
      if (started) this.store.updateOperation(operationId, { status: renamed ? 'unknown' : 'failed' });
      throw error;
    } finally { this.lanes.delete(lane); await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; }); }
  }
}
