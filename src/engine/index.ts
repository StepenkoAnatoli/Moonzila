import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { Store } from './store';
import { Application } from './application';
import { ToEngineSchema, engineFailureCode } from './control';
import { createControl, ReviewToolPort } from './control-dispatch';
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
const reviewTools = new ReviewToolPort(message => port.postMessage(message), epoch);
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
  runReviewTool: (runId, name, input, signal) => reviewTools.run(runId, name, input, signal),
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

const control = createControl(store, app);

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
  if (message.type === 'research.tool.result' || message.type === 'research.tool.error') { reviewTools.settle(message); return; }
  try {
    const result = message.type === 'request' ? await app.handle(message.request) : await control(message.control);
    port.postMessage({ type: 'reply', epoch, id: message.id, result });
  } catch (error) {
    port.postMessage({ type: 'failure', epoch, id: message.id, code: engineFailureCode(error) });
  }
});
port.postMessage({ type: 'ready', epoch });
