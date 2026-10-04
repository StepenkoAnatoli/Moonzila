import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { UtilityProcess } from 'electron';
import Database from 'better-sqlite3';
import provenance from './fixtures/research-kit/provenance.json';
import { ResearchKit } from '../src/adapters/research-kit/adapter';
import type { OwnedCommand, OwnedOptions, OwnedResult, OwnedRunner } from '../src/tools/commands';
import { Store } from '../src/engine/store';
import { Application } from '../src/engine/application';
import { createControl, ReviewToolPort } from '../src/engine/control-dispatch';
import { ControlSchema, ToEngineSchema, engineFailureCode, type Control } from '../src/engine/control';
import { ResearchRecoverySchema } from '../src/engine/research';
import { Engine } from '../src/main/engine';
import { ReviewSupervisor } from '../src/main/review';
import { listReviewFolders, readPackage } from '../src/main/review-workspace';
import type { Completion, InferenceMessage } from '../src/main/inference';
import type { Operation, Request, Research, Run, RunEvent, ToolSpec } from '../src/shared';

/**
 * The four end-to-end research-review scenarios of docs/specification/research-review.md ("Tests"), with the REAL engine
 * side (B2: Store, ResearchJobs, Application, Operations with real approvals, the control dispatch and the research.tool
 * port) and the REAL main side (B3: the Engine host's message routing, ReviewSupervisor, ResearchKit with the pinned kit)
 * wired together in-process. The engine utility process is emulated by a port double that does what src/engine/index.ts
 * does, with every message structured-cloned and delivered in order on a later turn. Only the native helper (a runner that
 * takes the locks, runs beforeStart, then the child with node) and the model provider (a scripted model issuing tool calls)
 * are substituted.
 */
let root: string; let nodeSha256: string; let fixtureBytes: Buffer; let fixtureSha: string;
const fixture = resolve('tests/fixtures/research-kit/collected.zip');
const kitRoot = resolve('.build/research-kit-external/research-kit');
const at = '2026-10-04T00:00:00.000Z';
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const ORIGINAL_FINDING = 'The free plan allows 10 requests per minute and includes 1,000 credits.';
const REVIEWED_FINDING = 'The free tier caps this design at 10 requests per minute; the 1,000 included credits are about 25 quick runs.';
const JOB = 'j1';
const PROFILE = 'm';

// ------------------------------------------------------------------ the native helper's stand-in

