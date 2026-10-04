import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, test } from 'vitest';
import { Store, type StoreResearchStatus } from '../src/engine/store';
import { ResearchContextSchema, ResearchJobs, ResearchRecoverySchema, ResearchTransitionReplySchema } from '../src/engine/research';
import { ControlSchema, engineFailureCode } from '../src/engine/control';
import { planStep, type Outcome, type Plan } from '../src/main/collector-plan';

const at = '2026-10-02T00:00:00.000Z';
const roots: string[] = []; const stores: Store[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
const target = { collectorRevision: 1, repository: 'owner/collector', workflow: 'collect.yml', ref: 'main' };
const verification = (jobRevision: number) => ({ artifactSha256: 'a'.repeat(64), artifactBytes: 18127, validatorRevision: 'b'.repeat(40), nodeSha256: 'c'.repeat(64), state: 'REVIEW_IN_PROGRESS' as const,
  jobRevision, projectRevision: 1, repository: 'owner/collector', ref: 'main', workflow: 'collect.yml', commit: 'd'.repeat(40), runAttempt: 1, workflowRunId: '41', clientRef: 'mz-j', downloadDigest: 'unverified' as const });
const policy = (revision: number, research: 'off' | 'public-technical' | 'private-connected' = 'public-technical') => ({ revision, inference: 'local-only' as const, research });

type Start = 'queued' | 'dispatching' | 'collecting' | 'cancelling-before-run' | 'cancelling-with-run' | 'collected' | 'failed' | 'cancelled';
type Change = 'none' | 'policy' | 'trust' | 'research-off';
function setup(start: Start, change: Change = 'none') {
  const root = mkdtempSync(join(tmpdir(), 'moon-plan-')); roots.push(root);
  const store = new Store(join(root, 'state.sqlite')); stores.push(store);
  const jobs = new ResearchJobs(store, () => {});
  store.putProject({ id: 'p', name: 'p', rootPath: 'C:\\work\\p', pathLabel: 'p', trusted: true, trustRevision: 1, policy: policy(1), missing: false, createdAt: at });
  store.createResearch({ id: 'j', projectId: 'p', topic: 'Ollama context limits', inputs: { queries: [], urls: [], preferDomains: [], depth: 'quick', maxPages: 8 }, clientRef: 'mz-j', researchLevel: 'public-technical', policyRevision: 1, trustRevision: 1 }, { actor: 'user' });
  const move = (to: StoreResearchStatus, actor: 'main' | 'user' = 'main', patch?: object) => { const job = store.getResearch('j')!; store.transitionResearch({ researchId: 'j', expectedRevision: job.revision, to, actor, cause: 'TEST_STEP', patch }); };
  if (start !== 'queued') {
    if (start === 'cancelled') move('cancelled', 'user');
    else if (start === 'failed') move('failed', 'main', { failure: 'TEST_FAILURE' });
    else {
      move('dispatching', 'main', { target });
      if (start === 'cancelling-before-run') move('cancelling', 'user');
      else if (start !== 'dispatching') {
        move('collecting', 'main', { workflowRunId: '41' });
        if (start === 'cancelling-with-run') move('cancelling', 'user');
        if (start === 'collected') move('collected', 'main', { verification: verification(3) });
      }
    }
  }
  // A change of research level; an inference-only edit no longer ends a job (see research-jobs-state).
  if (change === 'policy') store.putProject({ ...store.getProject('p')!, policy: policy(2, 'private-connected') });
  if (change === 'research-off') store.putProject({ ...store.getProject('p')!, policy: policy(2, 'off') });
  if (change === 'trust') store.putProject({ ...store.getProject('p')!, trustRevision: 2 });
  return { store, jobs, context: () => ResearchContextSchema.parse(structuredClone(jobs.context('j'))) };
}

const admit: Outcome = { kind: 'admit', target };
const continuing: Outcome = { kind: 'continue' };
const T = (to: string, cause: string, extra: Record<string, unknown> = {}) => ({ kind: 'transition', transition: { to, cause, ...extra } });

// Independent restatement of the Task 3 planStep table; the test does not import any of the code's tables.
const EXPECTED: Array<[string, Start, Change, Outcome, string | undefined, ReturnType<typeof T> | Plan]> = [
  ['finished jobs are released', 'collected', 'none', { kind: 'dispatched', workflowRunId: '9' }, undefined, { kind: 'release' }],
  ['a failed job is released', 'failed', 'none', admit, undefined, { kind: 'release' }],
  ['a cancelled job is released', 'cancelled', 'none', { kind: 'ambiguous', cause: 'KIT_NETWORK' }, undefined, { kind: 'release' }],
  ['queued + admit dispatches', 'queued', 'none', admit, undefined, T('dispatching', 'DISPATCH', { target })],
  ['queued + admit after a policy change fails', 'queued', 'policy', admit, undefined, T('failed', 'ADMISSION_REFUSED', { failure: 'POLICY_CHANGED' })],
  ['queued + admit with research off fails', 'queued', 'research-off', admit, undefined, T('failed', 'ADMISSION_REFUSED', { failure: 'RESEARCH_NOT_ALLOWED' })],
  ['queued + refuse fails before any launch', 'queued', 'none', { kind: 'refuse', failure: 'COLLECTOR_INPUT_TOO_LONG', cause: 'COMMAND_LINE' }, undefined, T('failed', 'COMMAND_LINE', { failure: 'COLLECTOR_INPUT_TOO_LONG' })],
  ['queued ignores a fact it cannot have', 'queued', 'none', { kind: 'dispatched', workflowRunId: '9' }, undefined, { kind: 'continue' }],
  ['dispatching + dispatched records the run', 'dispatching', 'none', { kind: 'dispatched', workflowRunId: '77' }, undefined, T('collecting', 'KIT_DISPATCHED', { workflowRunId: '77' })],
  ['dispatching + dispatched after a trust change fails and keeps the run id', 'dispatching', 'trust', { kind: 'dispatched', workflowRunId: '77' }, undefined, T('failed', 'ADMISSION_CHANGED', { failure: 'TRUST_CHANGED', workflowRunId: '77' })],
  ['dispatching + notDispatched fails with the kit-derived failure', 'dispatching', 'none', { kind: 'notDispatched', failure: 'COLLECTOR_NOT_FOUND', cause: 'KIT_NOT_FOUND' }, undefined, T('failed', 'KIT_NOT_FOUND', { failure: 'COLLECTOR_NOT_FOUND' })],
  ['dispatching + ambiguous fails as remote state unknown', 'dispatching', 'none', { kind: 'ambiguous', cause: 'KIT_NETWORK' }, undefined, T('failed', 'KIT_NETWORK', { failure: 'REMOTE_STATE_UNKNOWN' })],
  ['dispatching waits otherwise', 'dispatching', 'none', continuing, undefined, { kind: 'continue' }],
  ['collecting + runFailed fails', 'collecting', 'none', { kind: 'runFailed', failure: 'RUN_FAILED', cause: 'RUN_FAILURE' }, undefined, T('failed', 'RUN_FAILURE', { failure: 'RUN_FAILED' })],
  ['collecting past the deadline expires', 'collecting', 'none', { kind: 'expired' }, undefined, T('failed', 'WATCH_DEADLINE', { failure: 'COLLECTION_EXPIRED' })],
  ['collecting continues while nothing is final', 'collecting', 'none', continuing, undefined, { kind: 'continue' }],
  ['collecting + verified records the verification on collected', 'collecting', 'none', { kind: 'verified', verification: verification(3) }, undefined, T('collected', 'PACKAGE_VERIFIED', { verification: verification(3) })],
  ['collecting + a verification bound to another revision records nothing', 'collecting', 'none', { kind: 'verified', verification: verification(2) }, undefined, { kind: 'continue' }],
  ['collecting + rejected fails with the import failure', 'collecting', 'none', { kind: 'rejected', failure: 'PACKAGE_IDENTITY_MISMATCH', cause: 'IMPORT_IDENTITY_MISMATCH' }, undefined, T('failed', 'IMPORT_IDENTITY_MISMATCH', { failure: 'PACKAGE_IDENTITY_MISMATCH' })],
  ['collecting + verified after a trust change fails instead', 'collecting', 'trust', { kind: 'verified', verification: verification(3) }, undefined, T('failed', 'ADMISSION_CHANGED', { failure: 'TRUST_CHANGED' })],
  ['collecting after a policy change fails whatever the outcome', 'collecting', 'policy', continuing, undefined, T('failed', 'ADMISSION_CHANGED', { failure: 'POLICY_CHANGED' })],
  ['a cancel that raced the dispatch keeps the learned run', 'cancelling-before-run', 'none', { kind: 'dispatched', workflowRunId: '77' }, undefined, T('cancelled', 'COLLECTOR_STOPPED', { workflowRunId: '77' })],
  ['a cancel over an ambiguous dispatch says so', 'cancelling-before-run', 'none', { kind: 'ambiguous', cause: 'KIT_NETWORK' }, undefined, T('cancelled', 'COLLECTOR_STOPPED', { failure: 'REMOTE_STATE_UNKNOWN' })],
  ['a cancel replayed from the spool records its run', 'cancelling-before-run', 'none', continuing, '88', T('cancelled', 'COLLECTOR_STOPPED', { workflowRunId: '88' })],
  ['a cancel overrides even a policy change', 'cancelling-before-run', 'policy', continuing, undefined, T('cancelled', 'COLLECTOR_STOPPED')],
  ['a run id is never written twice', 'cancelling-with-run', 'none', { kind: 'dispatched', workflowRunId: '77' }, '88', T('cancelled', 'COLLECTOR_STOPPED')],
];

test.each(EXPECTED)('%s', (_name, start, change, outcome, learned, expected) => {
  const { jobs, context } = setup(start, change);
  const ctx = context();
  const plan = planStep(ctx, outcome, learned);
  if (expected.kind !== 'transition') { expect(plan).toEqual(expected); return; }
  expect(plan).toEqual({ kind: 'transition', transition: { expectedRevision: ctx.research.revision, ...(expected as ReturnType<typeof T>).transition } });
  // Every planned step passes the control contract and is accepted by the real state machine.
  const transition = (plan as Extract<Plan, { kind: 'transition' }>).transition;
  const control = ControlSchema.parse({ method: 'research.transition', requestId: randomUUID(), researchId: 'j', ...transition });
  if (control.method !== 'research.transition') throw new Error('unreachable');
  const reply = ResearchTransitionReplySchema.parse(structuredClone(jobs.transition(control)));
  expect(reply).toMatchObject({ outcome: 'applied', research: { status: transition.to } });
});

test('reply schemas accept the engine\'s real replies and refuse extra keys', () => {
  const { jobs, context } = setup('collecting');
  expect(context().research).toMatchObject({ status: 'collecting', workflowRunId: '41', repository: 'owner/collector', inputs: { depth: 'quick' } });
  expect(context().admission).toBeNull();
  expect(ResearchRecoverySchema.parse(structuredClone(jobs.recover([])))).toEqual({ failed: [], cancelled: [], resume: [{ researchId: 'j', revision: 3, workflowRunId: '41' }], dispatchable: [], reviewing: [], unreadable: [], freeze: [], packaging: [], reviewDiscard: [] });
  expect(() => ResearchContextSchema.parse({ ...context(), extra: 1 })).toThrow();
  expect(() => ResearchContextSchema.parse({ ...context(), research: { ...context().research, token: 'x' } })).toThrow();
});

test('engine failures cross the boundary as bare codes, as the engine sends them', () => {
  expect(engineFailureCode(new Error('STALE_REVISION'))).toBe('STALE_REVISION');
  expect(engineFailureCode(new Error('Request id was reused with different input'))).toBe('REQUEST_CONFLICT');
  expect(engineFailureCode(new Error('SQLITE_BUSY: database is locked'))).toBe('INTERNAL_ERROR');
  expect(engineFailureCode('not an error')).toBe('INTERNAL_ERROR');
});
