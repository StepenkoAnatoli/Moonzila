import type { ResearchContext, ResearchVerification } from '../engine/research';
import type { CollectorTarget } from '../adapters/research-kit/collector';

/** What main learned, in collector terms. The kit's own text never reaches here. */
export type Outcome =
  | { kind: 'admit'; target: CollectorTarget }
  | { kind: 'refuse'; failure: string; cause: string }
  | { kind: 'dispatched'; workflowRunId: string }
  | { kind: 'notDispatched'; failure: string; cause: string }
  | { kind: 'ambiguous'; cause: string }
  | { kind: 'runFailed'; failure: string; cause: string }
  | { kind: 'expired' }
  /** Verified import (Task 4): the package passed the validator under the binding taken from the GitHub run. */
  | { kind: 'verified'; verification: ResearchVerification }
  /** The package or its run failed verification: never retried. */
  | { kind: 'rejected'; failure: string; cause: string }
  /** Nothing to record: still running, a transient failure, a parked job, or a stop with no new facts. */
  | { kind: 'continue' };

export interface Transition {
  to: 'dispatching' | 'collecting' | 'collected' | 'failed' | 'cancelled'; expectedRevision: number; cause: string;
  target?: CollectorTarget; workflowRunId?: string; failure?: string; verification?: ResearchVerification;
}
export type Plan = { kind: 'release' } | { kind: 'continue' } | { kind: 'transition'; transition: Transition };

/** Statuses the collector no longer drives: collection ended, or the job moved on to its review. */
export const FINISHED: ReadonlySet<string> = new Set(['collected', 'failed', 'cancelled', 'approved', 'not_ready', 'reviewing', 'packaging']);
const step = (ctx: ResearchContext, transition: Omit<Transition, 'expectedRevision'>): Plan => ({ kind: 'transition', transition: { ...transition, expectedRevision: ctx.research.revision } });

/**
 * The only place that turns collector facts into a job transition. Pure: main re-reads the context, then plans,
 * so a fact learned before a cancel or a policy change is recorded on the edge that state allows.
 * `learnedRunId` is a run id main learned that the job may not have recorded yet (the spool, or this outcome).
 */
export function planStep(ctx: ResearchContext, outcome: Outcome, learnedRunId?: string): Plan {
  const job = ctx.research;
  if (FINISHED.has(job.status)) return { kind: 'release' };
  const runId = outcome.kind === 'dispatched' ? outcome.workflowRunId : learnedRunId;
  // A run id is written once: only offered where the job has none.
  const newRunId = job.workflowRunId === undefined && runId !== undefined ? { workflowRunId: runId } : {};
  if (job.status === 'cancelling') {
    return step(ctx, { to: 'cancelled', cause: 'COLLECTOR_STOPPED', ...newRunId, ...(outcome.kind === 'ambiguous' ? { failure: 'REMOTE_STATE_UNKNOWN' } : {}) });
  }
  if (job.status === 'queued') {
    if (outcome.kind === 'refuse') return step(ctx, { to: 'failed', cause: outcome.cause, failure: outcome.failure });
    if (outcome.kind !== 'admit') return { kind: 'continue' };
    if (ctx.admission !== null) return step(ctx, { to: 'failed', cause: 'ADMISSION_REFUSED', failure: ctx.admission });
    return step(ctx, { to: 'dispatching', cause: 'DISPATCH', target: outcome.target });
  }
  if (job.status === 'dispatching') {
    if (outcome.kind === 'dispatched') {
      return ctx.admission !== null
        ? step(ctx, { to: 'failed', cause: 'ADMISSION_CHANGED', failure: ctx.admission, ...newRunId })
        : step(ctx, { to: 'collecting', cause: 'KIT_DISPATCHED', workflowRunId: outcome.workflowRunId });
    }
    if (outcome.kind === 'notDispatched') return step(ctx, { to: 'failed', cause: outcome.cause, failure: outcome.failure });
    if (outcome.kind === 'ambiguous') return step(ctx, { to: 'failed', cause: outcome.cause, failure: 'REMOTE_STATE_UNKNOWN', ...newRunId });
    return { kind: 'continue' };
  }
  // collecting
  if (ctx.admission !== null) return step(ctx, { to: 'failed', cause: 'ADMISSION_CHANGED', failure: ctx.admission });
  if (outcome.kind === 'runFailed' || outcome.kind === 'rejected') return step(ctx, { to: 'failed', cause: outcome.cause, failure: outcome.failure });
  // A receipt bound to another revision is stale: nothing is recorded, and the next watch verifies again.
  if (outcome.kind === 'verified') return outcome.verification.jobRevision === job.revision ? step(ctx, { to: 'collected', cause: 'PACKAGE_VERIFIED', verification: outcome.verification }) : { kind: 'continue' };
  if (outcome.kind === 'expired') return step(ctx, { to: 'failed', cause: 'WATCH_DEADLINE', failure: 'COLLECTION_EXPIRED' });
  return { kind: 'continue' };
}