type Kind = 'preflight' | 'brief' | 'create' | 'validate';
const kindOf = (request: OwnedCommand): Kind => {
  const script = request.args[1] ?? '';
  if (script.endsWith('preflight.mjs')) return 'preflight';
  if (script.endsWith('brief.mjs')) return 'brief';
  return request.args[2] === 'create' ? 'create' : 'validate';
};
interface Hooks {
  /** Between the helper taking its read locks and calling beforeStart. */
  beforeCheck?(request: OwnedCommand, kind: Kind): Promise<void> | void;
  /** After the check passed, while the child "runs". */
  whileRunning?(request: OwnedCommand, kind: Kind, signal?: AbortSignal): Promise<void> | void;
}
interface Seen { request: OwnedCommand; options: OwnedOptions; kind: Kind }
/** What the helper does before CreateProcessW (locks, beforeStart, report the child), then the real kit with node. */
function runner(seen: Seen[], hooks: Hooks): OwnedRunner {
  return async (request, signal, options = {}) => {
    const kind = kindOf(request); seen.push({ request, options, kind });
    if (signal?.aborted) throw new Error('RUN_CANCELLED');
    await hooks.beforeCheck?.(request, kind);
    await options.beforeStart?.();
    options.onStarted?.({ pid: 4242, createdAt: '1' });
    await hooks.whileRunning?.(request, kind, signal);
    if (signal?.aborted) return { status: 'exited', code: 1, output: '', truncated: false, cancelled: true, timedOut: false };
    const held = await lockedState(options.readLocks ?? []);
    const result = await new Promise<OwnedResult>(done => execFile(request.executable, request.args, { cwd: request.cwd, env: request.env, timeout: request.timeoutMs, maxBuffer: request.maxOutputBytes, encoding: 'utf8', signal }, (error, stdout) => {
      const failure = error as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
      if (failure?.name === 'AbortError') { done({ status: 'exited', code: 1, output: stdout, truncated: false, cancelled: true, timedOut: false }); return; }
      if (failure?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') { done({ status: 'exited', code: 1, output: stdout, truncated: true, cancelled: false, timedOut: false }); return; }
      if (failure?.killed) { done({ status: 'exited', code: 1, output: stdout, truncated: false, cancelled: false, timedOut: true }); return; }
      done({ status: 'exited', code: failure ? (typeof failure.code === 'number' ? failure.code : 1) : 0, output: stdout, truncated: false, cancelled: false, timedOut: false });
    }));
    // The helper opens every read lock with FILE_SHARE_READ only, so on Windows the child cannot replace, rewrite or delete
    // a locked file: the kit's write fails and it exits 2 (lib/core.mjs writeFailure). Linux takes no lock, so the
    // runner refuses after the fact what Windows would have refused.
    return await lockedState(options.readLocks ?? []) === held ? result : { status: 'exited', code: 2, output: '', truncated: false, cancelled: false, timedOut: false };
  };
}
/** Identity of each read-locked file (inode, size, modification time): a write into any of them changes it. */
async function lockedState(locks: readonly string[]): Promise<string> {
  const parts: string[] = [];
  for (const file of locks) { const info = await lstat(file).catch(() => null); parts.push(info ? `${file}:${info.ino}:${info.size}:${info.mtimeMs}` : `${file}:absent`); }
  return parts.join('\n');
}

// ------------------------------------------------------------------ the engine utility process, in-process

/** The utility process handle main holds. Messages cross as structured clones, in order, on a later turn. */
class Child extends EventEmitter {
  /** As Electron's UtilityProcess: undefined once the process has exited. */
  pid: number | undefined = 4242; dead = false; private exited = false;
  receive: (message: unknown) => Promise<void> = async () => {};
  postMessage(message: unknown): void {
    // A crashed process takes nothing: posting to it ends it, as a dead port would.
    if (this.dead) { this.kill(); return; }
    const copy = structuredClone(message);
    setImmediate(() => { if (!this.dead) void this.receive(copy); });
  }
  kill(): boolean { if (!this.exited) { this.exited = true; this.dead = true; setImmediate(() => { this.pid = undefined; this.emit('exit', 0); }); } return true; }
}
/** One engine process: what src/engine/index.ts sets up over its parent port. */
interface EngineSide { store: Store; app: Application; epoch: string }
function engineProcess(sides: EngineSide[]) {
  return (_entry: string, args: string[]): UtilityProcess => {
    const [database, epoch] = args as [string, string];
    const child = new Child();
    const post = (message: object) => { const copy = structuredClone(message); setImmediate(() => { if (!child.dead) child.emit('message', copy); }); };
    const store = new Store(database, { engineEpoch: epoch });
    store.recoverInterrupted();
    const inferences = new Map<string, { resolve: (value: Completion) => void; reject: (reason: Error) => void; cleanup: () => void }>();
    const reviewTools = new ReviewToolPort(post, epoch);
    const app = new Application(store, {
      runReviewTool: (runId, name, input, signal) => reviewTools.run(runId, name, input, signal),
      publish: event => post({ type: 'event', epoch, event }),
      publishResearch: research => post({ type: 'research', epoch, research }),
      infer: (run, messages, signal, tools) => new Promise((resolve, reject) => {
        const id = randomUUID();
        const cancel = () => { inferences.delete(id); post({ type: 'inference.cancel', epoch, runId: run.id }); reject(new Error('RUN_CANCELLED')); };
        if (signal.aborted) { reject(new Error('RUN_CANCELLED')); return; }
        signal.addEventListener('abort', cancel, { once: true });
        inferences.set(id, { resolve, reject, cleanup: () => signal.removeEventListener('abort', cancel) });
        post({ type: 'inference', epoch, id, runId: run.id, messages, tools });
      }),
    }, { dataDirectory: dirname(database) });
    const control = createControl(store, app);
    child.receive = async raw => {
      const parsed = ToEngineSchema.safeParse(raw);
      if (!parsed.success || parsed.data.epoch !== epoch) return;
      const message = parsed.data;
      if (message.type === 'inference.result' || message.type === 'inference.error') {
        const waiter = inferences.get(message.id); if (!waiter) return;
        inferences.delete(message.id); waiter.cleanup();
        if (message.type === 'inference.result') waiter.resolve(message.result); else waiter.reject(new Error(message.code));
        return;
      }
      if (message.type === 'research.tool.result' || message.type === 'research.tool.error') { reviewTools.settle(message); return; }
      if (message.type !== 'request' && message.type !== 'control') return;
      try {
        const result = message.type === 'request' ? await app.handle(message.request) : await control(message.control);
        post({ type: 'reply', epoch, id: message.id, result });
      } catch (error) {
        post({ type: 'failure', epoch, id: message.id, code: engineFailureCode(error) });
      }
    };
    sides.push({ store, app, epoch });
    post({ type: 'ready', epoch });
    return child as unknown as UtilityProcess;
  };
}

// ------------------------------------------------------------------ main, as src/main/index.ts wires it

type Step = (messages: InferenceMessage[], tools: ToolSpec[] | undefined) => Completion | Promise<Completion>;
interface World {
  data: string; storage: string; workspace: string; project: string;
  engine: Engine; review: ReviewSupervisor; kit: ResearchKit; sides: EngineSide[]; child?: Child;
  seen: Seen[]; hooks: Hooks; script: Step[]; inferences: string[];
  /** Run events as main received them, in order. */
  events: RunEvent[]; notices: Research[];
  active: Map<string, AbortController>;
  /** The user's answer to an approval card; false leaves it waiting. */
  approve: (operation: Operation) => boolean;
  approved: Operation[];
  /** Main's event hook, called before the supervisor sees the event (tampering at an exact point). */
  onEvent?: (event: RunEvent) => void;
  /** A stand-in for an engine reply the engine does not give yet (see `withUnknownWrites`); never changes a reply it gives. */
  reply?: (control: Control, reply: unknown) => unknown;
  /** Every control the supervisor sends, each attempt included, in order. */
  sent: Control[];
}
const worlds: World[] = [];
const side = (world: World) => world.sides.at(-1)!;
const store = (world: World) => side(world).store;
const request = (method: string, params: unknown): Request => ({ protocolVersion: 1, clientRequestId: randomUUID(), method, params } as unknown as Request);

async function boot(data: string): Promise<World> {
  const storage = join(data, 'research-kit', 'storage');
  const seen: Seen[] = []; const hooks: Hooks = {};
  const kit = new ResearchKit({ kitRoot, nodePath: process.execPath, nodeSha256, storageRoot: storage, helperPath: resolve('.build/native/MoonAlizaHost.exe') }, runner(seen, hooks));
  await kit.sweep();
  const world = { data, storage, workspace: join(storage, 'review', JOB, 'project'), project: join(data, 'project-root'), seen, hooks, kit, sides: [], script: [], inferences: [], events: [], notices: [], active: new Map(), approve: () => true, approved: [], sent: [] } as unknown as World;
  const signalOf = (runId: string, epoch: string) => {
    const stop = world.active.get(runId);
    if (!stop || world.engine.epoch !== epoch || stop.signal.aborted) throw new Error('RUN_CANCELLED');
    return stop.signal;
  };
  world.review = new ReviewSupervisor({
    control: async control => { world.sent.push(control); const reply = await world.engine.control(control); return world.reply ? world.reply(control, reply) : reply; },
    kit, runSignal: signalOf, redact: async text => text, retryDelayMs: 10,
  });
  const fork = engineProcess(world.sides);
  world.engine = new Engine('engine.cjs', join(data, 'state.sqlite'), {
    event(event) {
      if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) { world.active.get(event.runId)?.abort(); world.active.delete(event.runId); }
      world.events.push(event);
      world.onEvent?.(event);
      world.review.runEvent(event);
      if (event.type === 'approval.required') {
        const operation = (event.payload as { operation: Operation }).operation;
        if (world.approve(operation)) {
          world.approved.push(operation);
          void world.engine.request(request('approval.decide', { operationId: operation.id, projectId: operation.projectId, inputHash: operation.inputHash, policyRevision: operation.policyRevision, trustRevision: operation.trustRevision, decision: 'allow' })).catch(() => {});
        }
      }
    },
    research(research) { world.notices.push(research); world.review.observe(research); },
    ready() { world.review.engineReady(); },
    async inference(runId, messages, epoch, tools) {
      // As main's inference: only for a run whose capability main holds in this epoch.
      const signal = signalOf(runId, epoch);
      world.inferences.push(runId);
      const step = world.script.shift();
      if (!step) return new Promise<Completion>((_resolve, reject) => { if (signal.aborted) reject(new Error('RUN_CANCELLED')); signal.addEventListener('abort', () => reject(new Error('RUN_CANCELLED')), { once: true }); });
      return step(messages, tools);
    },
    cancel(runId) { world.active.get(runId)?.abort(); },
    restarted() { for (const stop of world.active.values()) stop.abort(); world.active.clear(); },
    readGitHub: async () => { throw new Error('GITHUB_UNAVAILABLE'); },
    prepareCommand: async () => { throw new Error('COMMAND_UNAVAILABLE'); },
    executeCommand: async () => { throw new Error('COMMAND_UNAVAILABLE'); },
    inspectGit: async () => { throw new Error('GIT_UNAVAILABLE'); },
    reviewTool: (runId, name, input, epoch) => world.review.reviewTool(runId, name, input, epoch),
  }, (entry, args) => { const child = fork(entry, args) as unknown as Child; world.child = child; return child as unknown as UtilityProcess; });
  world.engine.start();
  worlds.push(world);
  return world;
}
/** research.recover once per start, as the collector's wrapped control does in index.ts. */
async function recover(world: World) {
  const reviewFolders = await listReviewFolders(join(world.storage, 'review'));
  const reply = ResearchRecoverySchema.parse(await world.engine.control(ControlSchema.parse({ method: 'research.recover', owned: world.review.ownedIds(), reviewFolders })));
  await world.review.recovered(reply);
  return reply;
}
/** research.review.start as index.ts serves it: the supervisor starts, then main installs the run capability. */
async function startReview(world: World): Promise<{ research: Research; run: Run }> {
  const { research, run } = await world.review.start(JOB, PROFILE);
  if (!world.active.has(run.id) && ['queued', 'running'].includes(run.status)) world.active.set(run.id, new AbortController());
  return { research, run };
}
/** Quit without any orderly step: main's children stop, the engine process is gone, its database connection abandoned. */
async function crash(world: World) {
  await world.review.close(); await world.kit.close();
  world.child!.dead = true;
  await world.engine.close();
}

