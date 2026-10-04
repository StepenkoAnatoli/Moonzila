import { afterEach, expect, test } from 'vitest';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import goldenFile from './fixtures/research-kit/collector-golden/goldens.json';
import { Store } from '../src/engine/store';
import { ResearchJobs, researchDto } from '../src/engine/research';
import { ControlSchema, engineFailureCode, type Control } from '../src/engine/control';
import { Vault } from '../src/main/vault';
import { CollectorSupervisor, type ImportOutcome, type PackageHandoff } from '../src/main/collector';
import { packageFileName } from '../src/adapters/research-kit/collector';
import type { CollectorConfig } from '../src/main/collector-settings';
import type { OwnedResult } from '../src/tools/commands';

const TOKEN = 'github_pat_test-only-supervisor-0123456789';
const at = '2026-10-03T00:00:00.000Z';
const goldens = new Map(goldenFile.goldens.map(g => [g.name, g]));
const roots: string[] = []; const closers: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of closers.splice(0)) await close().catch(() => {}); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

type Kind = 'dispatch' | 'watch';
interface Call { kind: Kind; args: string[]; env: Record<string, string>; out: string; signal: AbortSignal; admissionTimeoutMs: number }
type Script = (call: Call) => Promise<OwnedResult>;
/** The real kit's recorded output for a scenario, with the fixture clientRef swapped for the job's. */
function replay(name: string, clientRef?: string, signal?: AbortSignal): OwnedResult {
  const golden = goldens.get(name)!; const output = clientRef ? golden.output.replaceAll('moonaliza-fixture', clientRef) : golden.output;
  return { status: 'exited', code: golden.exitCode, output, truncated: false, cancelled: signal?.aborted ?? false, timedOut: false };
}
const gate = () => { let open!: () => void; const promise = new Promise<void>(resolve => { open = resolve; }); return { promise, open }; };

