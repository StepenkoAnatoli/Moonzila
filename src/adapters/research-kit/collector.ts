import { z } from 'zod';
import { windowsCommandLine, type OwnedResult } from '../../tools/commands';
import { StateSchema } from './contracts';
import { validatorEnvironment } from './adapter';

/**
 * The pinned Research Kit collector (bin/collect-remote.mjs) as Moonzila drives it: argv, environment and the
 * reading of its one --json line. Pure: no file system, no process. The kit's free text (error, remedy, URLs, file
 * names, findings) is bounds-checked and dropped, because under --json the kit does not redact it; only codes,
 * numbers, an allowlisted conclusion and a state survive classification.
 */
export const COLLECTOR_LIMITS = {
  dispatchTimeoutMs: 120_000, dispatchOutputBytes: 65_536,
  watchKitSeconds: 1_500, watchMarginMs: 300_000, watchOutputBytes: 4_194_304,
  admissionMs: 60_000, maxCommandLine: 32_766,
  preStartAttempts: 3, backoffFirstMs: 30_000, backoffMaxMs: 900_000, stillRunningDelayMs: 5_000,
  watchDeadlineMs: 604_800_000, grantMs: 30_000, quitDrainMs: 15_000,
} as const;
/** Every DispatchError code in the pinned lib/dispatch.mjs, plus UNKNOWN from collect-remote. */
export const KIT_CODES = ['REPOSITORY', 'TOKEN', 'NETWORK', 'NO_RUN_ID', 'NOT_FOUND', 'FORBIDDEN', 'HTTP', 'UNKNOWN', 'TIMEOUT', 'BAD_BODY', 'NO_ARTIFACT', 'EXPIRED', 'ARTIFACT_NAME', 'OUT_DIR'] as const;
export type KitCode = typeof KIT_CODES[number];
const CONCLUSIONS = ['failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale', 'startup_failure'] as const;
export type Conclusion = typeof CONCLUSIONS[number];
export type KitState = z.infer<typeof StateSchema>;

export interface CollectorTarget { collectorRevision: number; repository: string; workflow: string; ref: string }
export interface CollectorJob { topic: string; clientRef: string; inputs: { queries: string[]; urls: string[]; preferDomains: string[]; depth: 'probe' | 'quick' | 'normal'; maxPages: number } }
const NODE_OPTIONS = ['--max-old-space-size=256'] as const;

/** One --name=value element per value: the kit splits at the first '=', so a value can never be read as a flag. */
export function dispatchArgs(script: string, job: CollectorJob, target: CollectorTarget): string[] {
  const { inputs } = job;
  return [...NODE_OPTIONS, script,
    `--repository=${target.repository}`, `--workflow=${target.workflow}`, `--ref=${target.ref}`,
    // Explicit, so the dispatch body never follows a kit default that may change with a re-pin.
    '--runner=ubuntu-latest', '--search-transport=auto', `--depth=${inputs.depth}`, `--max-pages=${inputs.maxPages}`,
    `--client-ref=${job.clientRef}`, `--topic=${job.topic}`,
    ...inputs.queries.map(query => `--query=${query}`), ...inputs.urls.map(url => `--url=${url}`),
    ...(inputs.preferDomains.length ? [`--prefer=${inputs.preferDomains.join(',')}`] : []),
    '--no-wait', '--json'];
}
/** A watch picks up the recorded run. It has no topic parameter, so it cannot dispatch another run. */
export function watchArgs(script: string, job: { repository: string; workflowRunId: string; clientRef: string }, out: string, kitSeconds: number): string[] {
  if (!Number.isSafeInteger(kitSeconds) || kitSeconds < 1) throw new Error('COLLECTOR_LIMIT_INVALID');
  return [...NODE_OPTIONS, script, `--repository=${job.repository}`, `--run-id=${job.workflowRunId}`, `--client-ref=${job.clientRef}`, `--out=${out}`, `--timeout=${kitSeconds}`, '--json'];
}
/** The kit's --timeout for a watch, and the owned bound around it. */
export function watchBounds(msLeft: number): { kitSeconds: number; ownedTimeoutMs: number } {
  const kitSeconds = Math.max(1, Math.min(COLLECTOR_LIMITS.watchKitSeconds, Math.floor(msLeft / 1000)));
  return { kitSeconds, ownedTimeoutMs: Math.min(3_600_000, kitSeconds * 1000 + COLLECTOR_LIMITS.watchMarginMs) };
}
/** CreateProcessW's documented limit is 32,767 characters including the terminating NUL. */
export function commandLineFits(node: string, args: readonly string[]): boolean { return windowsCommandLine(node, args).length <= COLLECTOR_LIMITS.maxCommandLine; }