/**
 * The engine's half of breaker F1 (research.review.context listing `unknown` review writes, with their status) belongs to
 * another unit. Until it lands, this stands in for it in the one test that needs it: when the engine's context lists no
 * unknown write but the journal holds one, the changes are listed again from the journal, completed and unknown, in
 * creation order. Once the engine lists them itself, its reply passes unchanged.
 */
function withUnknownWrites(world: World) {
  return (control: Control, reply: unknown): unknown => {
    if (control.method !== 'research.review.context') return reply;
    const context = reply as { changes: Array<{ status?: string }> };
    if (context.changes.some(change => change.status === 'unknown')) return reply;
    const db = store(world);
    const edges = db.researchEvents(JOB, 0, 1000).events.filter(event => event.to === 'reviewing');
    const fresh = edges.filter(event => (event.detail as { workspace?: string }).workspace === 'fresh').at(-1);
    if (!fresh) return reply;
    const writes = edges.filter(event => event.revision >= fresh.revision).flatMap(event => db.listOperations((event.detail as { reviewRunId: string }).reviewRunId))
      .filter(op => op.kind === 'write' && (op.status === 'completed' || op.status === 'unknown'))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    if (!writes.some(op => op.status === 'unknown')) return reply;
    return { ...context, changes: writes.map(op => {
      const input = op.input as { path: string; beforeHash: string | null; afterHash: string | null };
      return { operationId: op.id, runId: op.runId, path: input.path, beforeHash: input.beforeHash, afterHash: input.afterHash, status: op.status };
    }) };
  };
}

/** Task 4's part: the project, the profile and a job collected with the fixture package, retained under its binding. */
async function collected(world: World) {
  const db = store(world);
  await mkdir(world.project, { recursive: true });
  db.putProject({ id: 'p', name: 'p', rootPath: world.project, pathLabel: 'p', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'public-technical' }, missing: false, createdAt: at });
  db.putProfile({ id: PROFILE, name: 'Local', kind: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'test', contextTokens: 131072, outputTokens: 512, locality: 'local', revision: 1, revisionId: 'pv', createdAt: at, updatedAt: at });
  db.createResearch({ id: JOB, projectId: 'p', topic: 'Fixture topic', inputs: { queries: [], urls: [], preferDomains: [], depth: 'quick', maxPages: 8 }, clientRef: provenance.identity.clientRef, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
  const step = (to: 'dispatching' | 'collecting' | 'collected', patch: object) => db.transitionResearch({ researchId: JOB, expectedRevision: db.getResearch(JOB)!.revision, to, actor: 'main', cause: 'TEST_STEP', patch });
  step('dispatching', { target: { collectorRevision: 1, repository: provenance.identity.repository, workflow: 'collect.yml', ref: provenance.identity.ref } });
  step('collecting', { workflowRunId: '1' });
  const imported = await world.kit.validate(fixture, { projectId: 'p', projectRevision: 1, jobId: JOB, jobRevision: 3, ...provenance.identity });
  expect(imported).toMatchObject({ status: 'PASS', state: 'REVIEW_IN_PROGRESS' });
  step('collected', { verification: { artifactSha256: fixtureSha, artifactBytes: fixtureBytes.length, validatorRevision: imported.receipt!.validatorRevision, nodeSha256, state: 'REVIEW_IN_PROGRESS', jobRevision: 3, projectRevision: 1,
    repository: provenance.identity.repository, ref: provenance.identity.ref, workflow: provenance.identity.workflow, commit: provenance.identity.commit, runAttempt: 1, workflowRunId: '1', clientRef: provenance.identity.clientRef, downloadDigest: 'unverified' } });
}

// ------------------------------------------------------------------ the scripted model

const call = (name: string, input: Record<string, unknown> = {}): Completion => ({ content: '', outcome: 'tool_calls', toolCalls: [{ id: `call-${randomUUID()}`, name, input: input as never }] });
const answer = (content = 'Review done.'): Completion => ({ content, outcome: 'complete' });
const lastResult = (messages: InferenceMessage[]) => JSON.parse(messages.at(-1)!.content) as Record<string, unknown>;
/** A step that first checks the previous tool result was an applied edit. */
const afterApplied = (path: string, next: Step): Step => (messages, tools) => { expect(lastResult(messages)).toMatchObject({ applied: true, path }); return next(messages, tools); };
/** The agent's judgements on the drafted brief: both TODO sections answered and the reviewer declared. CRLF-tolerant. */
function answered(brief: string): string {
  const eol = brief.includes('\r\n') ? '\r\n' : '\n';
  const answerSection = (text: string, heading: string, body: string) => {
    const marker = `## ${heading}${eol}`; const start = text.indexOf(marker); expect(start, heading).toBeGreaterThan(-1);
    const from = start + marker.length; const end = text.indexOf(`${eol}## `, from); expect(end, heading).toBeGreaterThan(-1);
    return `${text.slice(0, from)}${eol}${body}${eol}${text.slice(end)}`;
  };
  let text = answerSection(brief, 'Contradictions and how they were resolved', 'None. One source, and nothing else in the corpus speaks to the same limit.');
  text = answerSection(text, 'Decision', 'Build against a 10-request-per-minute ceiling first. Out of scope: paid tiers.');
  const declared = text.replace(/^Reviewed by: _agent.*$/m, 'Reviewed by: agent');
  expect(declared).not.toBe(text);
  return declared;
}
const rewriteFinding: Step = () => call('edit_file', { path: 'research/EVIDENCE.md', search: ORIGINAL_FINDING, replacement: REVIEWED_FINDING });
const reopenUnknown: Step = () => call('edit_file', { path: 'research/DISCOVERY.md', search: '| CLOSED |', replacement: '| OPEN |' });
/** The kit's draft (approved as an edit), then the agent's answered brief written over it. `drafts` keeps the kit's text. */
function draftAndAnswer(world: World, drafts: string[]): Step[] {
  return [
    () => call('research_draft_brief'),
    afterApplied('research/BRIEF.md', () => {
      // The scripted model reads the approved draft; what it writes next is its own judgement over the kit's text.
      const drafted = readFileSync(join(world.workspace, 'research', 'BRIEF.md'), 'utf8'); drafts.push(drafted);
      return call('write_file', { path: 'research/BRIEF.md', content: answered(drafted) });
    }),
  ];
}

// ------------------------------------------------------------------ waiting and reading

async function until<T>(check: () => T | undefined | false | Promise<T | undefined | false>, label: string, ms = 90000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await check(); if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
const settled = (world: World) => until(() => { const job = store(world).getResearch(JOB)!; return ['approved', 'not_ready', 'cancelled'].includes(job.status) && job; }, 'the job to settle');
/** The supervisor finished: no driver left (packaging's clean-up runs after its commit). */
const idle = (world: World) => until(() => !world.review.busy(), 'the supervisor to go idle');
const runEvents = (world: World, runId: string) => store(world).events(runId, 0, 1000).events as unknown as RunEvent[];
const statuses = (events: RunEvent[]) => events.filter(event => event.type === 'research.status').map(event => (event.payload as { status: string }).status);
const journal = (world: World) => store(world).researchEvents(JOB, 0, 1000).events.map(event => [event.from, event.to, event.actor, event.cause]);
/** The binding a reviewed package is bound to: the job's verified identity at its packaging revision. */
const bindingAt = (jobRevision: number) => ({ projectId: 'p', projectRevision: 1, jobId: JOB, jobRevision, ...provenance.identity });
/** The tool message the engine saved for the model (a large one reaches the model through compacted excerpts). */
const savedTool = (world: World, sessionId: string, toolName: string) => store(world).listMessages(sessionId).filter(message => message.role === 'tool' && message.toolName === toolName).map(message => JSON.parse(message.content) as Record<string, unknown>);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'moonzila-review-e2e-'));
  nodeSha256 = digest(await readFile(process.execPath)); fixtureBytes = await readFile(fixture); fixtureSha = digest(fixtureBytes);
});
afterEach(async () => {
  for (const world of worlds.splice(0)) {
    await world.review.close().catch(() => {}); await world.kit.close().catch(() => {});
    await Promise.race([world.engine.close(), new Promise(r => setTimeout(r, 6000))]).catch(() => {});
    for (const { app, store: db } of world.sides) {
      await Promise.race([app.shutdown(), new Promise(r => setTimeout(r, 200))]).catch(() => {});
      try { db.close(); } catch { /* already closed by its shutdown control */ }
    }
  }
});
afterAll(async () => {
  if (root) { const rel = relative(resolve(tmpdir()), root); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); }
});
let count = 0;
async function world(): Promise<World> {
  const data = join(root, `w${++count}`); await mkdir(data);
  const w = await boot(data); await recover(w); await collected(w); return w;
}

