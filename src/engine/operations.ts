import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { relative, isAbsolute, resolve, join, sep } from 'node:path';
import { z } from 'zod';
import { FileJournal } from '../tools/files';
import { isSensitiveContextPath, resolveProjectPath, validateRelativePath } from '../tools/paths';
import { ApprovalSchema, OperationSchema, type Approval, type Change, type RunEvent, type ToolCall, type ToolSpec, type RecoveryIdentity, type RecoveryItem } from '../shared';
import { Store, type StoreOperation } from './store';
import { approvalMatches, assertToolPolicy, canonicalHash } from './policy';
import { CommandPlanSchema, type CommandPlan } from '../shared/commands';
import type { OwnedResult } from '../tools/commands';
import { projectRoot, type RunRootResolver } from './research-review';
import { REVIEW_WRITE_ALLOWLIST } from './review-contract';

export interface CommandHost {
  prepareCommand(runId: string, input: unknown, signal: AbortSignal): Promise<CommandPlan>;
  executeCommand(runId: string, operationId: string, signal: AbortSignal): Promise<OwnedResult>;
}

const write = z.object({ path: z.string().min(1).max(32767), content: z.string().max(1_048_576) }).strict();
const edit = z.object({ path: z.string().min(1).max(32767), search: z.string().min(1).max(1_048_576), replacement: z.string().max(1_048_576) }).strict();
const journalInput = z.object({ path: z.string(), content: z.string().nullable(), beforeHash: z.string().nullable(), afterHash: z.string().nullable(), undoOf: z.string().optional() }).strict();
export const WRITE_TOOL_SPECS: ToolSpec[] = [
  { name: 'write_file', description: 'Propose creating or replacing a UTF-8 text file. Existing parent directory required. The user reviews the exact contents before applying.', parameters: z.toJSONSchema(write) as ToolSpec['parameters'] },
  { name: 'edit_file', description: 'Propose replacing exactly one matching text segment. Preserves BOM and dominant newlines. Requires user approval.', parameters: z.toJSONSchema(edit) as ToolSpec['parameters'] },
];
const publicOperation = (op: StoreOperation) => OperationSchema.parse({ id: op.id, runId: op.runId, projectId: op.projectId, kind: op.kind, inputHash: op.inputHash, trustRevision: op.trustRevision, policyRevision: op.policyRevision, status: op.status, createdAt: op.createdAt });
const bound = (op: StoreOperation): Approval => ({ operationId: op.id, projectId: op.projectId, inputHash: op.inputHash, trustRevision: op.trustRevision, policyRevision: op.policyRevision, decision: 'allow' });
const recoveryState = z.object({ observation: z.enum(['uninspected', 'applied', 'not-applied', 'conflict']).default('uninspected'), inspectedAt: z.string().optional(), acknowledgedAt: z.string().optional() });
const storedResult = (op: StoreOperation) => op.result && typeof op.result === 'object' && !Array.isArray(op.result) ? op.result as Record<string, unknown> : {};
const recovery = (op: StoreOperation) => recoveryState.parse(storedResult(op).recovery ?? {});