async function harness(script: Script, options: { fault?(control: Control): Promise<void> | void; root?: string; now?(): number; noToken?: boolean; epoch?(): string; importPackage?(handoff: PackageHandoff): Promise<ImportOutcome> } = {}) {
  const root = options.root ?? await mkdtemp(join(tmpdir(), 'monnzila-supervisor-')); if (!options.root) roots.push(root);
  const store = new Store(join(root, 'state.sqlite')); closers.push(async () => store.close());
  const notices: unknown[] = []; const jobs = new ResearchJobs(store, research => notices.push(research));
  if (!store.getProject('p')) store.putProject({ id: 'p', name: 'p', rootPath: 'C:\\work\\p', pathLabel: 'p', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'public-technical' }, missing: false, createdAt: at });
  const key = randomBytes(32);
  const vault = new Vault(join(root, 'vault-' + randomUUID()), {
    isEncryptionAvailable: () => true,
    encryptString(value: string) { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv); const d = Buffer.concat([c.update(value, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]); },
    decryptString(value: Buffer) { const d = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); d.setAuthTag(value.subarray(12, 28)); return Buffer.concat([d.update(value.subarray(28)), d.final()]).toString('utf8'); },
  });
  await vault.initialize('epoch-1');
  const secretRef = options.noToken ? null : await vault.saveStaged(TOKEN); if (secretRef) await vault.commit(secretRef);
  const config: CollectorConfig = { revision: 1, repository: 'o/r', workflow: 'collect.yml', ref: 'main', secretRef };
  const controls: Control[] = [];
  const control = async (raw: Control) => {
    const command = ControlSchema.parse(JSON.parse(JSON.stringify(raw))); controls.push(command);
    await options.fault?.(command);
    try {
      const result = command.method === 'research.context' ? jobs.context(command.researchId)
        : command.method === 'research.transition' ? jobs.transition(command)
          : command.method === 'research.recover' ? jobs.recover(command.owned) : undefined;
      return JSON.parse(JSON.stringify(result));
    } catch (error) { throw new Error(engineFailureCode(error), { cause: error }); }
  };
  const calls: Call[] = []; let prepared = 0;
  const kit = {
    async prepareCollector() {
      prepared++;
      const folder = await mkdtemp(join(root, 'collect-')); const out = join(folder, 'out'); const temp = join(folder, 'temp');
      await mkdir(out); await mkdir(temp);
      return {
        node: process.execPath, script: resolve('/kit/bin/collect-remote.mjs'), out, temp,
        start: async (args: readonly string[], env: Record<string, string>, o: { signal: AbortSignal; admissionTimeoutMs: number; admit(): Promise<void>; onStarted(id: { pid: number; createdAt: string }): void }) => {
          const call: Call = { kind: args.includes('--no-wait') ? 'dispatch' : 'watch', args: [...args], env, out, signal: o.signal, admissionTimeoutMs: o.admissionTimeoutMs };
          calls.push(call);
          await o.admit();
          o.onStarted({ pid: 1, createdAt: '1' });
          return script(call);
        },
        dispose: () => rm(folder, { recursive: true, force: true }),
      };
    },
  };
  const handoffs: PackageHandoff[] = [];
  const supervisor = new CollectorSupervisor({
    control, epoch: options.epoch ?? (() => 'epoch-1'), vault, settings: { current: () => config }, kit, spoolDirectory: join(root, 'runs'),
    importPackage: async handoff => { handoffs.push(handoff); return options.importPackage ? options.importPackage(handoff) : { kind: 'deferred' }; },
    limits: { backoffFirstMs: 5, stillRunningDelayMs: 5, quitDrainMs: 50 }, retryDelayMs: 10, ...(options.now ? { now: options.now } : {}),
  });
  closers.unshift(() => supervisor.close(50));
  const create = (id = randomUUID()) => {
    const { research } = store.createResearch({ id, projectId: 'p', topic: 'Ollama context limits', inputs: { queries: ['ollama num_ctx'], urls: [], preferDomains: [], depth: 'quick', maxPages: 3 }, clientRef: `mz-${randomUUID().replaceAll('-', '')}`, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
    return research;
  };
  return { root, store, jobs, vault, supervisor, controls, calls, handoffs, notices, create, config, prepared: () => prepared };
}
async function until(check: () => boolean | Promise<boolean>, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!(await check())) { if (Date.now() > end) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 10)); }
}
/** The normal kit: a successful dispatch, then a watch that delivers the job's package. */
const happy: Script = async call => {
  if (call.kind === 'dispatch') return replay('dispatch-ok');
  const clientRef = call.args.find(a => a.startsWith('--client-ref='))!.slice('--client-ref='.length);
  await copyFile(resolve('tests/fixtures/research-kit/collected.zip'), join(call.out, packageFileName(clientRef)));
  return replay('watch-collected', clientRef);
};

test('attach with nothing to do recovers once and launches nothing', async () => {
  const h = await harness(happy);
  await h.supervisor.attach();
  expect(h.controls).toEqual([{ method: 'research.recover', owned: [] }]);
  expect(h.prepared()).toBe(0);
});

test('a queued job is dispatched once, watched, and handed to import with the engine\'s run id; the token stays in the child env', async () => {
  const h = await harness(happy);
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.handoffs.length === 1);
  const stored = h.store.getResearch(job.id)!;
  expect(stored).toMatchObject({ status: 'collecting', workflowRunId: '1', repository: 'o/r' });
  expect(h.calls.map(c => c.kind)).toEqual(['dispatch', 'watch']);
  expect(Object.keys(h.calls[0]!.env).sort()).toEqual(['HOME', 'RESEARCH_KIT_GITHUB_TOKEN', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', ...(process.env.SystemRoot ? ['SystemRoot'] : [])].sort());
  expect(h.calls[0]!.env.RESEARCH_KIT_GITHUB_TOKEN).toBe(TOKEN);
  expect(h.calls[1]!.args).toContain('--run-id=1');
  // The whole pre-start step is bounded by admissionMs (60 s), for a dispatch and for a watch alike.
  expect(h.calls.map(c => c.admissionTimeoutMs)).toEqual([60_000, 60_000]);
  expect(h.handoffs[0]).toMatchObject({ researchId: job.id, workflowRunId: '1', kit: { status: 'PASS', state: 'REVIEW_IN_PROGRESS' } });
  expect(h.handoffs[0]!.file.endsWith(packageFileName(job.clientRef))).toBe(true);
  expect(JSON.stringify(h.controls)).not.toContain(TOKEN);
  expect(JSON.stringify(h.notices)).not.toContain(TOKEN);
  for (const name of await readdir(h.root)) if (name.startsWith('state.sqlite')) expect((await readFile(join(h.root, name))).includes(Buffer.from(TOKEN))).toBe(false);
  expect(await readdir(join(h.root, 'runs'))).toEqual([]);
});

test('an ambiguous dispatch fails as REMOTE_STATE_UNKNOWN once, and nothing ever launches it again', async () => {
  const h = await harness(async () => replay('dispatch-204'));
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.store.getResearch(job.id)!.status === 'failed');
  expect(h.store.getResearch(job.id)).toMatchObject({ failure: 'REMOTE_STATE_UNKNOWN' });
  expect(h.calls).toHaveLength(1);
  const again = await harness(happy, { root: h.root });
  await again.supervisor.attach(); again.supervisor.observe(researchDto(again.store.getResearch(job.id)!));
  await new Promise(r => setTimeout(r, 100));
  expect(again.calls).toHaveLength(0);
});

