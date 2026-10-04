import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, rename, writeFile, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { boundedJson, privateDirectory, serialized, missing } from '../../models/artifact-files';
import { spawnOwned, type OwnedIdentity, type OwnedResult, type OwnedRunner } from '../../tools/commands';
import { BindingSchema, DigestSchema, FailureSchema, ManifestProjection, ReceiptSchema, ReportSchema, ResultSchema, StateSchema, type Binding, type Receipt, type Report, type Result } from './contracts';
import { inspectArchive, MAX_ARCHIVE } from './archive';
import inventory from './runtime-inventory.json';

export const VALIDATOR_REVISION = inventory.revision;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const MAX_OUTPUT = 256 * 1024;
const ConfigSchema = z.object({ kitRoot: z.string(), nodePath: z.string(), nodeSha256: DigestSchema, storageRoot: z.string(), helperPath: z.string() }).strict();
export type ResearchConfig = z.infer<typeof ConfigSchema>;
const InstallationSchema = z.object({ kitRoot: z.string().max(32767), nodePath: z.string().max(32767), nodeSha256: DigestSchema }).strict();
/** The trusted installation main reads from its own data folder; a missing file means research is not installed. */
export async function readResearchInstallation(file: string): Promise<z.infer<typeof InstallationSchema> | null> {
  let value: unknown;
  try { value = await boundedJson(file, 64 * 1024); } catch (error) { if (missing(error)) return null; throw new Error('INSTALLATION_INVALID', { cause: error }); }
  const parsed = InstallationSchema.safeParse(value);
  if (!parsed.success || !isAbsolute(parsed.data.kitRoot) || !isAbsolute(parsed.data.nodePath)) throw new Error('INSTALLATION_INVALID');
  return parsed.data;
}
/** One collector child: a staged, hash-checked kit and its own private folders. Main owns the token and the bounds. */
export interface CollectorLaunch {
  readonly node: string; readonly script: string; readonly out: string;
  start(args: readonly string[], env: Record<string, string>, options: { timeoutMs: number; admissionTimeoutMs: number; maxOutputBytes: number; signal: AbortSignal; admit(): Promise<void>; onStarted(identity: OwnedIdentity): void }): Promise<OwnedResult>;
  /** The private temporary folder the child's environment must point at. */
  readonly temp: string;
  dispose(): Promise<void>;
}

/** The identity `create` records: the job's verified binding, plus the three source values Q8 carries from the collected manifest. */
export interface ReviewIdentity {
  clientRef: string; repository: string; ref: string; commit: string; workflow: string; workflowRunId: number; runAttempt: number;
  runUrl?: string; htmlUrl?: string; apiVersion?: string;
}
export type ReviewTool = { tool: 'preflight' } | { tool: 'brief'; force: boolean } | { tool: 'create'; root: string; output: string; identity: ReviewIdentity };
/** Bounds per review child (spec "Kit tools during the review", "Packaging"). Hitting the output limit stops each one. */
export const REVIEW_BOUNDS = { preflight: { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 }, brief: { timeoutMs: 60_000, maxOutputBytes: 64 * 1024 }, create: { timeoutMs: 120_000, maxOutputBytes: 64 * 1024 } } as const;
const HTTPS_URL = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[A-Za-z0-9._~/-]{0,1024}$/;
const API_VERSION = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
/**
 * `create`'s argv after the script: one `--name=value` element per value, so no value can be read as a flag. The Q8
 * values are carried only in a plain shape; anything else is left to the kit's defaults.
 */
