import { afterEach, beforeAll, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import goldenFile from './fixtures/research-kit/collector-golden/goldens.json';
import provenance from './fixtures/research-kit/provenance.json';
import { Store } from '../src/engine/store';
import { ResearchJobs, researchDto } from '../src/engine/research';
import { ControlSchema, engineFailureCode, type Control } from '../src/engine/control';
import { Vault } from '../src/main/vault';
import { CollectorSupervisor, type ImportOutcome, type PackageHandoff } from '../src/main/collector';
import { packageImporter } from '../src/main/research-import';
import { packageFileName } from '../src/adapters/research-kit/collector';
import { ResearchKit, VALIDATOR_REVISION } from '../src/adapters/research-kit/adapter';
import type { Failure, Result } from '../src/adapters/research-kit/contracts';
import type { CollectorConfig } from '../src/main/collector-settings';
import type { OwnedCommand, OwnedResult, OwnedRunner } from '../src/tools/commands';

// Verified import end to end: the real Store, ResearchJobs and ControlSchema, the real ResearchKit staging the pinned kit
// and running its validator on the recorded fixtures, and a fake GitHub at the network boundary. The native helper is
// replaced by a runner that does what it does before CreateProcessW, then runs node directly (the validator) or replays
// the real kit's recorded collector output (dispatch and watch), so this runs on any OS.
const TOKEN = 'github_pat_test-only-import-0123456789';
const at = '2026-10-03T00:00:00.000Z';
const identity = provenance.identity; const CLIENT_REF = identity.clientRef;
const fixture = (name: string) => provenance.fixtures.find(f => f.name === name)!;
const goldens = new Map(goldenFile.goldens.map(g => [g.name, g]));
const replay = (name: string): OwnedResult => ({ status: 'exited', code: goldens.get(name)!.exitCode, output: goldens.get(name)!.output, truncated: false, cancelled: false, timedOut: false });
const kitRoot = resolve('.build/research-kit-external/research-kit');
let nodeSha256: string;
const roots: string[] = []; const closers: Array<() => Promise<unknown>> = [];
beforeAll(async () => { nodeSha256 = createHash('sha256').update(await readFile(process.execPath)).digest('hex'); });
afterEach(async () => { for (const close of closers.splice(0)) await close().catch(() => {}); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

/** The GitHub run the fixtures were packaged from, as GitHub's REST API returns it (extra fields included). */
const RUN = { id: identity.workflowRunId, name: 'collect', run_attempt: identity.runAttempt, head_sha: identity.commit, head_branch: identity.ref, path: '.github/workflows/collect.yml',
  event: 'workflow_dispatch', status: 'completed', conclusion: 'success', html_url: 'https://github.com/x/y/actions/runs/1', repository: { id: 1, full_name: identity.repository, private: true } };
function fakeGitHub(answer: () => Response) {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  return { seen, fetch: async (url: string, init: RequestInit) => { seen.push({ url, init }); return answer(); } };
}
const json = (value: object, status = 200) => () => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

/** A validator stand-in a test can swap in or out between calls (a helper that fails, a forged report). */
type Validator = { run?: (request: OwnedCommand) => Promise<OwnedResult> };
/** Stands in for the helper: admission first, then the child. collect-remote.mjs replays the kit's goldens. */
function runner(validations: OwnedCommand[], watch = 'collected', validator: Validator = {}): OwnedRunner {
  return async (request, signal, options = {}) => {
    if (signal?.aborted) throw new Error('RUN_CANCELLED');
    await options.beforeStart?.();
    options.onStarted?.({ pid: 4242, createdAt: '1' });
    if (request.args.some(arg => arg.endsWith('collect-remote.mjs'))) {
      if (request.args.includes('--no-wait')) return replay('dispatch-ok');
      await copyFile(resolve(`tests/fixtures/research-kit/${watch}.zip`), join(request.cwd, 'out', packageFileName(CLIENT_REF)));
      return replay('watch-collected');
    }
    validations.push(request);
    if (validator.run) return validator.run(request);
    return new Promise(done => execFile(request.executable, request.args, { cwd: request.cwd, env: request.env, timeout: request.timeoutMs, maxBuffer: request.maxOutputBytes, encoding: 'utf8' },
      (error, stdout) => done({ status: 'exited', code: error ? (typeof error.code === 'number' ? error.code : null) : 0, output: stdout, truncated: false, cancelled: false, timedOut: false })));
  };
}

async function harness(answer: () => Response, options: { watch?: string; validator?: Validator } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'moonzila-import-')); roots.push(root);
  const store = new Store(join(root, 'state.sqlite')); closers.push(async () => store.close());
  const notices: unknown[] = []; const jobs = new ResearchJobs(store, research => notices.push(research));
  store.putProject({ id: 'p', name: 'p', rootPath: 'C:\\work\\p', pathLabel: 'p', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'public-technical' }, missing: false, createdAt: at });
  const key = randomBytes(32);
  const vault = new Vault(join(root, 'vault'), {
    isEncryptionAvailable: () => true,
    encryptString(value: string) { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv); const d = Buffer.concat([c.update(value, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), d]); },
    decryptString(value: Buffer) { const d = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); d.setAuthTag(value.subarray(12, 28)); return Buffer.concat([d.update(value.subarray(28)), d.final()]).toString('utf8'); },
  });
  await vault.initialize('epoch-1');
  const secretRef = await vault.saveStaged(TOKEN); await vault.commit(secretRef);
  const config: CollectorConfig = { revision: 1, repository: identity.repository, workflow: 'collect.yml', ref: identity.ref, secretRef };
  const controls: Control[] = [];
  const control = async (raw: Control) => {
    const command = ControlSchema.parse(JSON.parse(JSON.stringify(raw))); controls.push(command);
    try {
      const result = command.method === 'research.context' ? jobs.context(command.researchId)
        : command.method === 'research.transition' ? jobs.transition(command)
          : command.method === 'research.recover' ? jobs.recover(command.owned) : undefined;
      return JSON.parse(JSON.stringify(result));
    } catch (error) { throw new Error(engineFailureCode(error), { cause: error }); }
  };
  const validations: OwnedCommand[] = [];
  const kit = new ResearchKit({ kitRoot, nodePath: process.execPath, nodeSha256, storageRoot: join(root, 'storage'), helperPath: resolve('.build/native/MoonAlizaHost.exe') }, runner(validations, options.watch, options.validator));
  const github = fakeGitHub(answer);
  const settings = { current: () => config };
  const importer = packageImporter({ epoch: () => 'epoch-1', vault, settings, kit, fetch: github.fetch, packageWorkflow: identity.workflow });
  const handoffs: PackageHandoff[] = []; const outcomes: ImportOutcome[] = [];
  const supervisor = new CollectorSupervisor({
    control, epoch: () => 'epoch-1', vault, settings, kit, spoolDirectory: join(root, 'runs'),
    importPackage: async handoff => { handoffs.push(handoff); const outcome = await importer(handoff); outcomes.push(outcome); return outcome; },
    limits: { backoffFirstMs: 5, stillRunningDelayMs: 5, quitDrainMs: 50 }, retryDelayMs: 10,
  });
  closers.unshift(() => kit.close()); closers.unshift(() => supervisor.close(50));
  const start = async () => {
    await supervisor.attach();
    const { research } = store.createResearch({ id: randomUUID(), projectId: 'p', topic: 'Ollama context limits', inputs: { queries: ['ollama num_ctx'], urls: [], preferDomains: [], depth: 'quick', maxPages: 3 }, clientRef: CLIENT_REF, researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
    supervisor.observe(researchDto(research)); return research;
  };
  return { root, store, controls, notices, validations, github, handoffs, outcomes, importer, vault, settings, config, kit, start };
}
async function until(check: () => boolean, timeout = 30000) {
  const end = Date.now() + timeout;
  while (!check()) { if (Date.now() > end) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 10)); }
}
async function noTokenAnywhere(h: Awaited<ReturnType<typeof harness>>) {
  expect(JSON.stringify(h.controls)).not.toContain(TOKEN);
  expect(JSON.stringify(h.notices)).not.toContain(TOKEN);
  for (const v of h.validations) { expect(JSON.stringify(v)).not.toContain(TOKEN); }
  for (const name of await readdir(h.root)) if (name.startsWith('state.sqlite')) expect((await readFile(join(h.root, name))).includes(Buffer.from(TOKEN))).toBe(false);
}