// ------------------------------------------------------------------ 1. passing review

test('1. passing review: rewrite, draft (approved), answer, end; the kit approves, approved is recorded and streamed to the run', async () => {
  // Guard: rootFor(run) resolving a review run's files in its workspace (mutation: resolve review writes against the project root).
  const w = await world();
  const drafts: string[] = [];
  const [draft, write] = draftAndAnswer(w, drafts);
  w.script.push(rewriteFinding, afterApplied('research/EVIDENCE.md', draft!), write!, afterApplied('research/BRIEF.md', () => call('research_preflight')), () => answer());
  const { research, run } = await startReview(w);
  expect(research).toMatchObject({ status: 'reviewing', reviewRunId: run.id });
  const job = await settled(w);
  expect(job).toMatchObject({ status: 'approved' });
  // The reviewed digest is new, and its retained bytes validate as research-ready under the packaging revision's binding.
  expect(job.reviewedPackageSha256).toMatch(/^[0-9a-f]{64}$/); expect(job.reviewedPackageSha256).not.toBe(fixtureSha);
  const retained = join(w.storage, 'artifacts', `${job.reviewedPackageSha256}.zip`);
  expect(await w.kit.validate(retained, bindingAt(job.reviewedBoundRevision!))).toMatchObject({ status: 'PASS', state: 'APPROVED_BRIEF', researchReady: true });
  // The kit's draft carried the rewritten Finding; the package holds exactly the brief the user approved.
  expect(drafts).toHaveLength(1); expect(drafts[0]).toContain(REVIEWED_FINDING); expect(drafts[0]).not.toContain(ORIGINAL_FINDING);
  const answeredWrite = store(w).getOperation(w.approved.at(-1)!.id)!;
  const packaged = new Map((await readPackage(await readFile(retained))).base.map(entry => [entry.path, entry.sha256]));
  expect((answeredWrite.input as { path: string }).path).toBe('research/BRIEF.md');
  expect(packaged.get('research/BRIEF.md')).toBe((answeredWrite.input as { afterHash: string }).afterHash);
  // The agent's preflight over the answered brief: passing, and no hygiene/brief-stale.
  const [verdict] = savedTool(w, run.sessionId, 'research_preflight');
  expect(verdict).toMatchObject({ pass: true });
  expect((verdict!.findings as Array<{ check: string; rule: string }>).filter(f => f.rule === 'brief-stale')).toEqual([]);
  // Every edit went through an exact approval: rewrite, draft, answer.
  expect(store(w).listOperations(run.id).filter(op => op.kind === 'write').map(op => [op.status, (op.input as { path: string }).path])).toEqual([['completed', 'research/EVIDENCE.md'], ['completed', 'research/BRIEF.md'], ['completed', 'research/BRIEF.md']]);
  expect(journal(w).slice(-3)).toEqual([['collected', 'reviewing', 'user', 'REVIEW_STARTED'], ['reviewing', 'packaging', 'main', 'WORKSPACE_FROZEN'], ['packaging', 'approved', 'main', 'KIT_APPROVED']]);
  // On the run: research.status reviewing -> packaging -> approved, and the answered run completed.
  const events = runEvents(w, run.id);
  expect(statuses(events)).toEqual(['reviewing', 'packaging', 'approved']);
  expect(events.map(e => e.type).slice(-3)).toEqual(['research.status', 'run.completed', 'research.status']);
  expect(store(w).getRun(run.id)!.status).toBe('completed');
  // Main saw the same stream (the run capability is released), and the review folder is gone.
  expect(w.events.filter(e => e.runId === run.id).map(e => e.type)).toContain('run.completed');
  await idle(w);
  expect(w.active.has(run.id)).toBe(false);
  expect(await readdir(join(w.storage, 'review'))).toEqual([]);
}, 180000);