export function createArgs(root: string, output: string, identity: ReviewIdentity): string[] {
  const id = BindingSchema.pick({ clientRef: true, repository: true, ref: true, commit: true, workflow: true, workflowRunId: true, runAttempt: true }).strict()
    .parse({ clientRef: identity.clientRef, repository: identity.repository, ref: identity.ref, commit: identity.commit, workflow: identity.workflow, workflowRunId: identity.workflowRunId, runAttempt: identity.runAttempt });
  return ['create', `--root=${root}`, `--output=${output}`, `--client-ref=${id.clientRef}`, `--repository=${id.repository}`, `--ref=${id.ref}`, `--commit=${id.commit}`,
    `--workflow=${id.workflow}`, `--run-id=${id.workflowRunId}`, `--run-attempt=${id.runAttempt}`,
    ...(identity.runUrl !== undefined && HTTPS_URL.test(identity.runUrl) ? [`--run-url=${identity.runUrl}`] : []),
    ...(identity.htmlUrl !== undefined && HTTPS_URL.test(identity.htmlUrl) ? [`--html-url=${identity.htmlUrl}`] : []),
    ...(identity.apiVersion !== undefined && API_VERSION.test(identity.apiVersion) ? [`--api-version=${identity.apiVersion}`] : [])];
}
/** One review child: the staged kit, run through the guarded runner with the caller's locks and pre-start check. */
export interface ReviewLaunch {
  /** storage/review: one folder per job, outside every project folder. */
  readonly root: string;
  run(tool: ReviewTool, options: { cwd: string; temp: string; locks: string[]; check(): Promise<void>; signal: AbortSignal }): Promise<OwnedResult>;
}

/** These are trusted main-process installation inputs, never IPC request fields. */
export function validatorEnvironment(directory: string, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const system = Object.entries(source).find(([key]) => key.toLowerCase() === 'systemroot')?.[1];
  return { ...(system ? { SystemRoot: system } : {}), TEMP: directory, TMP: directory, TMPDIR: directory, HOME: directory, USERPROFILE: directory };
}
export function parseValidatorReport(run: OwnedResult): Report {
  if (run.timedOut) throw new Error('TIMEOUT');
  if (run.truncated || Buffer.byteLength(run.output) > MAX_OUTPUT) throw new Error('OUTPUT_LIMIT');
  if (run.cancelled) throw new Error('CANCELLED');
  if (run.status !== 'exited') throw new Error('VALIDATOR_OUTPUT');
  try {
    const report = ReportSchema.parse(JSON.parse(run.output));
    if (run.code !== { PASS: 0, FAIL: 1, INCOMPLETE: 2, BLOCKED: 3 }[report.status] || (report.status === 'PASS' && report.errors.length > 0) || (report.status !== 'PASS' && report.buildAuthorized)) throw new Error();
    return report;
  } catch { throw new Error('VALIDATOR_OUTPUT'); }
}
async function capturedFile(file: string, maximum: number): Promise<Buffer> {
  const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('ARTIFACT_INVALID');
  const handle = await open(file, 'r');
  try {
    const actual = await handle.stat(); if (!actual.isFile() || actual.nlink !== 1) throw new Error('ARTIFACT_INVALID');
    if (actual.size > maximum) throw new Error('INPUT_LIMIT');
    const bytes = Buffer.alloc(actual.size + 1); let offset = 0;
    while (offset < bytes.length) { const result = await handle.read(bytes, offset, bytes.length - offset, offset); if (!result.bytesRead) break; offset += result.bytesRead; }
    if (offset !== actual.size) throw new Error('ARTIFACT_INVALID');
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}
async function removeOwned(root: string, target: string) {
  const inside = relative(resolve(root), resolve(target));
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('ARTIFACT_INVALID');
  await rm(target, { recursive: true, force: true });
}
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw new Error('CANCELLED'); };
const failureOf = (error: unknown) => { const failure = FailureSchema.safeParse((error as Error)?.message); return failure.success ? failure.data : undefined; };
/** Reading the package's own content: an unclassified failure here (a corrupt ZIP, a manifest of the wrong shape) is the package's. */
async function packageContent<T>(read: () => T | Promise<T>): Promise<T> {
  try { return await read(); } catch (error) { throw failureOf(error) ? error : new Error('ARTIFACT_INVALID', { cause: error }); }
}