const TokenSchema = z.string().regex(/^[\x21-\x7E]{1,16384}$/);
/** Exactly the validator's minimal environment plus the token. Nothing is inherited: no PATH, proxy, CA or GITHUB_TOKEN. */
export function collectorEnvironment(temp: string, token: string, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (!TokenSchema.safeParse(token).success) throw new Error('COLLECTOR_TOKEN_INVALID');
  return { ...validatorEnvironment(temp, source), RESEARCH_KIT_GITHUB_TOKEN: token };
}
/** The file the watch saves: the runner names the artifact research-kit-corpus-v1-<client_ref> (collect.yml). */
export function packageFileName(clientRef: string): string { return `research-kit-corpus-v1-${clientRef}.zip`; }

// ---------------------------------------------------------------- reading the kit's last line

const Text = z.string().max(65_536);
const RunId = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const Dispatched = z.object({ htmlUrl: Text.nullable(), runUrl: Text.nullable(), waited: z.literal(false), workflowRunId: RunId }).strict();
const KitError = z.object({ error: Text, code: Text, remedy: Text.nullable().optional(), workflowRunId: RunId.optional() }).strict();
const NoToken = z.object({ error: Text.startsWith('no GitHub token in the environment'), remedy: Text }).strict();
const Concluded = z.object({ error: Text.regex(/^the run finished \S{1,64}$/), workflowRunId: RunId, htmlUrl: Text.nullable().optional(), remedy: Text }).strict();
const Finding = z.object({ code: Text, message: Text, path: Text.nullable().optional(), remedy: Text.nullable().optional() }).passthrough();
const Reported = z.object({
  status: z.enum(['PASS', 'FAIL', 'INCOMPLETE', 'BLOCKED']), state: z.string().max(64).nullable(), buildAuthorized: z.boolean(), clientRef: Text.nullable(),
  errors: z.array(Finding).max(10_000), warnings: z.array(Finding).max(10_000), packageId: Text.nullable(), reviewedBy: Text.nullable(),
  file: Text, workflowRunId: RunId, htmlUrl: Text.nullable().optional(), apiVersion: Text,
}).strict();

export type KitLine =
  | { kind: 'dispatched'; workflowRunId: number }
  | { kind: 'error'; code: KitCode | 'OTHER'; httpStatus?: number; httpCall?: 'dispatch' | 'run' | 'artifacts' | 'download' }
  | { kind: 'noToken' }
  | { kind: 'concluded'; conclusion: Conclusion | null }
  | { kind: 'report'; status: 'PASS' | 'FAIL' | 'INCOMPLETE' | 'BLOCKED'; state: KitState | null; buildAuthorized: boolean; clientRef: string | null; firstErrorCode: string | null }
  | { kind: 'text' } | { kind: 'empty' } | { kind: 'invalid' };

const HTTP_CALLS: Array<[RegExp, 'dispatch' | 'run' | 'artifacts' | 'download']> = [
  [/^HTTP: dispatch failed: HTTP (\d{3})\./, 'dispatch'],
  [/^HTTP: could not read run \d{1,20}: HTTP (\d{3})$/, 'run'],
  [/^HTTP: could not list artifacts for run \d{1,20}: HTTP (\d{3})$/, 'artifacts'],
  [/^HTTP: could not download artifact \d{1,20}: HTTP (\d{3})$/, 'download'],
];