test('a collected package is verified against the GitHub run and its verification is journaled on collecting -> collected', async () => {
  const h = await harness(json(RUN));
  const job = await h.start();
  await until(() => h.store.getResearch(job.id)!.status === 'collected');
  const collected = fixture('collected');
  const step = h.store.researchEvents(job.id).events.at(-1)!;
  expect(step).toMatchObject({ revision: 4, from: 'collecting', to: 'collected', actor: 'main', cause: 'PACKAGE_VERIFIED' });
  expect(step.detail).toEqual({ verification: {
    artifactSha256: collected.sha256, artifactBytes: collected.byteLength, validatorRevision: VALIDATOR_REVISION, nodeSha256, state: 'REVIEW_IN_PROGRESS',
    jobRevision: 3, projectRevision: 1, repository: identity.repository, ref: identity.ref, workflow: identity.workflow, commit: identity.commit, runAttempt: identity.runAttempt,
    workflowRunId: String(identity.workflowRunId), clientRef: CLIENT_REF, downloadDigest: 'unverified',
  } });
  // The exact bytes are retained, content-addressed, outside the collector's folder.
  expect(createHash('sha256').update(await readFile(join(h.root, 'storage', 'artifacts', `${collected.sha256}.zip`))).digest('hex')).toBe(collected.sha256);
  // One authenticated GET of the dispatched run; the token is only in its Authorization header and redirects are not followed.
  expect(h.github.seen).toHaveLength(1);
  const { url, init } = h.github.seen[0]!;
  expect(url).toBe(`https://api.github.com/repos/${identity.repository}/actions/runs/1`);
  expect(init).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit' });
  expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  expect(h.validations).toHaveLength(1);
  expect(h.validations[0]!.args).toEqual(expect.arrayContaining(['validate', '--expect-client-ref', CLIENT_REF, '--json']));
  await noTokenAnywhere(h);
}, 60000);

