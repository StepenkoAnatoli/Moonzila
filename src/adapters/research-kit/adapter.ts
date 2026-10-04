import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
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

/** Errors that are a verdict on the bytes the validator read: the package does not verify. Every other error is no verdict. */
const VERDICTS: ReadonlySet<string> = new Set(['ARTIFACT_INVALID', 'IDENTITY_MISMATCH', 'INPUT_LIMIT']);
/**
 * verifyRetained's code for a validation without a receipt, decided by the bytes the validator itself read (`read`, the
 * SHA-256 of validate's single capture; undefined when the capture failed). INSTALLATION_INVALID and CANCELLED pass
 * through. Bytes that do not hash to the digest name are STALE_VERIFICATION whatever the validator did (a changed file can
 * make it time out or print garbage). Intact bytes with a real verdict are STALE_VERIFICATION; intact bytes with no verdict
 * (TIMEOUT, OUTPUT_LIMIT, VALIDATOR_OUTPUT, STORAGE_LIMIT) are VALIDATOR_UNAVAILABLE: nothing is known about the package.
 * A capture that failed (a link, a second hard link, a file grown past the bound) is the package's: STALE_VERIFICATION.
 */
export function retainedFailure(error: Result['error'], artifactSha256: string, read: string | undefined): string {
  if (error === 'INSTALLATION_INVALID' || error === 'CANCELLED') return error;
  if (read !== artifactSha256) return 'STALE_VERIFICATION';
  return error !== null && VERDICTS.has(error) ? 'STALE_VERIFICATION' : 'VALIDATOR_UNAVAILABLE';
}