// ------------------------------------------------------------------ 2. failing gate

test('2a. failing gate: an approved edit sets U-1 OPEN; create packages PREFLIGHT_BLOCKED and the job is not_ready / REVIEW_GATE_FAILED', async () => {
  // Guard: approved only for a research-ready receipt (mutation: record approved for any validated package).
  const w = await world();
  const drafts: string[] = [];
  w.script.push(rewriteFinding, afterApplied('research/EVIDENCE.md', reopenUnknown));
  const [draft, write] = draftAndAnswer(w, drafts);
  w.script.push(afterApplied('research/DISCOVERY.md', draft!), write!, afterApplied('research/BRIEF.md', () => answer()));
  const { run } = await startReview(w);
  const job = await settled(w);
  expect(job).toMatchObject({ status: 'not_ready', failure: 'REVIEW_GATE_FAILED' });
  expect(job.reviewedPackageSha256).toMatch(/^[0-9a-f]{64}$/); expect(job.reviewedPackageSha256).not.toBe(fixtureSha);
  expect(journal(w).slice(-2)).toEqual([['reviewing', 'packaging', 'main', 'WORKSPACE_FROZEN'], ['packaging', 'not_ready', 'main', 'KIT_NOT_APPROVED']]);
  expect(journal(w).some(([, to]) => to === 'approved')).toBe(false);
  // create exited 0 and its package validates, as PREFLIGHT_BLOCKED: exit 0 is never readiness.
  expect(await w.kit.validate(join(w.storage, 'artifacts', `${job.reviewedPackageSha256}.zip`), bindingAt(job.reviewedBoundRevision!))).toMatchObject({ status: 'PASS', state: 'PREFLIGHT_BLOCKED', researchReady: false });
  expect(w.seen.filter(s => s.kind === 'create')).toHaveLength(1);
  const failed = runEvents(w, run.id).find(e => e.type === 'run.failed')!;
  expect(failed.payload).toMatchObject({ error: { code: 'REVIEW_NOT_READY' } });
  expect(statuses(runEvents(w, run.id))).toEqual(['reviewing', 'packaging', 'not_ready']);
  expect(store(w).getRun(run.id)!.status).toBe('failed');
}, 180000);

test('2b. failing gate, second case: the review ends without rewriting the Finding; the job is not_ready / REVIEW_INCOMPLETE', async () => {
  // Guard: approved only for a research-ready receipt (mutation: record approved for any validated package).
  const w = await world();
  const drafts: string[] = [];
  w.script.push(...draftAndAnswer(w, drafts), afterApplied('research/BRIEF.md', () => answer()));
  const { run } = await startReview(w);
  const job = await settled(w);
  expect(job).toMatchObject({ status: 'not_ready', failure: 'REVIEW_INCOMPLETE' });
  expect(journal(w).at(-1)).toEqual(['packaging', 'not_ready', 'main', 'KIT_NOT_APPROVED']);
  expect(drafts[0]).toContain(ORIGINAL_FINDING);
  expect(await w.kit.validate(join(w.storage, 'artifacts', `${job.reviewedPackageSha256}.zip`), bindingAt(job.reviewedBoundRevision!))).toMatchObject({ status: 'PASS', state: 'REVIEW_IN_PROGRESS', researchReady: false });
  expect(runEvents(w, run.id).find(e => e.type === 'run.failed')!.payload).toMatchObject({ error: { code: 'REVIEW_NOT_READY' } });
}, 180000);

// ------------------------------------------------------------------ 3. tampering between review and packaging

/** A full, approvable review whose run ends with a final answer. */
function approvable(w: World) {
  const drafts: string[] = [];
  const [draft, write] = draftAndAnswer(w, drafts);
  w.script.push(rewriteFinding, afterApplied('research/EVIDENCE.md', draft!), write!, afterApplied('research/BRIEF.md', () => answer()));
}
const forgedApproved = (w: World) => {
  const job = store(w).getResearch(JOB)!;
  return () => store(w).transitionResearch({ researchId: JOB, expectedRevision: job.revision, to: 'approved', actor: 'main', cause: 'KIT_APPROVED',
    patch: { reviewedPackage: { sha256: job.reviewedPackageSha256 ?? 'e'.repeat(64), validatorRevision: job.reviewedValidatorRevision ?? provenance.validatorRevision, boundRevision: job.revision } } });
};

/** A second connection writes approved straight into the database; returns what the store raised, if anything. */
function forgeApproved(database: string): unknown {
  const db = new Database(database);
  try {
    const job = db.prepare("SELECT revision, status FROM research WHERE id = ?").get(JOB) as { revision: number; status: string };
    expect(job.status).toBe('packaging');
    db.transaction(() => {
      db.prepare("INSERT INTO research_events (research_id, revision, from_status, to_status, actor, cause, detail, engine_epoch, at) VALUES (?, ?, 'packaging', 'approved', 'main', 'FORGED_APPROVAL', '{}', 'forger', ?)").run(JOB, job.revision + 1, Date.now());
      db.prepare("UPDATE research SET status = 'approved', revision = ?, reviewed_package_sha256 = ?, reviewed_validator_revision = ?, reviewed_bound_revision = ? WHERE id = ?").run(job.revision + 1, 'f'.repeat(64), provenance.validatorRevision, job.revision, JOB);
    })();
    return undefined;
  } catch (error) { return error; } finally { db.close(); }
}

test('3a. a byte of EVIDENCE.md changed on disk after the final answer is refused by the freeze: no kit child, never approved', async () => {
  // Guard: the freeze's inventory check, the workspace equal to fold(base, review changes) (mutation: freeze without it).
  const w = await world();
  approvable(w);
  let answeredAt = -1;
  w.onEvent = event => {
    if (event.type === 'run.status' && (event.payload as { status: string }).status === 'awaiting_review') {
      answeredAt = w.seen.length;
      const file = join(w.workspace, 'research', 'EVIDENCE.md');
      writeFileSync(file, readFileSync(file, 'utf8') + ' ');
    }
  };
  const { run } = await startReview(w);
  const job = await settled(w);
  expect(answeredAt).toBeGreaterThan(-1);
  expect(job).toMatchObject({ status: 'not_ready', failure: 'REVIEW_WORKSPACE_CHANGED' });
  expect(journal(w).at(-1)).toEqual(['reviewing', 'not_ready', 'main', 'INVENTORY_MISMATCH']);
  // Refused before any kit child of the freeze: no preflight over a tree that is not the reviewed one, and no create.
  // (The freeze's only child is the re-validation of the retained collected package, which reads no workspace file.)
  expect(w.seen.slice(answeredAt).map(s => s.kind)).toEqual(['validate']);
  expect(store(w).getRun(run.id)!.status).toBe('failed');
  expect(forgedApproved(w)).toThrow();
  expect(store(w).getResearch(JOB)!.status).toBe('not_ready');
}, 180000);