test('a package from a different run attempt or commit fails as PACKAGE_IDENTITY_MISMATCH', async () => {
  for (const run of [{ ...RUN, run_attempt: 2 }, { ...RUN, head_sha: 'e'.repeat(40) }]) {
    const h = await harness(json(run));
    const job = await h.start();
    await until(() => h.store.getResearch(job.id)!.status === 'failed');
    expect(h.store.getResearch(job.id)).toMatchObject({ failure: 'PACKAGE_IDENTITY_MISMATCH', workflowRunId: '1' });
    expect(h.store.researchEvents(job.id).events.at(-1)).toMatchObject({ from: 'collecting', to: 'failed', cause: 'IMPORT_IDENTITY_MISMATCH', detail: { failure: 'PACKAGE_IDENTITY_MISMATCH' } });
    expect(h.validations).toHaveLength(1);
    await noTokenAnywhere(h);
  }
}, 60000);

test('a run that is not the one the job dispatched fails as RUN_IDENTITY_MISMATCH before any validation', async () => {
  for (const run of [{ ...RUN, path: '.github/workflows/other.yml' }, { ...RUN, head_branch: 'main' }, { ...RUN, event: 'push' }, { ...RUN, id: 2 }, { ...RUN, repository: { full_name: 'someone/else' } }]) {
    const h = await harness(json(run));
    const job = await h.start();
    await until(() => h.store.getResearch(job.id)!.status === 'failed');
    expect(h.store.getResearch(job.id)).toMatchObject({ failure: 'RUN_IDENTITY_MISMATCH' });
    expect(h.store.researchEvents(job.id).events.at(-1)).toMatchObject({ cause: 'IMPORT_RUN_MISMATCH' });
    expect(h.validations).toHaveLength(0);
  }
}, 60000);