test('a lost reply is resent with the same request id: one journal step, one launch', async () => {
  let dropped = false;
  const h = await harness(happy, { fault: () => {} });
  const original = h.jobs.transition.bind(h.jobs);
  h.jobs.transition = command => {
    const reply = original(command);
    if (command.to === 'dispatching' && !dropped) { dropped = true; setTimeout(() => h.supervisor.engineReady('epoch-1'), 20); throw new Error('ENGINE_UNAVAILABLE'); }
    return reply;
  };
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.handoffs.length === 1);
  const sends = h.controls.filter(c => c.method === 'research.transition' && c.to === 'dispatching');
  expect(sends).toHaveLength(2);
  expect(new Set(sends.map(c => (c as { requestId: string }).requestId)).size).toBe(1);
  expect(h.store.researchEvents(job.id).events.filter(e => e.to === 'dispatching')).toHaveLength(1);
  expect(h.calls.filter(c => c.kind === 'dispatch')).toHaveLength(1);
});

test('without a token the job fails before any launch', async () => {
  const h = await harness(happy, { noToken: true });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.store.getResearch(job.id)!.status === 'failed');
  expect(h.store.getResearch(job.id)).toMatchObject({ failure: 'COLLECTOR_TOKEN_MISSING' });
  expect(h.prepared()).toBe(0);
});

test('a cancel after the dispatcher started lets it finish and records its run on the cancel', async () => {
  const hold = gate(); let signal: AbortSignal | undefined;
  const h = await harness(async call => { if (call.kind === 'dispatch') { signal = call.signal; await hold.promise; return replay('dispatch-ok'); } return happy(call); });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => signal !== undefined); // started: the script runs only after admission
  const { research } = h.jobs.cancel(job.id, randomUUID(), []); h.supervisor.observe(research);
  await new Promise(r => setTimeout(r, 50));
  expect(signal!.aborted).toBe(false);
  hold.open();
  await until(() => h.store.getResearch(job.id)!.status === 'cancelled');
  expect(h.store.getResearch(job.id)).toMatchObject({ workflowRunId: '1' });
  expect(h.calls.filter(c => c.kind === 'watch')).toHaveLength(0);
});

test('a learned run id survives a failed commit through the spool, and the next start records it without dispatching', async () => {
  const h = await harness(happy, { fault: command => { if (command.method === 'research.transition' && command.to === 'collecting') throw new Error('INTERNAL_ERROR'); } });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(async () => (await readdir(join(h.root, 'runs')).catch(() => [])).length === 1 && h.store.getResearch(job.id)!.status === 'dispatching');
  await h.supervisor.close(50);
  const next = await harness(happy, { root: h.root });
  await next.supervisor.attach();
  await until(() => next.handoffs.length === 1);
  expect(next.store.getResearch(job.id)).toMatchObject({ status: 'collecting', workflowRunId: '1' });
  expect(next.calls.map(c => c.kind)).toEqual(['watch']);
  expect(await readdir(join(h.root, 'runs'))).toEqual([]);
});