test('3b. a change made inside the runner\'s beforeStart window, before the rehash, refuses create: no create child runs', async () => {
  // Guard: create's beforeStart rehash of the frozen workspace (mutation: drop the rehash).
  const w = await world();
  approvable(w);
  let started = 0;
  w.hooks.beforeCheck = async (_request, kind) => { if (kind === 'create') await writeFile(join(w.workspace, 'research', 'MAP.md'), (await readFile(join(w.workspace, 'research', 'MAP.md'), 'utf8')) + '\n'); };
  w.hooks.whileRunning = (_request, kind) => { if (kind === 'create') started++; };
  await startReview(w);
  const job = await settled(w);
  expect(job).toMatchObject({ status: 'not_ready', failure: 'REVIEW_WORKSPACE_CHANGED' });
  expect(journal(w).slice(-2)).toEqual([['reviewing', 'packaging', 'main', 'WORKSPACE_FROZEN'], ['packaging', 'not_ready', 'main', 'INVENTORY_MISMATCH']]);
  expect(w.seen.filter(s => s.kind === 'create')).toHaveLength(1);
  expect(started).toBe(0);
  expect(job.reviewedPackageSha256).toBeUndefined();
  expect(forgedApproved(w)).toThrow();
}, 180000);

test('3c. a file added under research/ while create runs is caught by inventory equality: REVIEW_PACKAGE_MISMATCH; a forged approved is refused', async () => {
  // Guard: packaging's inventory equality of the produced package with the frozen tree (mutation: skip the comparison).
  const w = await world();
  approvable(w);
  let forged: unknown;
  w.hooks.whileRunning = async (_request, kind) => {
    if (kind !== 'create') return;
    // While the job really is packaging: a direct write of approved, journaled but without main's KIT_APPROVED row.
    forged = forgeApproved(join(w.data, 'state.sqlite'));
    await writeFile(join(w.workspace, 'research', 'NOTES.md'), 'added while create ran\n');
  };
  const { run } = await startReview(w);
  const job = await settled(w);
  expect(job).toMatchObject({ status: 'not_ready', failure: 'REVIEW_PACKAGE_MISMATCH' });
  expect(journal(w).at(-1)).toEqual(['packaging', 'not_ready', 'main', 'INVENTORY_MISMATCH']);
  // The produced package did carry the added file, and is otherwise valid: only the inventory check stood between it and approval.
  expect(job.reviewedPackageSha256).toMatch(/^[0-9a-f]{64}$/);
  const produced = await readPackage(await readFile(join(w.storage, 'artifacts', `${job.reviewedPackageSha256}.zip`)));
  expect(produced.base.map(entry => entry.path)).toContain('research/NOTES.md');
  expect(store(w).getRun(run.id)!.status).toBe('failed');
  // The store's readiness rule refused the forged approved (packaging, digest frozen, journaled, but not main's
  // KIT_APPROVED row with the package digest), and refuses an approved step from not_ready.
  expect(forged).toBeInstanceOf(Error); expect((forged as Error).message).toBe('RESEARCH_READINESS_UNVERIFIED');
  expect(forgedApproved(w)).toThrow('RESEARCH_');
  expect(store(w).getResearch(JOB)!.status).toBe('not_ready');
}, 180000);

// ------------------------------------------------------------------ 4. restart mid-review

test('4a. restart with a write awaiting approval: not_ready / REVIEW_INTERRUPTED, the write failed; the retry continues with the kept edit and is approved', async () => {
  // Guard: the retry's workspace verification, continued only when the tree equals the fold (mutation: always rebuild fresh).
  const first = await world();
  first.script.push(rewriteFinding, afterApplied('research/EVIDENCE.md', reopenUnknown));
  first.approve = operation => first.approved.length === 0 || operation.kind !== 'write';
  const { run } = await startReview(first);
  // The DISCOVERY edit is prepared and waits for the user; the app then dies.
  const pending = await until(async () => {
    const list = (await first.engine.request(request('approval.list', { runId: run.id })) as { operations: Operation[] }).operations;
    // The second operation: the rewrite's own card can still be listed while its auto-approval is in flight.
    return list.length === 1 && first.approved.length === 1 && list[0]!.id !== first.approved[0]!.id && list[0];
  }, 'the second approval');
  expect(store(first).getOperation(first.approved[0]!.id)!.status).toBe('completed');
  expect(first.approved).toHaveLength(1);
  const rewrite = first.approved[0]!;
  await crash(first);

  const second = await boot(first.data);
  const recovery = await recover(second);
  expect(recovery.reviewing).toEqual([JOB]);
  expect(store(second).getResearch(JOB)).toMatchObject({ status: 'not_ready', failure: 'REVIEW_INTERRUPTED' });
  expect(store(second).getOperation(pending.id)!.status).toBe('failed');
  expect(store(second).getOperation(rewrite.id)!.status).toBe('completed');
  expect(store(second).getRun(run.id)!.status).toBe('interrupted');
  expect(statuses(runEvents(second, run.id))).toEqual(['reviewing', 'not_ready']);
  // The kept workspace still holds the applied rewrite and not the declined-by-crash edit.
  expect(await readFile(join(second.workspace, 'research', 'EVIDENCE.md'), 'utf8')).toContain(REVIEWED_FINDING);
  expect(await readFile(join(second.workspace, 'research', 'DISCOVERY.md'), 'utf8')).toContain('| CLOSED |');

  const drafts: string[] = [];
  second.script.push(...draftAndAnswer(second, drafts), afterApplied('research/BRIEF.md', () => answer()));
  const retry = await startReview(second);
  expect(retry.run.id).not.toBe(run.id); expect(retry.run.sessionId).toBe(run.sessionId);
  expect(journal(second).find(([from, to]) => from === 'not_ready' && to === 'reviewing')).toEqual(['not_ready', 'reviewing', 'user', 'REVIEW_RETRY']);
  expect(store(second).researchEvents(JOB, 0, 1000).events.at(-1)!.detail).toMatchObject({ workspace: 'continued', reviewRunId: retry.run.id });
  const job = await settled(second);
  expect(job).toMatchObject({ status: 'approved' });
  expect(drafts[0]).toContain(REVIEWED_FINDING);
  expect(await second.kit.validate(join(second.storage, 'artifacts', `${job.reviewedPackageSha256}.zip`), bindingAt(job.reviewedBoundRevision!))).toMatchObject({ status: 'PASS', state: 'APPROVED_BRIEF', researchReady: true });
  expect(store(second).getRun(retry.run.id)!.status).toBe('completed');
}, 240000);