test('an unreadable, redirected or still-running GitHub run parks the job for import without validating or failing it', async () => {
  const answers = [json({ message: 'Server Error' }, 503), () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.invalid/run' } }), json({ ...RUN, head_sha: 'not-a-sha' }), json({ ...RUN, status: 'in_progress' }), json(RUN, 404)];
  for (const answer of answers) {
    const h = await harness(answer);
    const job = await h.start();
    await until(() => h.outcomes.length === 1);
    expect(h.outcomes).toEqual([{ kind: 'deferred' }]);
    await new Promise(r => setTimeout(r, 150));
    expect(h.handoffs).toHaveLength(1);
    expect(h.github.seen).toHaveLength(1);
    expect(h.store.getResearch(job.id)!.status).toBe('collecting');
    expect(h.validations).toHaveLength(0);
    await noTokenAnywhere(h);
  }
}, 60000);

test('the importer rejects an approval or a failed collection, fails a tampered package, and defers without a kit, token or matching settings', async () => {
  const h = await harness(json(RUN));
  const folder = join(h.root, 'packages'); await mkdir(folder);
  const handoff = async (name: string): Promise<PackageHandoff> => {
    const file = join(folder, `${name}-${randomUUID()}.zip`); await copyFile(resolve(`tests/fixtures/research-kit/${name}.zip`), file);
    return { researchId: randomUUID(), projectId: 'p', expectedRevision: 3, projectRevision: 1, clientRef: CLIENT_REF, workflowRunId: '1', file,
      target: { collectorRevision: 1, repository: identity.repository, workflow: 'collect.yml', ref: `refs/heads/${identity.ref}` }, kit: { status: 'PASS', state: 'REVIEW_REQUIRED' }, signal: new AbortController().signal };
  };
  expect(await h.importer(await handoff('approved'))).toEqual({ kind: 'rejected', failure: 'ARTIFACT_INVALID', cause: 'IMPORT_UNEXPECTED_APPROVAL' });
  expect(await h.importer(await handoff('failed'))).toEqual({ kind: 'rejected', failure: 'COLLECTION_FAILED', cause: 'IMPORT_COLLECTION_FAILED' });
  expect(await h.importer(await handoff('tampered'))).toEqual({ kind: 'rejected', failure: 'ARTIFACT_INVALID', cause: 'IMPORT_FAIL' });
  expect(await h.importer(await handoff('legacy-review'))).toMatchObject({ kind: 'verified', verification: { state: 'REVIEW_REQUIRED', ref: identity.ref, jobRevision: 3 } });
  expect(h.github.seen).toHaveLength(4);
  const seen = h.github.seen.length;
  const deferred = [
    packageImporter({ epoch: () => 'epoch-1', vault: h.vault, settings: h.settings, kit: null, fetch: h.github.fetch }),
    packageImporter({ epoch: () => 'epoch-1', vault: h.vault, settings: { current: () => ({ ...h.config, secretRef: null }) }, kit: h.kit, fetch: h.github.fetch }),
    packageImporter({ epoch: () => 'epoch-1', vault: h.vault, settings: { current: () => ({ ...h.config, repository: 'o/r' }) }, kit: h.kit, fetch: h.github.fetch }),
  ];
  for (const importer of deferred) expect(await importer(await handoff('collected'))).toEqual({ kind: 'deferred' });
  // A grant for another epoch is refused by the vault: no request is made without the token.
  expect(await packageImporter({ epoch: () => 'epoch-0', vault: h.vault, settings: h.settings, kit: h.kit, fetch: h.github.fetch })(await handoff('collected'))).toEqual({ kind: 'deferred' });
  expect(h.github.seen).toHaveLength(seen);
}, 120000);

/** A handoff of a package file the test writes, for direct importer calls. */
async function handoffFor(h: Awaited<ReturnType<typeof harness>>, bytes: Buffer | null, signal = new AbortController().signal): Promise<PackageHandoff> {
  const folder = join(h.root, 'packages'); await mkdir(folder, { recursive: true });
  const file = join(folder, `${randomUUID()}.zip`); if (bytes) await writeFile(file, bytes);
  return { researchId: randomUUID(), projectId: 'p', expectedRevision: 3, projectRevision: 1, clientRef: CLIENT_REF, workflowRunId: '1', file,
    target: { collectorRevision: 1, repository: identity.repository, workflow: 'collect.yml', ref: identity.ref }, kit: { status: 'PASS', state: 'REVIEW_REQUIRED' }, signal };
}
/** A one-entry stored ZIP, so a test can hand the importer a well-formed archive whose manifest has the wrong shape. */
function storedZip(name: string, content: string): Buffer {
  const data = Buffer.from(content); const file = Buffer.from(name); const crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(file.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(file.length, 28);
  const offset = local.length + file.length + data.length; const size = central.length + file.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([local, file, data, central, file, end]);
}

test('a good package whose validation fails on this machine is deferred, never failed', async () => {
  // The helper unavailable or answering badly, a spawn failure, the downloaded file gone: none is the package's fault.
  const validator: Validator = {};
  const h = await harness(json(RUN), { validator });
  const collected = await readFile(resolve('tests/fixtures/research-kit/collected.zip'));
  for (const message of ['INVALID_NATIVE_RESPONSE', 'WINDOWS_REQUIRED', 'spawn ENOENT']) {
    validator.run = async () => { throw Object.assign(new Error(message), { code: 'ENOENT' }); };
    expect(await h.importer(await handoffFor(h, collected))).toEqual({ kind: 'deferred' });
  }
  delete validator.run;
  expect(await h.importer(await handoffFor(h, null))).toEqual({ kind: 'deferred' });
  // The same package, once this machine can validate it, is verified.
  expect(await h.importer(await handoffFor(h, collected))).toMatchObject({ kind: 'verified', verification: { artifactSha256: fixture('collected').sha256 } });
  // End to end: the job is left collecting for the next import, not failed.
  validator.run = async () => { throw new Error('INVALID_NATIVE_RESPONSE'); };
  const job = await h.start();
  await until(() => h.outcomes.length === 1);
  expect(h.outcomes).toEqual([{ kind: 'deferred' }]);
  expect(h.store.getResearch(job.id)!.status).toBe('collecting');
}, 120000);

test('a package whose own content is malformed is still rejected through the real kit', async () => {
  const validator: Validator = {};
  const h = await harness(json(RUN), { validator });
  expect(await h.importer(await handoffFor(h, Buffer.from('not a zip archive at all')))).toEqual({ kind: 'rejected', failure: 'ARTIFACT_INVALID', cause: 'IMPORT_ARTIFACT_INVALID' });
  expect(await h.importer(await handoffFor(h, storedZip('manifest.json', '{"manifest":')))).toEqual({ kind: 'rejected', failure: 'ARTIFACT_INVALID', cause: 'IMPORT_ARTIFACT_INVALID' });
  // A validator PASS (here forged) over a manifest of the wrong shape: the projection failure is the package's.
  validator.run = async () => ({ status: 'exited', code: 0, output: JSON.stringify(fixture('collected').expected.report), truncated: false, cancelled: false, timedOut: false });
  expect(await h.importer(await handoffFor(h, storedZip('manifest.json', '{}')))).toEqual({ kind: 'rejected', failure: 'ARTIFACT_INVALID', cause: 'IMPORT_ARTIFACT_INVALID' });
  expect(h.validations).toHaveLength(1);
}, 60000);

test('every validator answer maps to a verified, rejected or deferred outcome', async () => {
  const h = await harness(json(RUN));
  const blocked: Record<Failure, ImportOutcome> = {
    IDENTITY_MISMATCH: { kind: 'rejected', failure: 'PACKAGE_IDENTITY_MISMATCH', cause: 'IMPORT_IDENTITY_MISMATCH' },
    ARTIFACT_INVALID: { kind: 'rejected', failure: 'ARTIFACT_INVALID', cause: 'IMPORT_ARTIFACT_INVALID' },
    INPUT_LIMIT: { kind: 'rejected', failure: 'ARTIFACT_INVALID', cause: 'IMPORT_INPUT_LIMIT' },
    INSTALLATION_INVALID: { kind: 'deferred' }, VALIDATOR_OUTPUT: { kind: 'deferred' }, CANCELLED: { kind: 'deferred' }, TIMEOUT: { kind: 'deferred' },
    OUTPUT_LIMIT: { kind: 'deferred' }, STORAGE_LIMIT: { kind: 'deferred' }, STALE_VERIFICATION: { kind: 'deferred' },
  };
  const answers: Array<[Result, ImportOutcome]> = [
    [{ status: 'FAIL', state: null, researchReady: false, receipt: null, error: 'ARTIFACT_INVALID' }, { kind: 'rejected', failure: 'ARTIFACT_INVALID', cause: 'IMPORT_FAIL' }],
    [{ status: 'INCOMPLETE', state: null, researchReady: false, receipt: null, error: 'ARTIFACT_INVALID' }, { kind: 'rejected', failure: 'ARTIFACT_INCOMPLETE', cause: 'IMPORT_INCOMPLETE' }],
    ...Object.entries(blocked).map(([error, outcome]): [Result, ImportOutcome] => [{ status: 'BLOCKED', state: null, researchReady: false, receipt: null, error: error as Failure }, outcome]),
  ];
  for (const [result, outcome] of answers) {
    const importer = packageImporter({ epoch: () => 'epoch-1', vault: h.vault, settings: h.settings, kit: { validate: async () => result }, fetch: h.github.fetch, packageWorkflow: identity.workflow });
    expect(await importer(await handoffFor(h, Buffer.from('unused')))).toEqual(outcome);
  }
}, 60000);

test('the GitHub run read is bounded to 1 MiB, by its declared length and while streaming, and is skipped once the job is woken', async () => {
  const h = await harness(json(RUN));
  const validated: string[] = []; const kit = { validate: async (file: string) => { validated.push(file); return { status: 'BLOCKED', state: null, researchReady: false, receipt: null, error: 'TIMEOUT' } as Result; } };
  const padded = JSON.stringify({ ...RUN, pad: 'x'.repeat(1024 * 1024) });
  const answers = [
    // A valid run that declares more than the cap: refused before its body is read.
    () => new Response(JSON.stringify(RUN), { status: 200, headers: { 'content-length': String(1024 * 1024 + 1) } }),
    // A valid run streamed past the cap without a declared length.
    () => new Response(new ReadableStream({ start(stream) { const bytes = Buffer.from(padded); for (let at = 0; at < bytes.length; at += 64 * 1024) stream.enqueue(bytes.subarray(at, at + 64 * 1024)); stream.close(); } }), { status: 200 }),
  ];
  for (const answer of answers) {
    const github = fakeGitHub(answer);
    const importer = packageImporter({ epoch: () => 'epoch-1', vault: h.vault, settings: h.settings, kit, fetch: github.fetch, packageWorkflow: identity.workflow });
    expect(await importer(await handoffFor(h, Buffer.from('unused')))).toEqual({ kind: 'deferred' });
    expect(github.seen).toHaveLength(1);
  }
  expect(validated).toHaveLength(0);
  // Within the cap the same run is read and passed on to validation.
  const within = fakeGitHub(json(RUN));
  await packageImporter({ epoch: () => 'epoch-1', vault: h.vault, settings: h.settings, kit, fetch: within.fetch, packageWorkflow: identity.workflow })(await handoffFor(h, Buffer.from('unused')));
  expect(validated).toHaveLength(1);
  // A handoff whose signal the supervisor already aborted makes no request and asks for no token.
  const stopped = new AbortController(); stopped.abort();
  const grant = h.vault.grant.bind(h.vault); let grants = 0; const vault = { ...h.vault, grant: (input: Parameters<typeof grant>[0]) => { grants++; return grant(input); }, withSecret: h.vault.withSecret.bind(h.vault), revokeContext: h.vault.revokeContext.bind(h.vault) };
  const github = fakeGitHub(json(RUN));
  expect(await packageImporter({ epoch: () => 'epoch-1', vault, settings: h.settings, kit, fetch: github.fetch, packageWorkflow: identity.workflow })(await handoffFor(h, Buffer.from('unused'), stopped.signal))).toEqual({ kind: 'deferred' });
  expect(github.seen).toHaveLength(0); expect(grants).toBe(0); expect(validated).toHaveLength(1);
}, 60000);

test('every GitHub run read revokes its grant: afterwards the grant no longer unlocks the token, after a good read or a failed one', async () => {
  const h = await harness(json(RUN));
  const issued: Array<{ capability: string; input: Parameters<Vault['grant']>[0] }> = [];
  const vault = { ...h.vault, grant: (input: Parameters<Vault['grant']>[0]) => { const capability = h.vault.grant(input); issued.push({ capability, input }); return capability; },
    withSecret: h.vault.withSecret.bind(h.vault), revokeContext: h.vault.revokeContext.bind(h.vault) };
  const kit = { validate: async () => ({ status: 'BLOCKED', state: null, researchReady: false, receipt: null, error: 'TIMEOUT' }) as Result };
  for (const answer of [json(RUN), json({ message: 'unavailable' }, 503)]) {
    const github = fakeGitHub(answer);
    expect(await packageImporter({ epoch: () => 'epoch-1', vault, settings: h.settings, kit, fetch: github.fetch, packageWorkflow: identity.workflow })(await handoffFor(h, Buffer.from('unused')))).toEqual({ kind: 'deferred' });
    expect(github.seen).toHaveLength(1);
  }
  expect(issued).toHaveLength(2);
  for (const { capability, input } of issued) {
    expect(input.contextId).toMatch(/^import:/);
    const { expiresAt: _expiresAt, ...binding } = input;
    await expect(h.vault.withSecret(capability, binding, () => 'used')).rejects.toThrow('CREDENTIAL_CAPABILITY_DENIED');
  }
}, 60000);