test('a hold stops the watch; after a policy change the job fails with the new admission and keeps its run', async () => {
  let watching: AbortSignal | undefined;
  const h = await harness(async call => {
    if (call.kind === 'dispatch') return replay('dispatch-ok');
    watching = call.signal; await new Promise<void>(r => call.signal.addEventListener('abort', () => r(), { once: true }));
    return { ...replay('watch-timeout'), code: 1, output: '', cancelled: true };
  });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  // The call is recorded before admission; the watch is running only once the script has its signal.
  await until(() => watching !== undefined);
  const release = h.supervisor.hold('p');
  expect(watching!.aborted).toBe(true);
  h.store.putProject({ ...h.store.getProject('p')!, policy: { revision: 2, inference: 'local-only', research: 'private-connected' } });
  release();
  await until(() => h.store.getResearch(job.id)!.status === 'failed');
  expect(h.store.getResearch(job.id)).toMatchObject({ failure: 'POLICY_CHANGED', workflowRunId: '1' });
});

test('a refused watch parks for credentials, and a collector save re-arms it', async () => {
  let watches = 0;
  const h = await harness(async call => { if (call.kind === 'dispatch') return replay('dispatch-ok'); return ++watches === 1 ? replay('watch-run-401') : happy(call); });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => watches === 1);
  await new Promise(r => setTimeout(r, 100));
  expect(watches).toBe(1); expect(h.store.getResearch(job.id)!.status).toBe('collecting');
  h.supervisor.configChanged();
  await until(() => h.handoffs.length === 1);
});

test('transient watch failures back off and retry; a still-running run is watched again', async () => {
  const sequence = ['watch-run-503', 'watch-timeout'];
  const h = await harness(async call => { if (call.kind === 'dispatch') return replay('dispatch-ok'); const next = sequence.shift(); return next ? replay(next) : happy(call); });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.handoffs.length === 1);
  expect(h.calls.filter(c => c.kind === 'watch')).toHaveLength(3);
  expect(h.store.getResearch(job.id)!.status).toBe('collecting');
});

test('a run past its seven-day deadline fails as COLLECTION_EXPIRED without another watch', async () => {
  let clock = Date.now();
  const h = await harness(async call => { if (call.kind === 'dispatch') { clock += 8 * 86_400_000; return replay('dispatch-ok'); } return happy(call); }, { now: () => clock });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.store.getResearch(job.id)!.status === 'failed');
  expect(h.store.getResearch(job.id)).toMatchObject({ failure: 'COLLECTION_EXPIRED', workflowRunId: '1' });
  expect(h.calls.filter(c => c.kind === 'watch')).toHaveLength(0);
});

const verification = (jobRevision: number, clientRef: string) => ({ artifactSha256: 'a'.repeat(64), artifactBytes: 18127, validatorRevision: 'b'.repeat(40), nodeSha256: 'c'.repeat(64), state: 'REVIEW_IN_PROGRESS' as const,
  jobRevision, projectRevision: 1, repository: 'o/r', ref: 'main', workflow: 'collect.yml', commit: 'd'.repeat(40), runAttempt: 1, workflowRunId: '1', clientRef, downloadDigest: 'unverified' as const });

test('a verified import commits collecting -> collected with its verification journaled; a rejected one fails the job', async () => {
  const h = await harness(happy, { importPackage: async handoff => ({ kind: 'verified', verification: verification(handoff.expectedRevision, handoff.clientRef) }) });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.store.getResearch(job.id)!.status === 'collected');
  expect(h.handoffs[0]).toMatchObject({ expectedRevision: 3, projectRevision: 1 });
  const step = h.store.researchEvents(job.id).events.at(-1)!;
  expect(step).toMatchObject({ from: 'collecting', to: 'collected', actor: 'main', cause: 'PACKAGE_VERIFIED', detail: { verification: verification(3, job.clientRef) } });
  const rejected = await harness(happy, { importPackage: async () => ({ kind: 'rejected', failure: 'PACKAGE_IDENTITY_MISMATCH', cause: 'IMPORT_IDENTITY_MISMATCH' }) });
  await rejected.supervisor.attach();
  const other = rejected.create(); rejected.supervisor.observe(researchDto(other));
  await until(() => rejected.store.getResearch(other.id)!.status === 'failed');
  expect(rejected.store.getResearch(other.id)).toMatchObject({ failure: 'PACKAGE_IDENTITY_MISMATCH', workflowRunId: '1' });
  expect(rejected.store.researchEvents(other.id).events.at(-1)).toMatchObject({ cause: 'IMPORT_IDENTITY_MISMATCH' });
});

