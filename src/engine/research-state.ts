import type { StoreResearch, StoreResearchActor, StoreResearchPatch, StoreResearchStatus } from './store';

/** States that hold a project's single research slot (the research_active index). */
export const ACTIVE_RESEARCH = ['queued', 'dispatching', 'collecting', 'reviewing', 'packaging', 'cancelling'] as const satisfies readonly StoreResearchStatus[];

const REVIEW_START = ['reviewRunId', 'reviewSessionId', 'workspace'] as const;
interface Edge { actors: readonly StoreResearchActor[]; requires?: readonly (keyof StoreResearchPatch)[]; allows?: readonly (keyof StoreResearchPatch)[] }

/**
 * The only source of research transitions. `queued` is the sole source of `dispatching`, nothing returns to `queued`,
 * nothing returns to `collected`, and `approved` has no outgoing edge. `approved` is reached only from `packaging`, by main,
 * and the v4 readiness trigger also demands a frozen digest and main's KIT_APPROVED journal row
 * (docs/specification/research-review.md, "Job states and edges"). `not_ready -> reviewing` is the only retry edge.
 */
export const RESEARCH_EDGES: Readonly<Partial<Record<StoreResearchStatus, Partial<Record<StoreResearchStatus, Edge>>>>> = {
  queued: {
    dispatching: { actors: ['main'], requires: ['target'] },
    failed: { actors: ['main'], requires: ['failure'] },
    cancelled: { actors: ['user'] },
  },
  dispatching: {
    collecting: { actors: ['main'], requires: ['workflowRunId'] },
    failed: { actors: ['main', 'recovery'], requires: ['failure'], allows: ['workflowRunId'] },
    cancelling: { actors: ['user'] },
  },
  collecting: {
    collected: { actors: ['main'], requires: ['verification'] },
    failed: { actors: ['main'], requires: ['failure'] },
    cancelling: { actors: ['user'] },
  },
  collected: { reviewing: { actors: ['user'], requires: REVIEW_START } },
  not_ready: { reviewing: { actors: ['user'], requires: REVIEW_START } },
  reviewing: {
    packaging: { actors: ['main'], requires: ['reviewDigest'] },
    not_ready: { actors: ['engine', 'main', 'recovery'], requires: ['failure'] },
    cancelling: { actors: ['user'] },
  },
  packaging: {
    approved: { actors: ['main'], requires: ['reviewedPackage'] },
    not_ready: { actors: ['engine', 'main', 'recovery'], requires: ['failure'], allows: ['reviewedPackage'] },
    cancelling: { actors: ['user'] },
  },
  // A cancel can race the collector printing its run id; the id must still be recordable. The engine ends a cancelled review.
  cancelling: { cancelled: { actors: ['main', 'recovery', 'engine'], allows: ['workflowRunId', 'failure'] } },
};

/** A workflow_dispatch ref may be given in full; the run and the package carry its short name (GITHUB_REF_NAME). */
export const shortResearchRef = (ref: string) => ref.replace(/^refs\/(?:heads|tags)\//, '');

export function assertResearchEdge(existing: StoreResearch, to: StoreResearchStatus, actor: StoreResearchActor, patch: StoreResearchPatch): void {
  const edge = RESEARCH_EDGES[existing.status]?.[to];
  if (!edge || !edge.actors.includes(actor)) throw new Error('RESEARCH_TRANSITION_INVALID');
  const permitted = new Set([...(edge.requires ?? []), ...(edge.allows ?? [])]);
  for (const key of edge.requires ?? []) if (patch[key] === undefined) throw new Error('RESEARCH_TRANSITION_INVALID');
  for (const [key, value] of Object.entries(patch)) if (value === undefined || !permitted.has(key as keyof StoreResearchPatch)) throw new Error('RESEARCH_TRANSITION_INVALID');
  if (patch.workflowRunId !== undefined && existing.workflowRunId !== undefined) throw new Error('RESEARCH_TRANSITION_INVALID');
  // A collected job has no earlier review edits to keep: its first review starts from the verified package.
  if (existing.status === 'collected' && patch.workspace !== undefined && patch.workspace !== 'fresh') throw new Error('RESEARCH_TRANSITION_INVALID');
  // The engine ends packaging only for a Stop of the review run; every other packaging outcome is main's.
  if (actor === 'engine' && existing.status === 'packaging' && patch.failure !== 'REVIEW_STOPPED') throw new Error('RESEARCH_TRANSITION_INVALID');
  // A reviewed package's receipt is bound to the packaging revision it was validated at; any other is stale.
  if (patch.reviewedPackage && patch.reviewedPackage.boundRevision !== existing.revision) throw new Error('RESEARCH_TRANSITION_INVALID');
  // A receipt is bound to the job revision it was validated at and to the admitted policy revision; any other is stale.
  // It must also name the job's own run, client ref and frozen target. The package's workflow is the kit's literal
  // collect.yml, not the target's workflow file, so it is not compared here.
  const verified = patch.verification;
  if (verified && (verified.jobRevision !== existing.revision || verified.projectRevision !== existing.policyRevision || verified.workflowRunId !== existing.workflowRunId
    || verified.clientRef !== existing.clientRef || existing.repository === undefined || verified.repository.toLowerCase() !== existing.repository.toLowerCase()
    || existing.ref === undefined || verified.ref !== shortResearchRef(existing.ref))) throw new Error('RESEARCH_TRANSITION_INVALID');
}