test('4b. restart during packaging: the answered run is kept, packaging re-runs from the stored digest and is approved', async () => {
  // Guard: recoverInterrupted keeps the awaiting_review run that a packaging job names (mutation: interrupt it like any run).
  const first = await world();
  approvable(first);
  let running!: () => void; const started = new Promise<void>(r => { running = r; });
  first.hooks.whileRunning = async (_request, kind, signal) => {
    if (kind !== 'create') return;
    running();
    await new Promise<void>(r => { if (signal?.aborted) r(); else signal?.addEventListener('abort', () => r(), { once: true }); });
  };
  const { run } = await startReview(first);
  await started;
  const frozen = store(first).getResearch(JOB)!;
  expect(frozen).toMatchObject({ status: 'packaging' });
  expect(frozen.reviewDigest).toMatch(/^[0-9a-f]{64}$/);
  await crash(first);
  // Quit stopped the create child; the job is still packaging, recorded nothing more.
  expect(store(first).getResearch(JOB)).toMatchObject({ status: 'packaging', revision: frozen.revision });

  const second = await boot(first.data);
  expect(store(second).getRun(run.id)!.status).toBe('awaiting_review');
  const recovery = await recover(second);
  expect(recovery.packaging).toEqual([JOB]);
  const job = await settled(second);
  expect(job).toMatchObject({ status: 'approved', reviewDigest: frozen.reviewDigest });
  expect(journal(second).slice(-2)).toEqual([['reviewing', 'packaging', 'main', 'WORKSPACE_FROZEN'], ['packaging', 'approved', 'main', 'KIT_APPROVED']]);
  expect(second.seen.filter(s => s.kind === 'create')).toHaveLength(1);
  expect(await second.kit.validate(join(second.storage, 'artifacts', `${job.reviewedPackageSha256}.zip`), bindingAt(job.reviewedBoundRevision!))).toMatchObject({ status: 'PASS', state: 'APPROVED_BRIEF', researchReady: true });
  const events = runEvents(second, run.id);
  expect(statuses(events)).toEqual(['reviewing', 'packaging', 'approved']);
  expect(events.map(e => e.type)).not.toContain('run.interrupted');
  expect(store(second).getRun(run.id)!.status).toBe('completed');
  await idle(second);
  expect(await readdir(join(second.storage, 'review'))).toEqual([]);
}, 240000);

test('4c. a crash between an approved edit\'s rename and its record keeps the edit: the retry continues, begin reconciles it, and it is approved', async () => {
  // Guard: the retry's continued check accepts, for a path with an unknown write, its before or its after hash (breaker F1,
  // probe P1; mutation: verify the kept workspace against the completed fold only).
  const first = await world();
  first.script.push(rewriteFinding);
  const { store: db, app } = side(first); const record = db.updateOperation.bind(db);
  let crashedOn: string | undefined; let stopped: Promise<void> | undefined;
  db.updateOperation = ((id: string, patch: { status?: string }) => {
    // The process dies right after the edit's rename, before its completed record: that record, and the journal's own
    // fallback for it, never reach the database; the run in flight stops where it is, and no message reaches main.
    if (id === crashedOn || (crashedOn === undefined && patch.status === 'completed' && db.getOperation(id)?.kind === 'write')) {
      if (crashedOn === undefined) { crashedOn = id; first.child!.dead = true; stopped = app.shutdown(); }
      throw new Error('ENGINE_CRASHED');
    }
    return record(id, patch as never);
  }) as typeof db.updateOperation;
  const { run } = await startReview(first);
  const rewrite = await until(() => crashedOn, 'the rewrite to be renamed');
  await stopped;
  expect(await readFile(join(first.workspace, 'research', 'EVIDENCE.md'), 'utf8')).toContain(REVIEWED_FINDING);
  expect(db.getOperation(rewrite)!.status).toBe('started');
  await crash(first);

  const second = await boot(first.data);
  second.reply = withUnknownWrites(second);
  const recovery = await recover(second);
  expect(recovery.reviewing).toEqual([JOB]);
  expect(store(second).getResearch(JOB)).toMatchObject({ status: 'not_ready', failure: 'REVIEW_INTERRUPTED' });
  expect(store(second).getOperation(rewrite)!.status).toBe('unknown');
  expect(store(second).getRun(run.id)!.status).toBe('interrupted');

  const drafts: string[] = [];
  second.script.push(...draftAndAnswer(second, drafts), afterApplied('research/BRIEF.md', () => answer()));
  const retry = await startReview(second);
  // The kept workspace was accepted: continued, and begin reconciled the unknown write against it as applied.
  expect(store(second).researchEvents(JOB, 0, 1000).events.find(event => event.detail && (event.detail as { reviewRunId?: string }).reviewRunId === retry.run.id)!.detail).toMatchObject({ workspace: 'continued' });
  expect(store(second).getOperation(rewrite)!.status).toBe('completed');
  const job = await settled(second);
  expect(job).toMatchObject({ status: 'approved' });
  expect(drafts[0]).toContain(REVIEWED_FINDING);
  const packaged = new Map((await readPackage(await readFile(join(second.storage, 'artifacts', `${job.reviewedPackageSha256}.zip`)))).base.map(entry => [entry.path, entry.sha256]));
  expect(packaged.get('research/EVIDENCE.md')).toBe((store(second).getOperation(rewrite)!.input as { afterHash: string }).afterHash);
}, 240000);

test('4d. the engine dies after committing research.review.begin, before its reply: the retry replays that request, and main ends the interrupted review', async () => {
  // Guards (breaker F2, probe P10): begin keeps one request id across its retries; a job left reviewing under an
  // interrupted run is ended not_ready / REVIEW_INTERRUPTED by main, not left until the next app start. The collector's
  // research.recover is not called here: while the start is in flight it carries this job as owned and skips it.
  const w = await world(); approvable(w);
  const child = w.child!; const receive = child.receive;
  child.receive = async message => {
    await receive(message);
    const sent = message as { type?: string; control?: { method?: string } };
    // The accepted begin's reply is posted on a later turn; the process dies first, so it never reaches main.
    if (sent.type === 'control' && sent.control?.method === 'research.review.begin') child.kill();
  };
  const outcome = await w.review.start(JOB, PROFILE).then(reply => reply.run.id, (error: Error) => error.message);
  const begins = w.sent.filter(control => control.method === 'research.review.begin') as Array<{ requestId: string }>;
  expect(begins.length).toBeGreaterThanOrEqual(2);
  expect(new Set(begins.map(control => control.requestId)).size).toBe(1);
  // The replayed reply names the run the first begin created, which the new engine interrupted at its start.
  const job = await settled(w);
  expect(outcome).toBe(job.reviewRunId);
  expect(job).toMatchObject({ status: 'not_ready', failure: 'REVIEW_INTERRUPTED' });
  expect(journal(w).slice(-2)).toEqual([['collected', 'reviewing', 'user', 'REVIEW_STARTED'], ['reviewing', 'not_ready', 'main', 'RECOVERED']]);
  expect(store(w).listRuns(job.reviewSessionId!).map(run => run.status)).toEqual(['interrupted']);
  await idle(w);
  // And the job is reviewable again: the retry continues and is approved.
  await startReview(w);
  expect(await settled(w)).toMatchObject({ status: 'approved' });
}, 240000);

