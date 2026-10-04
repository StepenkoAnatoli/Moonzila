import { githubRepositories } from '../shared/github';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { Store } from './store';
import { Application } from './application';
import { ToEngineSchema, engineFailureCode, type Control } from './control';
import type { Completion } from '../main/inference';
import { CommandInputSchema, type CommandPlan } from '../shared/commands';
import type { OwnedResult } from '../tools/commands';

const [databasePath, epoch] = process.argv.slice(2);
if (!databasePath || !epoch || !process.parentPort) throw new Error('Engine requires its main-process parent');
const port = process.parentPort;
const store = new Store(databasePath, { engineEpoch: epoch });
store.recoverInterrupted();
const pending = new Map<string, { resolve: (value: Completion) => void; reject: (reason: Error) => void; cleanup: () => void }>();
const commands = new Map<string, { resolve: (value: CommandPlan | OwnedResult) => void; reject: (reason: Error) => void; cleanup: () => void }>();
function command<T extends CommandPlan | OwnedResult>(runId: string, payload: object, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('RUN_CANCELLED')); return; }
    const id = randomUUID();
    // Wait for the host's terminal acknowledgement even after Stop, so run cancellation
    // cannot release the project while its command is still executing.
    const cancel = () => port.postMessage({ type: 'inference.cancel', epoch, runId });
    signal.addEventListener('abort', cancel, { once: true });
    commands.set(id, { resolve: result => resolve(result as T), reject, cleanup: () => signal.removeEventListener('abort', cancel) });
    port.postMessage({ ...payload, epoch, id, runId });
  });
}
const github = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void; cleanup: () => void }>();
const app = new Application(store, {
  readGitHub: (runId, input, signal) => new Promise((resolve, reject) => {
    const id = randomUUID();
    const cancel = () => { github.delete(id); port.postMessage({ type: 'inference.cancel', epoch, runId }); reject(new Error('RUN_CANCELLED')); };
    if (signal.aborted) { reject(new Error('RUN_CANCELLED')); return; }
    signal.addEventListener('abort', cancel, { once: true });
    github.set(id, { resolve, reject, cleanup: () => signal.removeEventListener('abort', cancel) });
    port.postMessage({ type: 'github.read', epoch, id, runId, input });
  }),
  inspectGit: (runId, name, input, signal) => command<OwnedResult>(runId, { type: 'git.inspect', name, input }, signal),
  prepareCommand: (runId, input, signal) => command<CommandPlan>(runId, { type: 'command.prepare', input: CommandInputSchema.parse(input) }, signal),
  executeCommand: (runId, operationId, signal) => command<OwnedResult>(runId, { type: 'command.execute', operationId }, signal),
  publish: event => port.postMessage({ type: 'event', epoch, event }),
  publishResearch: research => port.postMessage({ type: 'research', epoch, research }),
  infer: (run, messages, signal, tools) => new Promise((resolve, reject) => {
    const id = randomUUID();
    const cancel = () => { pending.delete(id); port.postMessage({ type: 'inference.cancel', epoch, runId: run.id }); reject(new Error('RUN_CANCELLED')); };
    if (signal.aborted) { reject(new Error('RUN_CANCELLED')); return; }
    signal.addEventListener('abort', cancel, { once: true });
    pending.set(id, { resolve, reject, cleanup: () => signal.removeEventListener('abort', cancel) });
    port.postMessage({ type: 'inference', epoch, id, runId: run.id, messages, tools });
  }),
}, { dataDirectory: dirname(databasePath) });

async function control(command: Control): Promise<unknown> {
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
    case 'research.recover': return app.research.recover(command.owned);
    // Task 5 contracts are frozen; the engine side lands with schema v4 and the review run.
    case 'research.review.begin': case 'research.review.context': throw new Error('NOT_IMPLEMENTED');
    case 'vault.references': return store.listSecretRefs();
    case 'request.lookup': return store.lookupAcceptedRequest({ method: command.requestMethod, clientRequestId: command.requestId, canonicalInputHash: command.inputHash }) ?? null;
    case 'shutdown': await app.shutdown(); store.close(); return { closed: true };
  }
}

port.on('message', async event => {
  const parsed = ToEngineSchema.safeParse(event.data);
  if (!parsed.success || parsed.data.epoch !== epoch) return;
  const message = parsed.data;
  if (message.type === 'github.result' || message.type === 'github.error') {
    const waiter = github.get(message.id); if (!waiter) return; github.delete(message.id); waiter.cleanup();
    if (message.type === 'github.result') waiter.resolve(message.result); else waiter.reject(new Error(message.code));
    return;
  }
  if (message.type === 'command.prepared' || message.type === 'command.result' || message.type === 'command.error') {
    const waiter = commands.get(message.id); if (!waiter) return;
    commands.delete(message.id); waiter.cleanup();
    if (message.type === 'command.error') waiter.reject(new Error(message.code)); else waiter.resolve(message.result);
    return;
  }
  if (message.type === 'inference.result' || message.type === 'inference.error') {
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id); waiter.cleanup();
    if (message.type === 'inference.result') waiter.resolve(message.result); else waiter.reject(new Error(message.code));
    return;
  }
  // Kit tool replies have no waiter until the review run lands (Task 5); none can arrive before it asks.
  if (message.type === 'research.tool.result' || message.type === 'research.tool.error') return;
  try {
    const result = message.type === 'request' ? await app.handle(message.request) : await control(message.control);
    port.postMessage({ type: 'reply', epoch, id: message.id, result });
  } catch (error) {
    port.postMessage({ type: 'failure', epoch, id: message.id, code: engineFailureCode(error) });
  }
});
port.postMessage({ type: 'ready', epoch });
