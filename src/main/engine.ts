import { GitHubErrorCodeSchema, type GitHubInput } from '../shared/github';
import { randomUUID } from 'node:crypto';
import { utilityProcess, type UtilityProcess } from 'electron';
import { FromEngineSchema, ToEngineSchema, type Control } from '../engine/control';
import type { Request, Research, RunEvent, ToolSpec } from '../shared';
import { inferenceErrorCode, type Completion, type InferenceMessage } from './inference';
import type { CommandInput, CommandPlan } from '../shared/commands';
import type { OwnedResult } from '../tools/commands';

interface EngineHooks {
  readGitHub(runId: string, input: GitHubInput, epoch: string): Promise<string>;
  event(event: RunEvent): void;
  research?(research: Research): void;
  inference(runId: string, messages: InferenceMessage[], epoch: string, tools?: ToolSpec[]): Promise<Completion>;
  cancel(runId: string): void;
  restarted(epoch: string): void;
  /** Each engine child that reports ready, the first included; `epoch` is that child's. */
  ready?(epoch: string): void;
  prepareCommand(runId: string, input: CommandInput, epoch: string): Promise<CommandPlan>;
  executeCommand(runId: string, operationId: string, epoch: string): Promise<OwnedResult>;
  inspectGit(runId: string, name: string, input: unknown, epoch: string): Promise<OwnedResult>;
}
export class Engine {
  epoch = randomUUID();
  private child?: UtilityProcess;
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private stopping = false;
  private attempts = 0;
  private ready: Promise<void> = Promise.resolve();
  constructor(private readonly entry: string, private readonly database: string, private readonly hooks: EngineHooks) {}
  start(): void {
    this.epoch = randomUUID(); const epoch = this.epoch;
    this.hooks.restarted(epoch);
    const env: NodeJS.ProcessEnv = {};
    for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'USERPROFILE', 'LOCALAPPDATA']) if (process.env[name]) env[name] = process.env[name];
    const child = utilityProcess.fork(this.entry, [this.database, epoch], { env, stdio: 'ignore', serviceName: 'Monnzila engine' });
    this.child = child;
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('ENGINE_UNAVAILABLE')); child.kill(); }, 20_000);
      child.on('message', raw => {
        const result = FromEngineSchema.safeParse(raw);
        if (!result.success || result.data.epoch !== this.epoch || child !== this.child) return;
        const message = result.data;
        if (message.type === 'ready') { clearTimeout(timeout); resolve(); this.hooks.ready?.(epoch); }
        else if (message.type === 'reply' || message.type === 'failure') {
          const pending = this.pending.get(message.id); if (!pending) return;
          clearTimeout(pending.timer); this.pending.delete(message.id);
          if (message.type === 'reply') pending.resolve(message.result); else pending.reject(new Error(message.code));
        } else if (message.type === 'event') this.hooks.event(message.event);
        else if (message.type === 'research') this.hooks.research?.(message.research);
        else if (message.type === 'github.read') {
          void this.hooks.readGitHub(message.runId, message.input, epoch).then(result => {
            if (this.epoch === epoch) child.postMessage(ToEngineSchema.parse({ type: 'github.result', epoch, id: message.id, result }));
          }).catch(error => {
            const parsed = GitHubErrorCodeSchema.safeParse(error instanceof Error ? error.message : '');
            if (this.epoch === epoch) child.postMessage({ type: 'github.error', epoch, id: message.id, code: parsed.success ? parsed.data : 'GITHUB_UNAVAILABLE' });
          });
        }
        else if (message.type === 'inference.cancel') this.hooks.cancel(message.runId);
        else if (message.type === 'command.prepare' || message.type === 'command.execute' || message.type === 'git.inspect') {
          const task = message.type === 'command.prepare' ? this.hooks.prepareCommand(message.runId, message.input, epoch) : message.type === 'git.inspect' ? this.hooks.inspectGit(message.runId, message.name, message.input, epoch) : this.hooks.executeCommand(message.runId, message.operationId, epoch);
          void task.then(result => {
            if (this.epoch === epoch) child.postMessage(ToEngineSchema.parse({ type: message.type === 'command.prepare' ? 'command.prepared' : 'command.result', epoch, id: message.id, result }));
          }).catch(error => {
            const reason = error instanceof Error ? error.message : '';
            const code = ['RUN_CANCELLED', 'COMMAND_UNAVAILABLE', 'COMMAND_CHANGED', 'APPROVAL_STALE', 'GIT_UNAVAILABLE', 'GIT_UNSAFE_REPOSITORY', 'GIT_INSPECTION_LIMIT'].includes(reason) ? reason : 'COMMAND_UNKNOWN';
            if (this.epoch === epoch) child.postMessage({ type: 'command.error', epoch, id: message.id, code });
          });
        }
        else if (message.type === 'inference') {
          void this.hooks.inference(message.runId, message.messages, epoch, message.tools).then(result => {
            if (this.epoch === epoch) child.postMessage(ToEngineSchema.parse({ type: 'inference.result', epoch, id: message.id, result }));
          }).catch(error => { if (this.epoch === epoch) child.postMessage({ type: 'inference.error', epoch, id: message.id, code: inferenceErrorCode(error) }); });
        }
      });
      child.once('exit', () => {
        clearTimeout(timeout); reject(new Error('ENGINE_UNAVAILABLE'));
        if (child !== this.child) return;
        this.hooks.restarted(epoch); // Revoke running host effects immediately, including the final failed restart.
        for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('ENGINE_UNAVAILABLE')); }
        this.pending.clear();
        if (!this.stopping && this.attempts++ < 3) setTimeout(() => this.start(), 500 * this.attempts);
      });
    });
    void this.ready.catch(() => {});
  }
  private async send(payload: { type: 'request'; request: Request } | { type: 'control'; control: Control }): Promise<unknown> {
    const epoch = this.epoch; await this.ready;
    if (epoch !== this.epoch || !this.child?.pid) throw new Error('ENGINE_UNAVAILABLE');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('ENGINE_UNAVAILABLE')); }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.postMessage({ ...payload, epoch, id });
    });
  }
  request(request: Request): Promise<unknown> { return this.send({ type: 'request', request }); }
  control(control: Control): Promise<unknown> { return this.send({ type: 'control', control }); }
  async close(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    const timer = setTimeout(() => child?.kill(), 5000);
    try { await this.control({ method: 'shutdown' }); } catch { /* The journal will recover on restart. */ }
    finally { clearTimeout(timer); child?.kill(); }
  }
}
