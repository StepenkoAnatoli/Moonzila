import { githubRepositories } from '../shared/github';
import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import type { Application } from './application';
import type { Control } from './control';
import type { ReviewToolResult } from './review-contract';

/**
 * The engine's control dispatch, extracted from the process entry (src/engine/index.ts) so it can be exercised without a
 * parent port. Behaviour is the entry's own: index.ts parses each control message with ControlSchema and calls this.
 */
export function createControl(store: Store, app: Application): (command: Control) => Promise<unknown> {
  return async command => {
    switch (command.method) {
      case 'project.register': return store.acceptRequest({ method: command.projectId ? 'project.relink' : 'project.trust', clientRequestId: command.requestId, canonicalInputHash: command.inputHash }, () => {
        const previous = command.projectId ? store.getProject(command.projectId) : store.listProjects().find(p => p.rootPath.toLowerCase() === command.rootPath.toLowerCase());
        if (command.projectId && !previous) throw new Error('PROJECT_NOT_FOUND');
        const project = { id: previous?.id ?? randomUUID(), name: command.name, rootPath: command.rootPath, pathLabel: command.rootPath, trusted: true, trustRevision: (previous?.trustRevision ?? 0) + 1, policy: previous?.policy ?? { revision: 1, inference: 'local-only' as const, research: 'off' as const }, missing: false, createdAt: previous?.createdAt ?? new Date().toISOString() };
        store.putProject(project); return { entityId: project.id, response: { project: app.publicProject(project.id) } };
      }).response;
      case 'profile.save': return store.acceptRequest({ method: 'profile.save', clientRequestId: command.requestId, canonicalInputHash: command.inputHash }, () => {
        store.putProfile(command.profile); return { entityId: command.profile.id, response: { profile: app.publicProfile(command.profile.id) } };
      }).response;
      case 'profile.get': return store.getProfile(command.profileId) ?? null;
      case 'profile.revision': return store.getProfileRevision(command.revisionId) ?? null;
      case 'run.context': {
        const run = store.getRun(command.runId); if (!run) throw new Error('RUN_NOT_FOUND');
        return { run, repositories: githubRepositories(store.listMessages(run.sessionId, { latest: true }).filter(message => message.role === 'user').map(message => message.content)), session: store.getSession(run.sessionId), project: run.projectId === null ? null : app.publicProject(run.projectId), profile: store.getProfileRevision(run.profileRevisionId) };
      }
      case 'command.context': {
        const run = store.getRun(command.runId); if (!run) throw new Error('RUN_NOT_FOUND');
        if (run.projectId === null) throw new Error('PROJECT_REQUIRED');
        if (store.getSession(run.sessionId)?.policy.revision !== run.sessionPolicyRevision) throw new Error('RUN_CANCELLED');
        const project = store.getProject(run.projectId); if (!project) throw new Error('PROJECT_NOT_FOUND');
        const op = command.operationId ? store.getOperation(command.operationId) : undefined;
        if (op && op.runId !== run.id) throw new Error('APPROVAL_STALE');
        const storedApproval = op ? store.listApprovals(op.id)[0] : undefined;
        const approval = storedApproval ? { operationId: storedApproval.operationId, projectId: storedApproval.projectId, inputHash: storedApproval.inputHash, policyRevision: storedApproval.policyRevision, trustRevision: storedApproval.trustRevision, decision: storedApproval.decision } : undefined;
        return { run, project, ...(op ? { operation: { id: op.id, runId: op.runId, projectId: op.projectId, kind: op.kind, status: op.status, inputHash: op.inputHash, trustRevision: op.trustRevision, policyRevision: op.policyRevision, input: op.input } } : {}), ...(approval ? { approval } : {}) };
      }
      case 'research.context': return app.research.context(command.researchId);
      case 'research.transition': return app.research.transition(command);
      case 'research.recover': return app.research.recover(command.owned, command.reviewFolders ?? []);
      case 'research.review.context': return app.research.reviewContext(command.researchId);
      case 'research.review.begin': return app.beginReview({ requestId: command.requestId, researchId: command.researchId, profileId: command.profileId, workspace: command.workspace });
      // Main's policy route (research-review-ui spec section 4): one read each, never a run list or history.
      case 'policy.guard': return store.policyGuard(command.projectId) ?? null;
      // Main's purge (docs/specification/research-purge.md): every job's retained digests, one read, inside main's storage lock.
      case 'research.retained': return store.researchRetained();
      case 'session.project': { const session = store.getSession(command.sessionId); return session ? { projectId: session.projectId } : null; }
      case 'vault.references': return store.listSecretRefs();
      case 'request.lookup': return store.lookupAcceptedRequest({ method: command.requestMethod, clientRequestId: command.requestId, canonicalInputHash: command.inputHash }) ?? null;
      case 'shutdown': await app.shutdown(); store.close(); return { closed: true };
    }
  };
}

/**
 * Port messages `research.tool` and their replies. Like commands, a kit tool waits for main's terminal reply even after
 * Stop (Stop only asks main to cancel), so a review run cannot end while main's kit child is still live.
 */
export class ReviewToolPort {
  private readonly waiting = new Map<string, { resolve: (result: ReviewToolResult) => void; reject: (error: Error) => void; cleanup: () => void }>();
  constructor(private readonly post: (message: object) => void, private readonly epoch: string) {}
  run(runId: string, name: 'research_preflight' | 'research_draft_brief', input: { force?: true }, signal: AbortSignal): Promise<ReviewToolResult> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Error('RUN_CANCELLED')); return; }
      const id = randomUUID();
      const cancel = () => this.post({ type: 'inference.cancel', epoch: this.epoch, runId });
      signal.addEventListener('abort', cancel, { once: true });
      this.waiting.set(id, { resolve, reject, cleanup: () => signal.removeEventListener('abort', cancel) });
      this.post({ type: 'research.tool', epoch: this.epoch, id, runId, name, input });
    });
  }
  /** Settle a waiter from main's reply; false when no waiter has that id. */
  settle(message: { id: string; type: 'research.tool.result'; result: ReviewToolResult } | { id: string; type: 'research.tool.error'; code: string }): boolean {
    const waiter = this.waiting.get(message.id); if (!waiter) return false;
    this.waiting.delete(message.id); waiter.cleanup();
    if (message.type === 'research.tool.result') waiter.resolve(message.result); else waiter.reject(new Error(message.code));
    return true;
  }
}