test('a receipt bound to another job revision records nothing and the package is verified again', async () => {
  let imports = 0;
  const h = await harness(happy, { importPackage: async handoff => (++imports === 1 ? { kind: 'verified', verification: verification(handoff.expectedRevision + 1, handoff.clientRef) } : { kind: 'deferred' }) });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => imports === 2);
  expect(h.store.getResearch(job.id)!.status).toBe('collecting');
  expect(h.controls.some(c => c.method === 'research.transition' && c.to === 'collected')).toBe(false);
});

test('an import stopped by the supervisor\'s own wake re-reads instead of parking; a plain deferral parks', async () => {
  const h = await harness(happy, {
    importPackage: handoff => h.handoffs.length > 1 ? Promise.resolve({ kind: 'deferred' })
      : new Promise(resolve => handoff.signal.addEventListener('abort', () => resolve({ kind: 'deferred' }), { once: true })),
  });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.handoffs.length === 1);
  h.supervisor.engineReady('epoch-1');
  await until(() => h.handoffs.length === 2);
  await new Promise(r => setTimeout(r, 100));
  expect(h.handoffs).toHaveLength(2);
  expect(h.calls.filter(c => c.kind === 'watch')).toHaveLength(2);
  expect(h.store.getResearch(job.id)!.status).toBe('collecting');
});

test('a collecting job without a readable dispatchedAt is watched against a deadline from its creation, never expired on sight', async () => {
  let clock = Date.now();
  const h = await harness(happy, { now: () => clock });
  const original = h.jobs.context.bind(h.jobs);
  // The schema makes this unreachable through the store; the reply is altered as a damaged row would read.
  h.jobs.context = id => { const ctx = original(id); const { dispatchedAt: _dispatchedAt, ...research } = ctx.research; return { ...ctx, research }; };
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.handoffs.length === 1);
  expect(h.store.getResearch(job.id)).toMatchObject({ status: 'collecting', workflowRunId: '1' });
  // Creation precedes dispatch, so the fallback deadline is never later than the real one.
  const late = await harness(async call => { if (call.kind === 'dispatch') { clock += 8 * 86_400_000; return replay('dispatch-ok'); } return happy(call); }, { now: () => clock });
  const lateOriginal = late.jobs.context.bind(late.jobs);
  late.jobs.context = id => { const ctx = lateOriginal(id); const { dispatchedAt: _dispatchedAt, ...research } = ctx.research; return { ...ctx, research }; };
  await late.supervisor.attach();
  const old = late.create(); late.supervisor.observe(researchDto(old));
  await until(() => late.store.getResearch(old.id)!.status === 'failed');
  expect(late.store.getResearch(old.id)).toMatchObject({ failure: 'COLLECTION_EXPIRED', workflowRunId: '1' });
  expect(late.calls.filter(c => c.kind === 'watch')).toHaveLength(0);
});

test('a watch the vault refuses while the reference is still saved retries, parks only after three refusals, and a save re-arms it', async () => {
  // A grant under a stale epoch (the window of an engine-only restart) is refused although the token is saved.
  let launches = 0; let stale: (n: number) => boolean = n => n === 2;
  const h = await harness(happy, { epoch: () => stale(++launches) ? 'epoch-2' : 'epoch-1' });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.handoffs.length === 1);
  expect(launches).toBe(3);
  // Refused every time: counted like any other refusal, then parked for credentials.
  const again = await harness(happy, { epoch: () => stale(++launches) ? 'epoch-2' : 'epoch-1' });
  launches = 0; stale = n => n > 1;
  await again.supervisor.attach();
  const other = again.create(); again.supervisor.observe(researchDto(other));
  await until(() => launches === 4);
  await new Promise(r => setTimeout(r, 100));
  expect(launches).toBe(4); expect(again.handoffs).toHaveLength(0); expect(again.store.getResearch(other.id)!.status).toBe('collecting');
  // A save re-arms it with a fresh count: one more refusal retries instead of parking again at once.
  stale = n => n === 5; again.supervisor.configChanged();
  await until(() => again.handoffs.length === 1);
  expect(launches).toBe(6);
});