export class ResearchKit {
  private readonly config: ResearchConfig;
  private runtime: string | undefined;
  private readonly receipts = new Map<string, Receipt>();
  private readonly launches = new Set<Promise<unknown>>();
  private readonly run: OwnedRunner;
  /** `run` is the launcher (the native helper by default); it is not installation input. */
  constructor(config: ResearchConfig, run?: OwnedRunner) {
    this.config = ConfigSchema.parse(config);
    this.run = run ?? ((request, signal, options) => spawnOwned(request, signal, { ...options, helperPath: this.config.helperPath }));
    for (const path of [config.kitRoot, config.nodePath, config.storageRoot, config.helperPath]) if (!isAbsolute(path) || path.includes('\0')) throw new Error('INSTALLATION_INVALID');
  }
  private async prepare(signal?: AbortSignal) {
    if (this.runtime) return this.runtime;
    const root = await privateDirectory(this.config.storageRoot);
    const destination = await privateDirectory(join(root, 'runtime', randomUUID()));
    try {
      for (const file of inventory.files) {
        checkAbort(signal);
        const bytes = await capturedFile(join(this.config.kitRoot, file.path), file.size);
        if (bytes.length !== file.size || hash(bytes) !== file.sha256) throw new Error('INSTALLATION_INVALID');
        const target = join(destination, file.path); await privateDirectory(dirname(target)); await writeFile(target, bytes, { flag: 'wx' });
      }
      this.runtime = destination; return destination;
    } catch (error) {
      await removeOwned(root, destination); checkAbort(signal);
      if ((error as Error)?.message === 'CANCELLED') throw error;
      throw new Error('INSTALLATION_INVALID', { cause: error });
    }
  }
  /**
   * The only way the kit's code runs: guarded read locks on node and every staged file, rehashed after the locks are
   * held and before the child starts, then the caller's own admission check. The validator and the collector differ
   * only in argv, environment, bounds and whether hitting the output limit stops the child.
   */
  private guardedRun(runtime: string, args: string[], cwd: string, env: Record<string, string>, bounds: { timeoutMs: number; admissionTimeoutMs?: number; maxOutputBytes: number; stopOnOutputLimit: boolean }, extra: { locks: string[]; check(): Promise<void> }, signal?: AbortSignal, onStarted?: (identity: OwnedIdentity) => void): Promise<OwnedResult> {
    const files = inventory.files.map(file => join(runtime, file.path)); const node = this.config.nodePath;
    const task = this.run({ executable: node, args, cwd, env, timeoutMs: bounds.timeoutMs, maxOutputBytes: bounds.maxOutputBytes }, signal, {
      readLocks: [node, ...extra.locks, ...files], stopOnOutputLimit: bounds.stopOnOutputLimit, ...(onStarted ? { onStarted } : {}), ...(bounds.admissionTimeoutMs === undefined ? {} : { admissionTimeoutMs: bounds.admissionTimeoutMs }),
      beforeStart: async () => {
        checkAbort(signal);
        // Node and the staged runtime are the installation: a file that grew, was swapped or was linked is not an input error.
        try {
          if (hash(await capturedFile(node, 256 * 1024 ** 2)) !== this.config.nodeSha256) throw new Error('INSTALLATION_INVALID');
          for (let index = 0; index < files.length; index++) {
            checkAbort(signal); const file = inventory.files[index]!;
            if (hash(await capturedFile(files[index]!, file.size)) !== file.sha256) throw new Error('INSTALLATION_INVALID');
          }
        } catch (error) { checkAbort(signal); throw error instanceof Error && error.message === 'INSTALLATION_INVALID' ? error : new Error('INSTALLATION_INVALID', { cause: error }); }
        await extra.check();
      },
    });
    this.launches.add(task); void task.catch(() => {}).finally(() => this.launches.delete(task));
    return task;
  }
  private async inspectOwned(bytes: Buffer, clientRef: string, signal?: AbortSignal): Promise<Report> {
    checkAbort(signal); if (bytes.length > MAX_ARCHIVE) throw new Error('INPUT_LIMIT');
    BindingSchema.shape.clientRef.parse(clientRef);
    const runtime = await this.prepare(signal);
    const work = await privateDirectory(join(this.config.storageRoot, 'work', randomUUID()));
    try {
      const artifact = join(work, 'artifact.zip'); await writeFile(artifact, bytes, { flag: 'wx' });
      const temporary = await privateDirectory(join(work, 'temp'));
      const expected = hash(bytes);
      const result = await this.guardedRun(runtime, ['--max-old-space-size=256', join(runtime, 'bin/artifact.mjs'), 'validate', '--file', artifact, '--expect-client-ref', clientRef, '--json'], work, validatorEnvironment(temporary), { timeoutMs: 60000, maxOutputBytes: MAX_OUTPUT, stopOnOutputLimit: true }, {
        locks: [artifact], check: async () => { if (hash(await capturedFile(artifact, MAX_ARCHIVE)) !== expected) throw new Error('ARTIFACT_INVALID'); },
      }, signal);
      checkAbort(signal); return parseValidatorReport(result);
    } finally { await removeOwned(this.config.storageRoot, work); }
  }
  /** Internal diagnostic boundary: raw external findings never cross renderer IPC. */
  inspect(bytes: Buffer, clientRef: string, signal?: AbortSignal) {
    // Copy on entry: the caller cannot change a shared Buffer while validation awaits I/O.
    if (bytes.length > MAX_ARCHIVE) return Promise.reject(new Error('INPUT_LIMIT'));
    const captured = Buffer.from(bytes);
    return serialized(this.config.storageRoot, () => this.inspectOwned(captured, clientRef, signal));
  }
  validate(file: string, input: Binding, signal?: AbortSignal): Promise<Result> {
    const binding = BindingSchema.parse(input);
    return serialized(this.config.storageRoot, async () => {
      try {
        checkAbort(signal); const bytes = await capturedFile(file, MAX_ARCHIVE);
        const manifestValue = await packageContent(() => inspectArchive(bytes));
        const report = await this.inspectOwned(bytes, binding.clientRef, signal);
        if (report.status !== 'PASS') return ResultSchema.parse({ status: report.status, state: null, researchReady: false, receipt: null, error: 'ARTIFACT_INVALID' });
        const manifest = await packageContent(() => ManifestProjection.parse(manifestValue));
        for (const key of ['repository', 'ref', 'commit', 'workflow', 'workflowRunId', 'runAttempt'] as const) if (manifest.source[key] !== binding[key]) throw new Error('IDENTITY_MISMATCH');
        if (manifest.clientRef !== binding.clientRef || report.clientRef !== binding.clientRef || report.workflowRunId !== binding.workflowRunId || report.packageId !== manifest.packageId) throw new Error('IDENTITY_MISMATCH');
        const state = StateSchema.parse(manifest.state === 'HUMAN_REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : manifest.state);
        if (report.state !== state || report.buildAuthorized !== manifest.buildAuthorized || report.reviewedBy !== (manifest.review.by ?? 'undeclared')) throw new Error('ARTIFACT_INVALID');
        const researchReady = state === 'APPROVED_BRIEF' && manifest.kind === 'APPROVED_RESEARCH' && manifest.buildAuthorized && manifest.review.mapClassified && manifest.review.findingsReviewed && manifest.review.briefReviewed && manifest.gate.verdict === 'PASS' && manifest.gate.buildAuthorized && manifest.gate.blockingFindings.length === 0;
        if (manifest.buildAuthorized !== researchReady) throw new Error('ARTIFACT_INVALID');
        checkAbort(signal);
        const artifactSha256 = hash(bytes); const store = await privateDirectory(join(this.config.storageRoot, 'artifacts'));
        const destination = join(store, artifactSha256 + '.zip');
        // The name is the digest of bytes just verified, so a file under it with other bytes (torn by a crash mid-write,
        // or altered) is replaced, never trusted. Anything else wrong in the store is this machine's fault and defers.
        let intact = false;
        try { intact = hash(await capturedFile(destination, MAX_ARCHIVE)) === artifactSha256; }
        catch (error) { if (!missing(error) && !(error instanceof Error && error.message === 'INPUT_LIMIT')) throw new Error('INSTALLATION_INVALID', { cause: error }); }
        if (!intact) {
          let total = 0;
          for (const name of await readdir(store)) {
            const info = await lstat(join(store, name)); if (!info.isFile() || info.isSymbolicLink()) throw new Error('INSTALLATION_INVALID');
            if (name !== artifactSha256 + '.zip') total += info.size;
          }
          if (total + bytes.length > 128 * 1024 ** 2) throw new Error('STORAGE_LIMIT');
          // Written in full and synced under work/ (swept at start, same volume), then replaced by rename. On Windows that is
          // MoveFileExW(MOVEFILE_REPLACE_EXISTING), with no documented crash-atomicity guarantee: the check above, which replaces
          // a file whose bytes do not hash to its name, is what keeps a torn file from blocking validation.
          const temporary = join(await privateDirectory(join(this.config.storageRoot, 'work')), randomUUID() + '.zip');
          try {
            const handle = await open(temporary, 'wx');
            try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
            await rename(temporary, destination);
          } finally { await rm(temporary, { force: true }); }
        }
        checkAbort(signal);
        const receipt = ReceiptSchema.parse({ id: randomUUID(), artifactSha256, artifactBytes: bytes.length, validatorRevision: VALIDATOR_REVISION, nodeSha256: this.config.nodeSha256, binding, state, researchReady });
        this.receipts.set(receipt.id, structuredClone(receipt));
        return ResultSchema.parse({ status: 'PASS', state, researchReady, receipt, error: null });
      } catch (error) {
        // Any other unclassified failure is this machine's (the helper, a spawn, the input file or the store), never the package's.
        return ResultSchema.parse({ status: 'BLOCKED', state: null, researchReady: false, receipt: null, error: signal?.aborted ? 'CANCELLED' : failureOf(error) ?? 'INSTALLATION_INVALID' });
      }
    });
  }
  readVerified(id: string, current: Binding): Promise<Buffer> {
    const binding = BindingSchema.parse(current);
    return serialized(this.config.storageRoot, async () => {
      const receipt = this.receipts.get(id);
      if (!receipt || JSON.stringify(receipt.binding) !== JSON.stringify(binding)) throw new Error('STALE_VERIFICATION');
      try {
        const bytes = await capturedFile(join(this.config.storageRoot, 'artifacts', receipt.artifactSha256 + '.zip'), MAX_ARCHIVE);
        if (bytes.length !== receipt.artifactBytes || hash(bytes) !== receipt.artifactSha256) throw new Error('STALE_VERIFICATION');
        return bytes;
      } catch { this.receipts.delete(id); throw new Error('STALE_VERIFICATION'); }
    });
  }
  /**
   * A collector launch. Staging is serialized with validation; the child is not, so a watch of up to 30 minutes never
   * blocks a validation. Each launch gets its own folder under storage/collect, removed by dispose().
   */
  async prepareCollector(signal?: AbortSignal): Promise<CollectorLaunch> {
    const runtime = await serialized(this.config.storageRoot, () => this.prepare(signal));
    const folder = await privateDirectory(join(this.config.storageRoot, 'collect', randomUUID()));
    const temp = await privateDirectory(join(folder, 'temp')); const out = await privateDirectory(join(folder, 'out'));
    return {
      node: this.config.nodePath, script: join(runtime, 'bin/collect-remote.mjs'), out, temp,
      start: (args, env, options) => this.guardedRun(runtime, [...args], folder, env, { timeoutMs: options.timeoutMs, admissionTimeoutMs: options.admissionTimeoutMs, maxOutputBytes: options.maxOutputBytes, stopOnOutputLimit: false }, { locks: [], check: options.admit }, options.signal, options.onStarted),
      dispose: () => removeOwned(this.config.storageRoot, folder),
    };
  }
  /**
   * A review launch (Task 5). Staging is serialized with validation, as for the collector; the child is not. The
   * environment is the validator's, pointed at the caller's private temp folder, so no machine config is found.
   */
  async prepareReview(signal?: AbortSignal): Promise<ReviewLaunch> {
    const runtime = await serialized(this.config.storageRoot, () => this.prepare(signal));
    const root = await privateDirectory(join(this.config.storageRoot, 'review'));
    return {
      root,
      run: (tool, options) => {
        const script = join(runtime, 'bin', tool.tool === 'preflight' ? 'preflight.mjs' : tool.tool === 'brief' ? 'brief.mjs' : 'artifact.mjs');
        const args = tool.tool === 'preflight' ? ['--json'] : tool.tool === 'brief' ? (tool.force ? ['--force'] : []) : createArgs(tool.root, tool.output, tool.identity);
        const bounds = REVIEW_BOUNDS[tool.tool];
        return this.guardedRun(runtime, ['--max-old-space-size=256', script, ...args], options.cwd, validatorEnvironment(options.temp), { ...bounds, stopOnOutputLimit: true }, { locks: options.locks, check: options.check }, options.signal);
      },
    };
  }
  /**
   * The verified bytes of a retained package: a fresh validation of storage/artifacts/<sha256>.zip under the binding,
   * whose receipt must name that same digest. Throws STALE_VERIFICATION, or INSTALLATION_INVALID for this machine's fault.
   */
  async verifyRetained(artifactSha256: string, binding: Binding, signal?: AbortSignal): Promise<{ receipt: Receipt; bytes: Buffer }> {
    DigestSchema.parse(artifactSha256);
    const file = join(this.config.storageRoot, 'artifacts', artifactSha256 + '.zip');
    // A retained package that is gone (purged, or never retained here) is a stale verification, not a broken installation.
    try { await lstat(file); } catch (error) { if (missing(error)) throw new Error('STALE_VERIFICATION', { cause: error }); throw new Error('INSTALLATION_INVALID', { cause: error }); }
    const result = await this.validate(file, binding, signal);
    if (result.status !== 'PASS' || !result.receipt) throw new Error(result.error === 'INSTALLATION_INVALID' ? 'INSTALLATION_INVALID' : result.error === 'CANCELLED' ? 'CANCELLED' : 'STALE_VERIFICATION');
    if (result.receipt.artifactSha256 !== artifactSha256) throw new Error('STALE_VERIFICATION');
    return { receipt: result.receipt, bytes: await this.readVerified(result.receipt.id, binding) };
  }
  /** Removes storage/review/<name> for each name recovery returned, under the same lock as sweep. Plain names only. */
  discardReview(names: readonly string[]): Promise<void> {
    return serialized(this.config.storageRoot, async () => {
      for (const name of names) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(name)) continue;
        await removeOwned(this.config.storageRoot, join(this.config.storageRoot, 'review', name));
      }
    });
  }
  /**
   * At startup, before any launch: removes staged runtimes, validation work and collector folders a crash left. Under
   * storage/review it keeps every job's project/ and removes the per-attempt staging, scratch, out and temp folders; whole
   * job folders are removed later, only once recovery names them (discardReview).
   */
  sweep(): Promise<void> {
    return serialized(this.config.storageRoot, async () => {
      if (this.runtime || this.launches.size) throw new Error('KIT_BUSY');
      for (const name of ['runtime', 'work', 'collect']) await removeOwned(this.config.storageRoot, join(this.config.storageRoot, name));
      const review = join(this.config.storageRoot, 'review');
      let jobs: string[] = [];
      try { jobs = await readdir(review); } catch (error) { if (!missing(error)) throw error; }
      for (const job of jobs) {
        const folder = join(review, job); const info = await lstat(folder);
        if (!info.isDirectory() || info.isSymbolicLink()) { await removeOwned(this.config.storageRoot, folder); continue; }
        for (const name of await readdir(folder)) if (/^(staging|scratch|out|temp)-/.test(name)) await removeOwned(this.config.storageRoot, join(folder, name));
      }
    });
  }
  /** Waits for every launched child first: on Windows their read locks would make the runtime undeletable. */
  close(): Promise<void> {
    return serialized(this.config.storageRoot, async () => {
      while (this.launches.size) await Promise.allSettled([...this.launches]);
      this.receipts.clear(); if (this.runtime) { await removeOwned(this.config.storageRoot, this.runtime); this.runtime = undefined; }
    });
  }
}