// ------------------------------------------------------------------ 5. kit children after the job left its state

/** Every kit child of the freeze and of packaging, in order, after the run's final answer: [kind, nth of that kind]. */
const FREEZE_AND_PACKAGING: Array<[Kind, number, string]> = [
  ['validate', 1, 'the freeze re-validating the collected package'], ['preflight', 1, 'the freeze preflight'],
  ['validate', 2, 'packaging re-validating the collected package'], ['create', 1, 'create'], ['validate', 3, 'validation of the reviewed package'],
];
type Leave = 'cancel' | 'stop' | 'revoke';
const LEFT: Record<Leave, { status: string; failure?: string }> = { cancel: { status: 'cancelled' }, stop: { status: 'not_ready', failure: 'REVIEW_STOPPED' }, revoke: { status: 'not_ready', failure: 'PROJECT_UNTRUSTED' } };
for (const leave of ['cancel', 'stop', 'revoke'] as const) {
  for (const [kind, nth, label] of FREEZE_AND_PACKAGING) {
    test(`5. ${leave} just before ${label} starts: that child and every later one is refused in the guarded start (invariant 3)`, async () => {
      // Guards: each freeze and packaging child re-reads the job (status, revision, admission) and the hold inside its
      // guarded start (INV3a, INV3b); a step's children share one abort signal that a notice, a hold or quit aborts.
      const w = await world(); approvable(w);
      let answered = false; let seen = 0; let acted = false; const after: Kind[] = [];
      w.onEvent = event => { if (event.type === 'run.status' && (event.payload as { status: string }).status === 'awaiting_review') answered = true; };
      w.hooks.beforeCheck = async (_request, k) => {
        if (!answered || k !== kind || ++seen !== nth || acted) return;
        const job = store(w).getResearch(JOB)!;
        if (leave === 'cancel') w.review.observe((await w.engine.request(request('research.cancel', { researchId: JOB })) as { research: Research }).research);
        else if (leave === 'stop') await w.engine.request(request('run.cancel', { runId: job.reviewRunId! }));
        else {
          // As index.ts: the hold is taken before the engine applies the change and released after it.
          const release = w.review.hold('p');
          try { await w.engine.request(request('project.revokeTrust', { projectId: 'p' })); } finally { release(); }
        }
        acted = true;
      };
      w.hooks.whileRunning = (_request, k) => { if (acted) after.push(k); };
      await startReview(w);
      const job = await until(() => { const now = store(w).getResearch(JOB)!; return acted && ['approved', 'not_ready', 'cancelled'].includes(now.status) && now; }, 'the job to leave');
      await idle(w);
      expect(job).toMatchObject(LEFT[leave]);
      expect(after).toEqual([]);
      expect(journal(w).some(([, to]) => to === 'approved')).toBe(false);
      if (leave !== 'cancel') expect(store(w).getResearch(JOB)!.status).toBe(LEFT[leave].status);
    }, 180000);
  }
}

// The same moves recorded by the engine with their notice still on its way to main: nothing has aborted the step, so only
// the re-read inside the guarded start stands between the moved job and the child.
type Unnoticed = 'stop' | 'revoke';
for (const leave of ['stop', 'revoke'] as const satisfies readonly Unnoticed[]) {
  for (const [kind, nth, label] of FREEZE_AND_PACKAGING) {
    test(`5. ${leave}, its notice not yet in main, just before ${label} starts: the guarded start's re-read refuses it`, async () => {
      // Guard: the job re-read (status, revision, admission) inside each freeze and packaging child's guarded start.
      const w = await world(); approvable(w);
      let answered = false; let seen = 0; let acted = false; const after: Kind[] = [];
      w.onEvent = event => { if (event.type === 'run.status' && (event.payload as { status: string }).status === 'awaiting_review') answered = true; };
      w.hooks.beforeCheck = (_request, k) => {
        if (!answered || k !== kind || ++seen !== nth || acted) return;
        const db = store(w); const job = db.getResearch(JOB)!;
        if (leave === 'stop') {
          db.appendEvent(job.reviewRunId!, 'run.cancelled', {}, { status: 'cancelled', finishedAt: new Date().toISOString() });
          db.transitionResearch({ researchId: JOB, expectedRevision: job.revision, to: 'not_ready', actor: 'engine', cause: 'REVIEW_STOPPED', patch: { failure: 'REVIEW_STOPPED' } });
        } else {
          const project = db.getProject('p')!;
          db.putProject({ ...project, trusted: false, trustRevision: project.trustRevision + 1 });
        }
        acted = true;
      };
      w.hooks.whileRunning = (_request, k) => { if (acted) after.push(k); };
      await startReview(w);
      const job = await until(() => { const now = store(w).getResearch(JOB)!; return acted && ['approved', 'not_ready', 'cancelled'].includes(now.status) && now; }, 'the job to leave');
      await idle(w);
      expect(job).toMatchObject(LEFT[leave]);
      expect(after).toEqual([]);
      expect(journal(w).some(([, to]) => to === 'approved')).toBe(false);
    }, 180000);
  }
}

for (const [kind, nth, label] of FREEZE_AND_PACKAGING.filter(([k]) => k === 'validate')) {
  test(`5. quit while ${label} runs stops that child; the job is left for recovery`, async () => {
    // Guard: verifyRetained and validate take the step's abort signal, which quit aborts (invariant 3).
    const w = await world(); approvable(w);
    let answered = false; let seen = 0; let running!: () => void; const reached = new Promise<void>(r => { running = r; });
    let stopped: boolean | undefined;
    w.onEvent = event => { if (event.type === 'run.status' && (event.payload as { status: string }).status === 'awaiting_review') answered = true; };
    w.hooks.whileRunning = async (_request, k, signal) => {
      if (!answered || k !== kind || ++seen !== nth) return;
      running();
      // The child runs until it is stopped, or 20 s pass.
      stopped = await new Promise<boolean>(r => { const timer = setTimeout(() => r(false), 20000); if (signal?.aborted) { clearTimeout(timer); r(true); } else signal?.addEventListener('abort', () => { clearTimeout(timer); r(true); }, { once: true }); });
    };
    await startReview(w);
    await reached;
    const before = store(w).getResearch(JOB)!;
    await w.review.close();
    expect(stopped).toBe(true);
    expect(w.review.busy()).toBe(false);
    expect(store(w).getResearch(JOB)).toMatchObject({ status: before.status, revision: before.revision });
  }, 180000);
}