test('refusals separated by watches that ran do not add up: three over the job\'s life never park it', async () => {
  // One stale-epoch refusal per engine-only restart, each followed by a watch that started and found the run still going.
  let launches = 0; let watches = 0;
  const h = await harness(async call => { if (call.kind === 'dispatch') return replay('dispatch-ok'); return ++watches < 3 ? replay('watch-timeout') : happy(call); },
    { epoch: () => [2, 4, 6].includes(++launches) ? 'epoch-2' : 'epoch-1' });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.handoffs.length === 1);
  expect(launches).toBe(7); expect(watches).toBe(3);
});

test('a watch whose token is no longer in the vault parks for credentials at once, and a new token re-arms it', async () => {
  // The token is removed while the dispatcher runs: it keeps its copy, and the watch's grant is refused.
  const h = await harness(async call => { if (call.kind === 'dispatch') { await h.vault.tombstone(h.config.secretRef!); return replay('dispatch-ok'); } return happy(call); });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.store.getResearch(job.id)!.status === 'collecting');
  await new Promise(r => setTimeout(r, 100));
  // Preflight, the dispatcher and one refused watch staged the kit: no counted retries.
  expect(h.prepared()).toBe(3); expect(h.calls.filter(c => c.kind === 'watch')).toHaveLength(0);
  const replaced = await h.vault.saveStaged(TOKEN); await h.vault.commit(replaced);
  h.config.secretRef = replaced; h.supervisor.configChanged();
  await until(() => h.handoffs.length === 1);
});

test('a job held after a commit error stays owned until the next app start, so no recovery fails it and its spooled run id is recorded then', async () => {
  const refuse = (command: Control) => { if (command.method === 'research.transition' && command.to === 'collecting') throw new Error('INTERNAL_ERROR'); };
  const h = await harness(happy, { fault: refuse });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => h.controls.some(c => c.method === 'research.transition' && c.to === 'collecting'));
  await new Promise(r => setTimeout(r, 50));
  // An engine-only restart: recovery must skip the held job, or it would fail it as REMOTE_STATE_UNKNOWN without its run.
  h.supervisor.engineReady('epoch-1');
  await until(() => h.controls.filter(c => c.method === 'research.recover').length === 2);
  expect(h.controls.filter(c => c.method === 'research.recover').at(-1)).toEqual({ method: 'research.recover', owned: [job.id] });
  expect(h.store.getResearch(job.id)!.status).toBe('dispatching');
  expect(h.supervisor.busy()).toBe(true);
  await h.supervisor.close(50);
  // A start whose replay commit fails too keeps the job out of its own recovery.
  const second = await harness(happy, { root: h.root, fault: refuse });
  await second.supervisor.attach();
  expect(second.controls.filter(c => c.method === 'research.recover')).toEqual([{ method: 'research.recover', owned: [job.id] }]);
  expect(second.store.getResearch(job.id)!.status).toBe('dispatching');
  await second.supervisor.close(50);
  const next = await harness(happy, { root: h.root });
  await next.supervisor.attach();
  await until(() => next.handoffs.length === 1);
  expect(next.store.getResearch(job.id)).toMatchObject({ status: 'collecting', workflowRunId: '1' });
  expect([...h.calls, ...second.calls, ...next.calls].filter(c => c.kind === 'dispatch')).toHaveLength(1);
});

test('a notice for a job held after a commit error does not re-admit it before the next app start', async () => {
  // The admission commit fails once: the job is held while still queued, and the engine would accept a second try.
  let failed = false;
  const h = await harness(happy, { fault: command => { if (command.method === 'research.transition' && command.to === 'dispatching' && !failed) { failed = true; throw new Error('INTERNAL_ERROR'); } } });
  await h.supervisor.attach();
  const job = h.create(); h.supervisor.observe(researchDto(job));
  await until(() => failed);
  await new Promise(r => setTimeout(r, 50));
  // The same queued notice again (a resend, a reply): owning it anew would admit and dispatch with a fresh request id.
  h.supervisor.observe(researchDto(h.store.getResearch(job.id)!));
  await new Promise(r => setTimeout(r, 150));
  expect(h.calls).toHaveLength(0); expect(h.store.getResearch(job.id)!.status).toBe('queued');
  expect(h.supervisor.ownedIds()).toEqual([job.id]);
  // Still busy: a collector save may not retarget the repository under a job that resumes with its frozen target.
  expect(h.supervisor.busy()).toBe(true);
});