export class ResearchKit {
  private readonly config: ResearchConfig;
  private runtime: string | undefined;
  private readonly receipts = new Map<string, Receipt>();
  private readonly launches = new Set<Promise<unknown>>();
  private readonly run: OwnedRunner;
  private readonly unlink: (path: string) => Promise<void>;
  /**
   * `run` is the launcher (the native helper by default); it is not installation input. `files.unlink` is the purge's
   * delete (fs unlink by default), replaceable so a test can answer it as a Windows handle without FILE_SHARE_DELETE does.
   */
  constructor(config: ResearchConfig, run?: OwnedRunner, files: { unlink?: (path: string) => Promise<void> } = {}) {
    this.config = ConfigSchema.parse(config);
    this.unlink = files.unlink ?? unlink;
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
  private async inspectOwned(bytes: Buffer, clientRef: string, signal?: AbortSignal, admit?: () => Promise<void>): Promise<Report> {
    checkAbort(signal); if (bytes.length > MAX_ARCHIVE) throw new Error('INPUT_LIMIT');
    BindingSchema.shape.clientRef.parse(clientRef);
    const runtime = await this.prepare(signal);
    const work = await privateDirectory(join(this.config.storageRoot, 'work', randomUUID()));
    try {
      const artifact = join(work, 'artifact.zip'); await writeFile(artifact, bytes, { flag: 'wx' });
      const temporary = await privateDirectory(join(work, 'temp'));
      const expected = hash(bytes);
      const result = await this.guardedRun(runtime, ['--max-old-space-size=256', join(runtime, 'bin/artifact.mjs'), 'validate', '--file', artifact, '--expect-client-ref', clientRef, '--json'], work, validatorEnvironment(temporary), { timeoutMs: 60000, maxOutputBytes: MAX_OUTPUT, stopOnOutputLimit: true }, {
        locks: [artifact], check: async () => { if (hash(await capturedFile(artifact, MAX_ARCHIVE)) !== expected) throw new Error('ARTIFACT_INVALID'); await admit?.(); },
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
  /**
   * `admit` is the caller's own check, run in the guarded start after the artifact's rehash and before the child exists
   * (the review supervisor re-reads its job there). It refuses by throwing `CANCELLED`; the result is then CANCELLED.
   */
  validate(file: string, input: Binding, signal?: AbortSignal, admit?: () => Promise<void>): Promise<Result> {
    return this.validateCaptured(file, input, {}, signal, admit);
  }
  /** validate, recording in `seen.sha256` the hash of the one capture of `file` it validated (verifyRetained's evidence). */
  private validateCaptured(file: string, input: Binding, seen: { sha256?: string }, signal?: AbortSignal, admit?: () => Promise<void>): Promise<Result> {
    const binding = BindingSchema.parse(input);
    return serialized(this.config.storageRoot, () => this.validateOwned(file, binding, seen, signal, admit));
  }
  /** validateCaptured's body; the caller holds the storage lock. */
  private async validateOwned(file: string, binding: Binding, seen: { sha256?: string }, signal?: AbortSignal, admit?: () => Promise<void>): Promise<Result> {
    try {
      checkAbort(signal); const bytes = await capturedFile(file, MAX_ARCHIVE); seen.sha256 = hash(bytes);
      const manifestValue = await packageContent(() => inspectArchive(bytes));
      const report = await this.inspectOwned(bytes, binding.clientRef, signal, admit);
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
   * whose receipt must name that same digest. The error is decided by the bytes the validator read (`retainedFailure`):
   * - STALE_VERIFICATION: the file is missing, its bytes do not hash to the digest name, or the validator's real verdict
   *   on intact bytes is not PASS (or the bytes changed after validation);
   * - VALIDATOR_UNAVAILABLE (internal, never public): intact bytes and no verdict (timeout, cut-off or unreadable output,
   *   storage limit), or intact bytes this machine then fails to read: nothing is known about the package;
   * - INSTALLATION_INVALID for this machine's installation, CANCELLED for the caller's signal or admission.
   * The check, the validation and the read are one step under the storage lock, so a purge of the same digest runs
   * entirely before or entirely after it (docs/specification/research-purge.md, decision 4).
   */
  async verifyRetained(artifactSha256: string, input: Binding, signal?: AbortSignal, admit?: () => Promise<void>): Promise<{ receipt: Receipt; bytes: Buffer }> {
    DigestSchema.parse(artifactSha256); const binding = BindingSchema.parse(input);
    const file = join(this.config.storageRoot, 'artifacts', artifactSha256 + '.zip');
    return serialized(this.config.storageRoot, async () => {
      // A retained package that is gone (purged, or never retained here) is a stale verification, not a broken installation.
      try { await lstat(file); } catch (error) { if (missing(error)) throw new Error('STALE_VERIFICATION', { cause: error }); throw new Error('INSTALLATION_INVALID', { cause: error }); }
      // The hash comes from validate's own single read of the file, never from a second read (no window between the two).
      const seen: { sha256?: string } = {};
      const result = await this.validateOwned(file, binding, seen, signal, admit);
      if (result.status !== 'PASS' || !result.receipt) throw new Error(retainedFailure(result.error, artifactSha256, seen.sha256));
      if (result.receipt.artifactSha256 !== artifactSha256) throw new Error('STALE_VERIFICATION');
      return { receipt: result.receipt, bytes: await this.readRetained(result.receipt) };
    });
  }
  /**
   * readVerified's read for verifyRetained, telling the package's fault from this machine's. Right after a PASS the file
   * under the digest holds the validated bytes (validate replaces it otherwise). Bytes that no longer hash to the digest, a
   * file gone, linked, hard-linked or grown are the package no longer verifying: STALE_VERIFICATION. A receipt gone (close()
   * at quit) or an I/O error on a file that is still there is this machine's: VALIDATOR_UNAVAILABLE. The caller holds the
   * storage lock.
   */
  private async readRetained(receipt: Receipt): Promise<Buffer> {
    if (!this.receipts.has(receipt.id)) throw new Error('VALIDATOR_UNAVAILABLE');
    let bytes: Buffer;
    try { bytes = await capturedFile(join(this.config.storageRoot, 'artifacts', receipt.artifactSha256 + '.zip'), MAX_ARCHIVE); }
    catch (error) {
      this.receipts.delete(receipt.id);
      const code = error instanceof Error ? error.message : '';
      throw new Error(missing(error) || code === 'ARTIFACT_INVALID' || code === 'INPUT_LIMIT' ? 'STALE_VERIFICATION' : 'VALIDATOR_UNAVAILABLE', { cause: error });
    }
    if (bytes.length !== receipt.artifactBytes || hash(bytes) !== receipt.artifactSha256) { this.receipts.delete(receipt.id); throw new Error('STALE_VERIFICATION'); }
    return bytes;
  }
  /**
   * The purge's locked step (docs/specification/research-purge.md). Under the storage lock: first `plan` (main's read of
   * every job's references and its refusals, made inside this lock, before anything is listed); then the listing of the
   * retained ZIPs - only regular files named `<64 hex>.zip` directly in storage/artifacts, never a link, a folder or any
   * other name - handed to the selector `plan` returned, which names the ones to delete; then the deletes, and the
   * receipts of every digest deleted are forgotten. A digest the selector names that is not listed is ignored.
   * A delete refused with EBUSY or EPERM (Windows: a handle opened without FILE_SHARE_DELETE) is retried once; refused
   * again with either, the purge stops with PURGE_INCOMPLETE (another program holds the file), keeping what it deleted
   * deleted and its receipts forgotten; any other failed delete is thrown as it is (the store's fault). An
   * artifacts folder that is not a real folder of storage is INSTALLATION_INVALID; nothing beneath it is listed.
   * `plan`'s and the selector's own errors pass through unchanged.
   */
  purgeRetained(plan: () => Promise<(stored: readonly string[]) => readonly string[]>): Promise<{ removed: number }> {
    return serialized(this.config.storageRoot, async () => {
      const select = await plan();
      const store = await this.artifactsRoot();
      const stored: string[] = [];
      for (const name of store ? await readdir(store) : []) {
        const match = /^([0-9a-f]{64})\.zip$/.exec(name); if (!match) continue;
        const info = await lstat(join(store!, name));
        if (info.isFile() && !info.isSymbolicLink()) stored.push(match[1]!);
      }
      const listed = new Set(stored);
      const targets = [...new Set(select(stored))].filter(sha => listed.has(sha));
      const deleted = new Set<string>();
      try {
        for (const sha of targets) {
          const file = join(store!, sha + '.zip');
          // Checked again right before the delete: only a regular file under this name, never what a link names.
          let info; try { info = await lstat(file); } catch (error) { if (missing(error)) continue; throw error; }
          if (!info.isFile() || info.isSymbolicLink()) continue;
          try { await this.unlink(file); }
          catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if (code === 'ENOENT') continue;
            if (code !== 'EBUSY' && code !== 'EPERM') throw error;
            await new Promise(done => setTimeout(done, 100));
            try { await this.unlink(file); }
            catch (retry) {
              const again = (retry as NodeJS.ErrnoException)?.code;
              if (again === 'ENOENT') continue;
              throw again === 'EBUSY' || again === 'EPERM' ? new Error('PURGE_INCOMPLETE', { cause: retry }) : retry;
            }
          }
          deleted.add(sha);
        }
      } finally {
        for (const [id, receipt] of this.receipts) if (deleted.has(receipt.artifactSha256)) this.receipts.delete(id);
      }
      return { removed: deleted.size };
    });
  }
  /** storage/artifacts, contained as reviewRoot is: null when absent, INSTALLATION_INVALID when not a real folder of storage. */
  private async artifactsRoot(): Promise<string | null> {
    const store = join(this.config.storageRoot, 'artifacts');
    let info; try { info = await lstat(store); } catch (error) { if (missing(error)) return null; throw new Error('INSTALLATION_INVALID', { cause: error }); }
    const expected = join(await realpath(this.config.storageRoot), 'artifacts'); const actual = await realpath(store);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform === 'win32' ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected)) throw new Error('INSTALLATION_INVALID');
    return store;
  }
  /** Removes storage/review/<name> for each name recovery returned, under the same lock as sweep. Plain names only. */
  discardReview(names: readonly string[]): Promise<void> {
    return serialized(this.config.storageRoot, async () => {
      const review = await this.reviewRoot(); if (!review) return;
      for (const name of names) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(name)) continue;
        await this.removeJobFolder(join(review, name));
      }
    });
  }
  /**
   * storage/review, contained: a real folder (no link or junction) whose realpath is storage's own `review`. Null when it
   * does not exist; otherwise INSTALLATION_INVALID, so nothing beneath a link is ever listed or removed.
   */
  private async reviewRoot(): Promise<string | null> {
    const review = join(this.config.storageRoot, 'review');
    let info; try { info = await lstat(review); } catch (error) { if (missing(error)) return null; throw error; }
    const expected = join(await realpath(this.config.storageRoot), 'review'); const actual = await realpath(review);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform === 'win32' ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected)) throw new Error('INSTALLATION_INVALID');
    return review;
  }
  /** A job folder: a link (or any non-folder) loses only its own entry, never what it points at; a real folder is removed. */
  private async removeJobFolder(folder: string): Promise<void> {
    let info; try { info = await lstat(folder); } catch (error) { if (missing(error)) return; throw error; }
    if (info.isSymbolicLink() || !info.isDirectory()) await unlink(folder);
    else await removeOwned(this.config.storageRoot, folder);
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
      const review = await this.reviewRoot();
      const jobs = review ? await readdir(review) : [];
      for (const job of jobs) {
        const folder = join(review!, job); const info = await lstat(folder);
        if (!info.isDirectory() || info.isSymbolicLink()) { await this.removeJobFolder(folder); continue; }
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
