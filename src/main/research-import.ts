import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ResearchVerificationSchema } from '../engine/research';
import { shortResearchRef } from '../engine/research-state';
import type { Binding, Result } from '../adapters/research-kit/contracts';
import type { CollectorConfig } from './collector-settings';
import type { ImportOutcome, PackageHandoff } from './collector';
import type { Vault } from './vault';

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export interface ImportDeps {
  epoch(): string; vault: Pick<Vault, 'grant' | 'withSecret' | 'revokeContext'>;
  settings: { current(): CollectorConfig | null };
  kit: { validate(file: string, binding: Binding, signal?: AbortSignal): Promise<Result> } | null;
  fetch?: Fetcher; now?(): number;
  /**
   * The workflow name the package records. The kit's collect.yml always passes the literal `collect.yml`, whatever the
   * collector's workflow file is called; the recorded fixtures carry a synthetic name instead.
   */
  packageWorkflow?: string;
}

const RUN_TIMEOUT_MS = 20_000; const RUN_MAX_BYTES = 1024 * 1024; const GRANT_MS = 30_000;
/** Only the fields verification reads; the rest of GitHub's run object is dropped. */
const RunSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), run_attempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  head_sha: z.string().regex(/^[0-9a-f]{40}$/), head_branch: z.string().max(255).nullable(), path: z.string().max(1024), event: z.string().max(64),
  status: z.string().max(32).nullable(), repository: z.object({ full_name: z.string().max(256) }),
});
type Run = z.infer<typeof RunSchema>;
const DEFERRED: ImportOutcome = { kind: 'deferred' };
const reject = (failure: string, cause: string): ImportOutcome => ({ kind: 'rejected', failure, cause });

/**
 * One bounded, authenticated GET of the run. The token is used only in this request's Authorization header; a redirect
 * is refused so it is never sent on, and every failure is a code without response text.
 */
async function readRun(fetcher: Fetcher, repository: string, runId: string, token: string, stop: AbortSignal): Promise<Run> {
  const [owner, repo] = repository.split('/') as [string, string];
  const signal = AbortSignal.any([stop, AbortSignal.timeout(RUN_TIMEOUT_MS)]);
  const response = await fetcher(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}`, {
    method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', signal,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Monnzila-research-import' },
  });
  try {
    if (!response.ok || !response.body) throw new Error('GITHUB_RUN_UNAVAILABLE');
    if (Number(response.headers.get('content-length') ?? 0) > RUN_MAX_BYTES) throw new Error('GITHUB_RUN_TOO_LARGE');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.byteLength; if (length > RUN_MAX_BYTES) throw new Error('GITHUB_RUN_TOO_LARGE'); chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw new Error('GITHUB_RUN_INVALID'); }
    const run = RunSchema.safeParse(value); if (!run.success) throw new Error('GITHUB_RUN_INVALID');
    return run.data;
  } finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
}

/**
 * Verified import (plan Task 4). Commit and run attempt come from the GitHub run, never from the package being
 * validated; the run must be the one the job dispatched (id, repository, workflow file, ref, workflow_dispatch). The
 * package then passes the pinned validator under the full binding, bound to the job's current revision and admitted
 * policy revision. The supervisor commits the outcome through planStep, so admission and staleness are re-checked there.
 */
export function packageImporter(deps: ImportDeps): (handoff: PackageHandoff) => Promise<ImportOutcome> {
  const fetcher = deps.fetch ?? fetch; const now = deps.now ?? Date.now; const packageWorkflow = deps.packageWorkflow ?? 'collect.yml';
  return async handoff => {
    const config = deps.settings.current(); const kit = deps.kit;
    if (!kit || !config?.secretRef || config.repository !== handoff.target.repository || handoff.signal.aborted) return DEFERRED;
    const binding = { epoch: deps.epoch(), purpose: 'research' as const, contextId: `import:${handoff.researchId}:${randomUUID()}`, secretRef: config.secretRef };
    let run: Run;
    try {
      const grant = deps.vault.grant({ ...binding, expiresAt: now() + GRANT_MS });
      run = await deps.vault.withSecret(grant, binding, token => readRun(fetcher, handoff.target.repository, handoff.workflowRunId, token, handoff.signal));
    } catch { return DEFERRED; } finally { deps.vault.revokeContext(binding.contextId); }
    const target = handoff.target;
    if (run.id !== Number(handoff.workflowRunId) || run.repository.full_name.toLowerCase() !== target.repository.toLowerCase() || run.event !== 'workflow_dispatch'
      || run.path !== `.github/workflows/${target.workflow}` || run.head_branch !== shortResearchRef(target.ref)) return reject('RUN_IDENTITY_MISMATCH', 'IMPORT_RUN_MISMATCH');
    // A re-run in progress has a new attempt that has not packaged yet.
    if (run.status !== 'completed') return DEFERRED;
    const expected: Binding = {
      projectId: handoff.projectId, projectRevision: handoff.projectRevision, jobId: handoff.researchId, jobRevision: handoff.expectedRevision, clientRef: handoff.clientRef,
      repository: run.repository.full_name, ref: run.head_branch, commit: run.head_sha, workflow: packageWorkflow, workflowRunId: run.id, runAttempt: run.run_attempt,
    };
    const result = await kit.validate(handoff.file, expected, handoff.signal);
    if (result.status === 'PASS' && result.receipt) {
      const { receipt } = result;
      if (receipt.researchReady || receipt.state === 'APPROVED_BRIEF') return reject('ARTIFACT_INVALID', 'IMPORT_UNEXPECTED_APPROVAL');
      if (receipt.state === 'COLLECTION_FAILED') return reject('COLLECTION_FAILED', 'IMPORT_COLLECTION_FAILED');
      return { kind: 'verified', verification: ResearchVerificationSchema.parse({
        artifactSha256: receipt.artifactSha256, artifactBytes: receipt.artifactBytes, validatorRevision: receipt.validatorRevision, nodeSha256: receipt.nodeSha256, state: receipt.state,
        jobRevision: expected.jobRevision, projectRevision: expected.projectRevision, repository: expected.repository, ref: expected.ref, workflow: expected.workflow,
        commit: expected.commit, runAttempt: expected.runAttempt, workflowRunId: handoff.workflowRunId, clientRef: expected.clientRef, downloadDigest: 'unverified',
      }) };
    }
    if (result.status === 'FAIL') return reject('ARTIFACT_INVALID', 'IMPORT_FAIL');
    if (result.status === 'INCOMPLETE') return reject('ARTIFACT_INCOMPLETE', 'IMPORT_INCOMPLETE');
    switch (result.error) {
      case 'IDENTITY_MISMATCH': return reject('PACKAGE_IDENTITY_MISMATCH', 'IMPORT_IDENTITY_MISMATCH');
      case 'ARTIFACT_INVALID': return reject('ARTIFACT_INVALID', 'IMPORT_ARTIFACT_INVALID');
      case 'INPUT_LIMIT': return reject('ARTIFACT_INVALID', 'IMPORT_INPUT_LIMIT');
      // Not the package's fault: the installation, the validator's bounds, the retained store or a stop.
      default: return DEFERRED;
    }
  };
}