/** Owns approval waits and journals effects before they can reach the filesystem. */
export class Operations {
  readonly journal: FileJournal;
  private readonly waiting = new Map<string, { resolve: (approval: Approval) => void }>();
  private readonly maintenance = new Set<string>();
  constructor(private readonly store: Store, snapshots: string, private readonly protectedRoots: string[], private readonly publish: (event: RunEvent) => void, private readonly commandHost?: CommandHost, private readonly rootFor: RunRootResolver = projectRoot) {
    this.journal = new FileJournal(store, snapshots, undefined, rootFor);
  }
  isBusy(projectId: string) { return this.maintenance.has(projectId); }
  private event(runId: string, type: RunEvent['type'], payload: unknown, status?: 'awaiting_approval' | 'running') {
    this.publish(this.store.appendEvent(runId, type, payload, status ? { status } : undefined) as RunEvent);
  }
  private async allowedPath(runId: string, path: string, signal: AbortSignal) {
    const run = this.store.getRun(runId); if (!run) throw new Error('RUN_NOT_FOUND');
    if (run.projectId === null) throw new Error('PROJECT_REQUIRED');
    if (this.store.getSession(run.sessionId)?.policy.revision !== run.sessionPolicyRevision) throw new Error('RUN_CANCELLED');
    const project = this.store.getProject(run.projectId); if (!project) throw new Error('PROJECT_NOT_FOUND');
    const root = this.rootFor(run, project);
    assertToolPolicy(run.mode, 'write', project, signal, { reviewWorkspace: root.review });
    const name = validateRelativePath(path);
    if (isSensitiveContextPath(name)) throw new Error('PATH_OUTSIDE_PROJECT');
    // A review run writes only the four research files (Decisions, Q3), checked before an operation is prepared.
    if (root.review && !(REVIEW_WRITE_ALLOWLIST as readonly string[]).includes(name)) throw new Error('PATH_OUTSIDE_PROJECT');
    let component = root.root;
    for (const part of name.split('/')) {
      component = join(component, part);
      const info = await lstat(component).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      if (info?.isSymbolicLink()) throw new Error('PATH_OUTSIDE_PROJECT');
    }
    const target = await resolveProjectPath(root.root, name, { allowMissing: true });
    if (isSensitiveContextPath(target)) throw new Error('PATH_OUTSIDE_PROJECT');
    const within = (base: string) => { const rel = relative(base, target); return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)); };
    // Exactly the review workspace is exempt from the protected data folder; the rest of that folder stays protected.
    const workspace = root.review ? await realpath(root.root) : undefined;
    for (const protectedRoot of this.protectedRoots) {
      const canonical = await realpath(protectedRoot).catch(() => resolve(protectedRoot));
      if (within(canonical) && !(workspace !== undefined && within(workspace))) throw new Error('PATH_OUTSIDE_PROJECT');
    }
    return name;
  }
  pending(runId: string) {
    const run = this.store.getRun(runId); if (!run) throw new Error('RUN_NOT_FOUND');
    if (run.projectId === null) throw new Error('PROJECT_REQUIRED');
    if (this.store.getSession(run.sessionId)?.policy.revision !== run.sessionPolicyRevision) throw new Error('RUN_CANCELLED');
    return { operations: this.store.listOperations(runId).filter(op => this.waiting.has(op.id) && op.status === 'prepared' && !this.store.listApprovals(op.id).length).map(publicOperation) };
  }
  async preview(projectId: string, operationId: string) {
    const op = this.store.getOperation(operationId);
    if (!op || op.projectId !== projectId) throw new Error('NOT_FOUND');
    if (op.kind === 'command') {
      const input = CommandPlanSchema.parse(op.input);
      return { kind: 'command' as const, operation: publicOperation(op), executable: input.executable, args: input.args, cwd: input.cwd, timeoutMs: input.timeoutMs };
    }
    if (op.kind !== 'write') throw new Error('NOT_FOUND');
    const input = journalInput.parse(op.input);
    return { kind: 'write' as const, operation: publicOperation(op), path: input.path, before: input.beforeHash ? await this.journal.readSnapshot(input.beforeHash) : null, after: input.content };
  }
  decide(value: Approval) {
    const approval = ApprovalSchema.parse(value); const op = this.store.getOperation(approval.operationId);
    const project = this.store.getProject(approval.projectId);
    if (!op || !project || !this.waiting.has(op.id) || op.status !== 'prepared' || !approvalMatches(op, { ...approval, decision: 'allow' }, project)) throw new Error('APPROVAL_STALE');
    const previous = this.store.listApprovals(op.id)[0];
    if (previous && previous.decision !== approval.decision) throw new Error('APPROVAL_STALE');
    if (!previous) this.store.putApproval({ ...approval, id: randomUUID(), createdAt: new Date().toISOString() });
    return { approval };
  }
  // Called only after the acceptance transaction commits.
  deliver(operationId: string) {
    const approval = this.store.listApprovals(operationId)[0]; if (!approval) return;
    const { id: _id, createdAt: _at, ...dto } = approval;
    this.waiting.get(operationId)?.resolve(dto);
  }
  async command(runId: string, call: ToolCall, signal: AbortSignal): Promise<string> {
    if (!this.commandHost || call.name !== 'run_command' || call.inputError) throw new Error('COMMAND_UNAVAILABLE');
    const run = this.store.getRun(runId); if (!run) throw new Error('RUN_NOT_FOUND');
    if (run.projectId === null) throw new Error('PROJECT_REQUIRED');
    if (this.store.getSession(run.sessionId)?.policy.revision !== run.sessionPolicyRevision) throw new Error('RUN_CANCELLED');
    const input = CommandPlanSchema.parse(await this.commandHost.prepareCommand(runId, call.input, signal));
    const now = new Date().toISOString();
    const op: StoreOperation = { id: randomUUID(), runId, projectId: run.projectId, kind: 'command', inputHash: canonicalHash(input), input, trustRevision: run.trustRevision, policyRevision: run.policyRevision, status: 'prepared', createdAt: now, updatedAt: now };
    this.store.putOperation(op);
    let abort = () => {};
    try {
      const permission = new Promise<Approval>((resolveApproval, reject) => {
        abort = () => reject(new Error('RUN_CANCELLED'));
        this.waiting.set(op.id, { resolve: resolveApproval });
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
      });
      this.event(runId, 'tool.started', { operationId: op.id, call });
      this.event(runId, 'run.status', { status: 'awaiting_approval' }, 'awaiting_approval');
      this.event(runId, 'approval.required', { operation: publicOperation(op), summary: 'Review command execution' });
      const approval = await permission;
      this.event(runId, 'approval.decided', { approval });
      if (approval.decision !== 'allow') throw new Error('APPROVAL_DENIED');
      const project = this.store.getProject(run.projectId)!;
      assertToolPolicy(run.mode, 'command', project, signal);
      if (!approvalMatches(op, approval, project)) throw new Error('APPROVAL_STALE');
      this.store.updateOperation(op.id, { status: 'started' });
      this.event(runId, 'run.status', { status: 'running' }, 'running');
      const result = await this.commandHost.executeCommand(runId, op.id, signal);
      this.store.updateOperation(op.id, { status: result.status === 'unknown' ? 'unknown' : result.status === 'failed' ? 'failed' : 'completed', result });
      const output = JSON.stringify(result);
      this.event(runId, 'tool.completed', { operationId: op.id, toolCallId: call.id, output, truncated: result.truncated });
      return output;
    } catch (error) {
      const status = this.store.getOperation(op.id)?.status;
      const beforeDispatch = error instanceof Error && ['COMMAND_CHANGED', 'APPROVAL_STALE', 'RUN_CANCELLED'].includes(error.message);
      if (status === 'prepared' || status === 'started') this.store.updateOperation(op.id, { status: status === 'started' && !beforeDispatch ? 'unknown' : 'failed' });
      throw error;
    } finally { this.waiting.delete(op.id); signal.removeEventListener('abort', abort); }
  }
  async write(runId: string, call: ToolCall, signal: AbortSignal): Promise<string> {
    if (call.inputError) throw new Error('INVALID_REQUEST');
    const params = (call.name === 'write_file' ? write : call.name === 'edit_file' ? edit : z.never()).parse(call.input);
    await this.allowedPath(runId, params.path, signal);
    const op = 'content' in params ? await this.journal.prepareWrite(runId, params.path, params.content, signal) : await this.journal.prepareEdit(runId, params.path, params.search, params.replacement, signal);
    let abort = () => {};
    try {
      const permission = new Promise<Approval>((resolveApproval, reject) => {
        abort = () => reject(new Error('RUN_CANCELLED'));
        this.waiting.set(op.id, { resolve: resolveApproval });
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
      });
      this.event(runId, 'tool.started', { operationId: op.id, call });
      this.event(runId, 'run.status', { status: 'awaiting_approval' }, 'awaiting_approval');
      this.event(runId, 'approval.required', { operation: publicOperation(op), summary: `Review changes to ${params.path}` });
      const approval = await permission;
      this.event(runId, 'approval.decided', { approval });
      if (approval.decision !== 'allow') throw new Error('APPROVAL_DENIED');
      await this.allowedPath(runId, params.path, signal);
      await this.journal.apply(op.id, approval, signal);
      const output = JSON.stringify({ applied: true, path: params.path, changeId: op.id });
      this.event(runId, 'change.recorded', { change: this.change(this.store.getOperation(op.id)!) });
      this.event(runId, 'tool.completed', { operationId: op.id, toolCallId: call.id, output, truncated: false });
      this.event(runId, 'run.status', { status: 'running' }, 'running');
      return output;
    } catch (error) {
      if (this.store.getOperation(op.id)?.status === 'prepared') this.store.updateOperation(op.id, { status: 'failed' });
      throw error;
    } finally { this.waiting.delete(op.id); signal.removeEventListener('abort', abort); }
  }
  /**
   * The project's own operations. A review run's operations resolve against its workspace, not the project root, so they
   * are left out of changes, undo, recovery and requiresReview; review start reconciles them instead.
   */
  private projectOperations(projectId: string, runId?: string) {
    if (!this.store.getProject(projectId)) throw new Error('PROJECT_NOT_FOUND');
    return this.store.listSessions(projectId).flatMap(session => this.store.listRuns(session.id)).filter(run => run.mode !== 'research' && (!runId || run.id === runId)).flatMap(run => this.store.listOperations(run.id));
  }
  private change(op: StoreOperation): Change {
    const input = journalInput.parse(op.input);
    const undo = this.store.listOperations(op.runId).find(other => journalInput.safeParse(other.input).data?.undoOf === op.id && other.status !== 'failed');
    return { id: op.id, operationId: op.id, runId: op.runId, projectId: op.projectId, path: input.path, beforeHash: input.beforeHash, afterHash: input.afterHash, status: undo?.status === 'completed' ? 'undone' : undo || op.status === 'unknown' ? 'unknown' : 'applied', snapshotAvailable: true, createdAt: op.createdAt };
  }
  async changes(projectId: string, runId?: string, after = 0, limit = 500) {
    const all = this.projectOperations(projectId, runId).filter(op => op.kind === 'write' && ['completed', 'unknown'].includes(op.status) && !journalInput.parse(op.input).undoOf);
    const changes: Change[] = [];
    for (const op of all.slice(after, after + limit)) {
      const change = this.change(op);
      change.snapshotAvailable = await this.journal.snapshots.available(change.beforeHash) && await this.journal.snapshots.available(change.afterHash);
      changes.push(change);
    }
    return { changes, hasMore: all.length > after + limit };
  }
  requiresReview(projectId: string) { return this.projectOperations(projectId).some(op => op.status === 'unknown' && !recovery(op).acknowledgedAt); }
  private recoveryItem(op: StoreOperation): RecoveryItem {
    const input = op.kind === 'command' ? CommandPlanSchema.parse(op.input) : undefined;
    const summary = op.kind === 'write' ? journalInput.parse(op.input).path : input ? `${input.executable} ${JSON.stringify(input.args)}`.slice(0, 32767) : 'Interrupted operation';
    return { operation: publicOperation(op), summary, ...recovery(op) };
  }
  recoveryList(projectId: string, after = 0, limit = 500) {
    const items = this.projectOperations(projectId).filter(op => op.status === 'unknown' || storedResult(op).recovery).map(op => this.recoveryItem(op));
    const pending = (item: RecoveryItem) => item.operation.status === 'unknown' && !item.acknowledgedAt;
    items.sort((a, b) => Number(pending(b)) - Number(pending(a)) || (b.operation.createdAt ?? '').localeCompare(a.operation.createdAt ?? '') || b.operation.id.localeCompare(a.operation.id));
    return { items: items.slice(after, after + limit), hasMore: items.length > after + limit, pendingCount: items.filter(pending).length };
  }
  private recoveryOperation(identity: RecoveryIdentity) {
    const op = this.store.getOperation(identity.operationId);
    if (!op || op.projectId !== identity.projectId) throw new Error('NOT_FOUND');
    if (op.inputHash !== identity.inputHash || op.policyRevision !== identity.policyRevision || op.trustRevision !== identity.trustRevision || op.status !== 'unknown') throw new Error('APPROVAL_STALE');
    return op;
  }
  private idleProject(projectId: string) {
    if (this.isBusy(projectId) || this.store.listSessions(projectId).some(session => this.store.listRuns(session.id).some(run => !['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)))) throw new Error('RUN_ACTIVE');
  }
  async inspectRecovery(identity: RecoveryIdentity, requestId: string): Promise<{ item: RecoveryItem }> {
    const key = { method: 'recovery.inspect', clientRequestId: requestId, canonicalInputHash: canonicalHash(identity) };
    const replay = this.store.lookupAcceptedRequest(key); if (replay) return replay.response as { item: RecoveryItem };
    const op = this.recoveryOperation(identity); if (op.kind !== 'write') throw new Error('NOT_FOUND');
    this.idleProject(op.projectId); this.maintenance.add(op.projectId);
    try {
      await this.allowedPath(op.runId, journalInput.parse(op.input).path, new AbortController().signal);
      const observation = await this.journal.observeRecovery(op.id);
      return this.store.acceptRequest(key, () => {
        const live = this.recoveryOperation(identity);
        const updated = this.store.updateOperation(op.id, { status: observation === 'applied' ? 'completed' : 'unknown', result: { ...storedResult(live), recovery: { ...recovery(live), observation, inspectedAt: new Date().toISOString() } } });
        return { entityId: op.id, response: { item: this.recoveryItem(updated) } };
      }).response;
    } finally { this.maintenance.delete(op.projectId); }
  }
  acknowledgeRecovery(identity: RecoveryIdentity, requestId: string): { item: RecoveryItem } {
    const key = { method: 'recovery.acknowledge', clientRequestId: requestId, canonicalInputHash: canonicalHash(identity) };
    const replay = this.store.lookupAcceptedRequest(key); if (replay) return replay.response as { item: RecoveryItem };
    const op = this.recoveryOperation(identity); this.idleProject(op.projectId);
    return this.store.acceptRequest(key, () => {
      const updated = this.store.updateOperation(op.id, { result: { ...storedResult(op), recovery: { ...recovery(op), acknowledgedAt: recovery(op).acknowledgedAt ?? new Date().toISOString() } } });
      return { entityId: op.id, response: { item: this.recoveryItem(updated) } };
    }).response;
  }
  async readChange(projectId: string, changeId: string) {
    const op = this.store.getOperation(changeId);
    if (!op || op.projectId !== projectId || op.kind !== 'write' || !['completed', 'unknown'].includes(op.status)) throw new Error('NOT_FOUND');
    const input = journalInput.parse(op.input); const change = this.change(op);
    try {
      const before = input.beforeHash ? await this.journal.readSnapshot(input.beforeHash) : null;
      const after = input.afterHash ? await this.journal.readSnapshot(input.afterHash) : null;
      const diff = `--- ${input.path}\n+++ ${input.path}\n${before === null ? '' : before.split('\n').map(line => `-${line}`).join('\n')}\n${after === null ? '' : after.split('\n').map(line => `+${line}`).join('\n')}`;
      return { change, before, after, diff, truncated: false };
    } catch { return { change: { ...change, snapshotAvailable: false }, before: null, after: null, diff: '', truncated: true }; }
  }
  async undo(projectId: string, changeId: string, expectedAfterHash: string | null, requestId: string) {
    const key = { method: 'changes.undo', clientRequestId: requestId, canonicalInputHash: canonicalHash({ projectId, changeId, expectedAfterHash }) };
    const replay = this.store.lookupAcceptedRequest(key);
    if (replay) return { change: this.change(this.store.getOperation(changeId)!), operationId: replay.entityId };
    const original = this.store.getOperation(changeId); if (!original || original.projectId !== projectId) throw new Error('NOT_FOUND');
    if (this.store.getRun(original.runId)?.mode === 'research') throw new Error('UNDO_UNAVAILABLE');
    if (this.maintenance.has(projectId)) throw new Error('RUN_ACTIVE');
    this.maintenance.add(projectId);
    try {
      await this.allowedPath(original.runId, journalInput.parse(original.input).path, new AbortController().signal);
      const op = await this.journal.prepareUndo(changeId, expectedAfterHash, undefined, prepared => {
        this.store.acceptRequest(key, () => { this.store.putOperation(prepared); return { entityId: prepared.id, response: { operationId: prepared.id } }; });
      });
      await this.journal.apply(op.id, bound(op));
      const change = this.change(original); this.event(original.runId, 'change.recorded', { change });
      return { change, operationId: op.id };
    } finally { this.maintenance.delete(projectId); }
  }
}