/** The kit prints one payload as its last line under --json. Only typed fields leave this function. */
export function parseKitLine(output: string): KitLine {
  const line = output.split(/\r?\n/).map(value => value.trim()).filter(Boolean).at(-1);
  if (line === undefined) return { kind: 'empty' };
  let value: unknown;
  try { value = JSON.parse(line); } catch { return { kind: 'text' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'text' };
  const dispatched = Dispatched.safeParse(value);
  if (dispatched.success) return { kind: 'dispatched', workflowRunId: dispatched.data.workflowRunId };
  const error = KitError.safeParse(value);
  if (error.success) {
    const code = (KIT_CODES as readonly string[]).includes(error.data.code) ? error.data.code as KitCode : 'OTHER';
    if (code !== 'HTTP') return { kind: 'error', code };
    for (const [pattern, httpCall] of HTTP_CALLS) {
      const match = pattern.exec(error.data.error);
      if (match) return { kind: 'error', code, httpStatus: Number(match[1]), httpCall };
    }
    return { kind: 'error', code };
  }
  if (NoToken.safeParse(value).success) return { kind: 'noToken' };
  const concluded = Concluded.safeParse(value);
  if (concluded.success) {
    const conclusion = concluded.data.error.slice('the run finished '.length);
    return { kind: 'concluded', conclusion: (CONCLUSIONS as readonly string[]).includes(conclusion) ? conclusion as Conclusion : null };
  }
  const report = Reported.safeParse(value);
  if (report.success) {
    const { status, buildAuthorized, clientRef } = report.data;
    const state = StateSchema.safeParse(report.data.state);
    const first = report.data.errors[0]?.code;
    return { kind: 'report', status, state: state.success ? state.data : null, buildAuthorized, clientRef, firstErrorCode: first !== undefined && /^[A-Z][A-Z0-9-]{1,59}$/.test(first) ? first : null };
  }
  return { kind: 'invalid' };
}

// ---------------------------------------------------------------- classification

export type LaunchRefusal = 'INSTALLATION_INVALID' | 'ADMISSION_REFUSED' | 'COLLECTOR_CHANGED' | 'CREDENTIAL_DENIED' | 'HELD' | 'STOPPED' | 'ENGINE_UNAVAILABLE' | 'LAUNCH_FAILED';
/** One launch attempt. `started` is true only when the helper reported the child before it ran. */
export interface CollectorAttempt { started: boolean; result?: OwnedResult; refusal?: LaunchRefusal }
export type DispatchOutcome =
  | { kind: 'notLaunched'; refusal: LaunchRefusal }
  | { kind: 'dispatched'; workflowRunId: string }
  | { kind: 'notDispatched'; failure: string; cause: string }
  | { kind: 'ambiguous'; cause: string };

const kitCause = (code: string) => `KIT_${code}`;
/** A cause must match ResearchCodeSchema: a negative or missing exit code gets a spelled-out name, not a minus sign. */
const exitCause = (code: number | null) => `KIT_EXIT_${code === null ? 'NONE' : code < 0 ? `NEG${-code}` : code}`;
const rejected = (status: number) => status >= 400 && status <= 499 && status !== 408 && status !== 429;

/**
 * Table A. Only `notLaunched` may lead to another launch: it is returned only when no child ran. Every outcome
 * that a remote run might sit behind is `ambiguous`, which fails the job as REMOTE_STATE_UNKNOWN and never re-dispatches.
 */
export function classifyDispatch(attempt: CollectorAttempt): DispatchOutcome {
  const { result } = attempt;
  if (!result) return attempt.started ? { kind: 'ambiguous', cause: 'HELPER_FAILED' } : { kind: 'notLaunched', refusal: attempt.refusal ?? 'LAUNCH_FAILED' };
  if (result.status === 'unknown') return { kind: 'ambiguous', cause: 'HELPER_UNKNOWN' };
  if (result.status === 'failed') return attempt.started ? { kind: 'ambiguous', cause: 'HELPER_FAILED' } : { kind: 'notLaunched', refusal: attempt.refusal ?? 'LAUNCH_FAILED' };
  if (!attempt.started) return { kind: 'ambiguous', cause: 'HELPER_UNKNOWN' };
  const line = result.truncated ? undefined : parseKitLine(result.output);
  if (result.code === 0) {
    if (line?.kind === 'dispatched') return { kind: 'dispatched', workflowRunId: String(line.workflowRunId) };
    return { kind: 'ambiguous', cause: result.truncated ? 'KIT_OUTPUT_LIMIT' : 'KIT_OUTPUT_INVALID' };
  }
  if (result.truncated) return { kind: 'ambiguous', cause: 'KIT_OUTPUT_LIMIT' };
  if (result.code === 1 && (result.timedOut || result.cancelled)) return { kind: 'ambiguous', cause: result.timedOut ? 'OWNED_TIMEOUT' : 'OWNED_STOPPED' };
  if (result.code !== 3 || !line) return { kind: 'ambiguous', cause: exitCause(result.code) };
  // Exit 3 is the kit's "could not start": every row below that names a cause is decided before or by GitHub's refusal.
  if (line.kind === 'noToken') return { kind: 'notDispatched', failure: 'COLLECTOR_TOKEN_MISSING', cause: 'KIT_NO_TOKEN' };
  if (line.kind === 'text') return { kind: 'notDispatched', failure: 'COLLECTOR_REFUSED', cause: 'KIT_REFUSED' };
  if (line.kind === 'empty') return { kind: 'ambiguous', cause: 'KIT_EXIT_3' };
  if (line.kind !== 'error') return { kind: 'ambiguous', cause: 'KIT_OUTPUT_INVALID' };
  switch (line.code) {
    case 'REPOSITORY': return { kind: 'notDispatched', failure: 'COLLECTOR_REFUSED', cause: 'KIT_REPOSITORY' };
    case 'TOKEN': return { kind: 'notDispatched', failure: 'COLLECTOR_TOKEN_MISSING', cause: 'KIT_TOKEN' };
    case 'NOT_FOUND': return { kind: 'notDispatched', failure: 'COLLECTOR_NOT_FOUND', cause: 'KIT_NOT_FOUND' };
    case 'FORBIDDEN': return { kind: 'notDispatched', failure: 'COLLECTOR_FORBIDDEN', cause: 'KIT_FORBIDDEN' };
    case 'HTTP':
      if (line.httpCall === 'dispatch' && line.httpStatus === 401) return { kind: 'notDispatched', failure: 'COLLECTOR_TOKEN_REJECTED', cause: 'KIT_HTTP_401' };
      if (line.httpCall === 'dispatch' && line.httpStatus !== undefined && rejected(line.httpStatus)) return { kind: 'notDispatched', failure: 'COLLECTOR_REJECTED', cause: `KIT_HTTP_${line.httpStatus}` };
      return { kind: 'ambiguous', cause: line.httpStatus === undefined ? 'KIT_HTTP' : `KIT_HTTP_${line.httpStatus}` };
    default: return { kind: 'ambiguous', cause: kitCause(line.code) };
  }
}

export type PackageCheck = 'present' | 'absent' | 'unexpected';
export type WatchOutcome =
  | { kind: 'notLaunched'; refusal: LaunchRefusal }
  | { kind: 'package'; state: 'REVIEW_REQUIRED' | 'REVIEW_IN_PROGRESS' | 'PREFLIGHT_BLOCKED' }
  | { kind: 'runFailed'; failure: string; cause: string }
  | { kind: 'stillRunning' }
  | { kind: 'transient'; cause: string }
  | { kind: 'park'; reason: 'kit' | 'credentials'; cause: string };
const REVIEWABLE = new Set<KitState>(['REVIEW_REQUIRED', 'REVIEW_IN_PROGRESS', 'PREFLIGHT_BLOCKED']);
const EXPECTED_EXIT = { PASS: 0, FAIL: 1, INCOMPLETE: 2, BLOCKED: 2 } as const;

/**
 * Table B. `job.pastRetention` is true once the artifact's retention (collect.yml: 7 days) has passed: GitHub no
 * longer lists an expired artifact (since 2026-09-24), so NO_ARTIFACT then means expired, not missing.
 * `pkg` is what main found in the out directory after exit; the kit's own `file` and run id are never used.
 */
export function classifyWatch(attempt: CollectorAttempt, job: { clientRef: string; pastRetention: boolean }, pkg: PackageCheck): WatchOutcome {
  const { result } = attempt;
  if (!result) return { kind: 'notLaunched', refusal: attempt.refusal ?? 'LAUNCH_FAILED' };
  if (result.status === 'unknown') return { kind: 'transient', cause: 'HELPER_UNKNOWN' };
  if (result.status === 'failed') return attempt.started ? { kind: 'transient', cause: 'HELPER_FAILED' } : { kind: 'notLaunched', refusal: attempt.refusal ?? 'LAUNCH_FAILED' };
  if (result.truncated) return { kind: 'transient', cause: 'KIT_OUTPUT_LIMIT' };
  if (result.timedOut) return { kind: 'transient', cause: 'OWNED_TIMEOUT' };
  if (result.cancelled) return { kind: 'transient', cause: 'OWNED_STOPPED' };
  const line = parseKitLine(result.output);
  if (line.kind === 'report') {
    if (result.code !== EXPECTED_EXIT[line.status]) return { kind: 'transient', cause: 'KIT_OUTPUT_INVALID' };
    if (line.status === 'FAIL') return { kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: line.firstErrorCode ? kitCause(line.firstErrorCode.replaceAll('-', '_')) : 'KIT_FAIL' };
    if (line.status !== 'PASS') return { kind: 'runFailed', failure: 'ARTIFACT_INCOMPLETE', cause: line.status === 'BLOCKED' ? 'KIT_BLOCKED' : 'KIT_INCOMPLETE' };
    // A fresh collection is never authorized; one that says so is refused whatever else it says.
    if (line.buildAuthorized || line.state === 'APPROVED_BRIEF') return { kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'KIT_UNEXPECTED_APPROVAL' };
    if (line.clientRef !== job.clientRef) return { kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'IDENTITY_MISMATCH' };
    if (line.state === 'COLLECTION_FAILED') return { kind: 'runFailed', failure: 'COLLECTION_FAILED', cause: 'KIT_COLLECTION_FAILED' };
    if (line.state === null || !REVIEWABLE.has(line.state)) return { kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'KIT_STATE_UNKNOWN' };
    if (pkg !== 'present') return { kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'PACKAGE_NAME_UNEXPECTED' };
    return { kind: 'package', state: line.state as 'REVIEW_REQUIRED' | 'REVIEW_IN_PROGRESS' | 'PREFLIGHT_BLOCKED' };
  }
  if (result.code === 4) return line.kind === 'error' && line.code === 'TIMEOUT' ? { kind: 'stillRunning' } : { kind: 'transient', cause: 'KIT_OUTPUT_INVALID' };
  if (result.code === 2) {
    if (line.kind === 'concluded') return { kind: 'runFailed', failure: 'RUN_FAILED', cause: line.conclusion ? `RUN_${line.conclusion.toUpperCase()}` : 'RUN_CONCLUDED' };
    if (line.kind !== 'error') return { kind: 'transient', cause: 'KIT_OUTPUT_INVALID' };
    switch (line.code) {
      case 'NO_ARTIFACT': return { kind: 'runFailed', failure: job.pastRetention ? 'ARTIFACT_EXPIRED' : 'ARTIFACT_MISSING', cause: 'KIT_NO_ARTIFACT' };
      case 'EXPIRED': return { kind: 'runFailed', failure: 'ARTIFACT_EXPIRED', cause: 'KIT_EXPIRED' };
      case 'ARTIFACT_NAME': return { kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'KIT_ARTIFACT_NAME' };
      case 'HTTP':
        // A refusal a retry cannot change waits for the user: new credentials, or the run is gone (retention).
        if (line.httpStatus !== undefined && rejected(line.httpStatus)) return { kind: 'park', reason: 'credentials', cause: `KIT_HTTP_${line.httpStatus}` };
        return { kind: 'transient', cause: line.httpStatus === undefined ? 'KIT_HTTP' : `KIT_HTTP_${line.httpStatus}` };
      default: return { kind: 'transient', cause: kitCause(line.code) };
    }
  }
  if (result.code === 3) {
    if (line.kind === 'noToken') return { kind: 'park', reason: 'credentials', cause: 'KIT_NO_TOKEN' };
    if (line.kind === 'error' && line.code === 'TOKEN') return { kind: 'park', reason: 'credentials', cause: 'KIT_TOKEN' };
    return { kind: 'park', reason: 'kit', cause: line.kind === 'error' ? kitCause(line.code) : line.kind === 'text' ? 'KIT_REFUSED' : 'KIT_EXIT_3' };
  }
  return { kind: 'transient', cause: exitCause(result.code) };
}
