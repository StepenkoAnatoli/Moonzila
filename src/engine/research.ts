import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { IdSchema, ResearchCollectorSchema, ResearchSchema, ResearchStartParams, ResearchStatusSchema, RevisionSchema, type MethodInput, type Research } from '../shared';
import { canonicalHash } from './policy';
import { ACTIVE_RESEARCH } from './research-state';
import type { Store, StoreProject, StoreResearch, StoreResearchEvent } from './store';
import type { ReviewedPackage } from './review-contract';

const { queries, urls, preferDomains, depth, maxPages } = ResearchStartParams.shape;
/** The collector inputs kept with a job. Strict, so nothing else (such as a token) can be stored beside them. */
export const ResearchInputsSchema = z.object({ queries, urls, preferDomains, depth, maxPages }).strict().refine(value => value.urls.length <= value.maxPages, 'Each known URL counts against the page budget');
export type ResearchInputs = z.infer<typeof ResearchInputsSchema>;
const { repository, workflow, ref } = ResearchCollectorSchema.shape;
export const ResearchTargetSchema = z.object({ collectorRevision: RevisionSchema, repository, workflow, ref }).strict();
export const WorkflowRunIdSchema = z.string().regex(/^[1-9][0-9]{0,15}$/).refine(value => Number(value) <= Number.MAX_SAFE_INTEGER, 'Run id exceeds the safe integer range');
/** Causes and failures are codes, never collector output or free text. */
export const ResearchCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);
const ClientRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/); const sha1 = z.string().regex(/^[0-9a-f]{40}$/);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/**
 * The verification main records on collecting -> collected: the retained bytes' digest, the validator identity, the
 * job and project revisions the receipt was bound to, the dispatch identity taken from the GitHub run, and the run id and
 * client ref that name the run and its artifact. The kit
 * does not check the downloaded artifact's digest at this pin, so that is recorded as unverified.
 */
export const ResearchVerificationSchema = z.object({
  artifactSha256: digest, artifactBytes: positive.max(32 * 1024 ** 2), validatorRevision: sha1, nodeSha256: digest,
  state: z.enum(['REVIEW_REQUIRED', 'REVIEW_IN_PROGRESS', 'PREFLIGHT_BLOCKED']), jobRevision: positive, projectRevision: positive,
  repository, ref, workflow: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/), commit: sha1, runAttempt: positive, workflowRunId: WorkflowRunIdSchema, clientRef: ClientRefSchema,
  downloadDigest: z.literal('unverified'),
}).strict();
export type ResearchVerification = z.infer<typeof ResearchVerificationSchema>;

/** Public, opaque and never derived from the topic, project name or path: it names the collector run and artifact. */
export function newClientRef(): string { return `mz-${randomUUID().replaceAll('-', '')}`; }

export type ResearchAdmissionCode = 'PROJECT_NOT_FOUND' | 'PROJECT_UNTRUSTED' | 'RESEARCH_NOT_ALLOWED' | 'POLICY_CHANGED' | 'TRUST_CHANGED';
/** A job may cause an effect only while the project still matches what was admitted, as approvals do. */
/**
 * The research setting and trust a job was admitted under. An inference-only policy edit keeps research running (user
 * decision, October 3): only turning research off, changing its level, or a trust change ends a job.
 */
export function researchAdmission(project: StoreProject | undefined, job?: Pick<StoreResearch, 'researchLevel' | 'trustRevision'>): ResearchAdmissionCode | undefined {
  if (!project) return 'PROJECT_NOT_FOUND';
  if (!project.trusted) return 'PROJECT_UNTRUSTED';
  if (project.policy.research === 'off') return 'RESEARCH_NOT_ALLOWED';
  if (job && project.policy.research !== job.researchLevel) return 'POLICY_CHANGED';
  if (job && project.trustRevision !== job.trustRevision) return 'TRUST_CHANGED';
  return undefined;
}

/** The renderer sees identity and status only; inputs, the collector target and the admission binding stay in the engine. */
export function researchDto(job: StoreResearch): Research {
  const { id, projectId, revision, status, topic, clientRef, workflowRunId, failure, createdAt, updatedAt } = job;
  return ResearchSchema.parse({ id, projectId, revision, status, topic, clientRef, createdAt, updatedAt, ...(workflowRunId === undefined ? {} : { workflowRunId }), ...(failure === undefined ? {} : { failure }) });
}

const AdmissionSchema = z.enum(['PROJECT_NOT_FOUND', 'PROJECT_UNTRUSTED', 'RESEARCH_NOT_ALLOWED', 'POLICY_CHANGED', 'TRUST_CHANGED']);
const Revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/**
 * The replies main acts on, parsed strictly there. A decoded row omits NULL columns, so the optional keys of a stored
 * job stay optional rather than nullable.
 */
export const ResearchContextSchema = z.object({
  research: z.object({
    id: IdSchema, projectId: IdSchema, revision: RevisionSchema, status: ResearchStatusSchema, topic: z.string().min(1).max(2048), inputs: ResearchInputsSchema,
    clientRef: ClientRefSchema, researchLevel: z.enum(['public-technical', 'private-connected']), policyRevision: Revision, trustRevision: Revision,
    collectorRevision: RevisionSchema.optional(), repository: repository.optional(), workflow: workflow.optional(), ref: ref.optional(), dispatchedAt: z.string().max(64).optional(),
    workflowRunId: WorkflowRunIdSchema.optional(), failure: ResearchCodeSchema.optional(), createdAt: z.string().max(64), updatedAt: z.string().max(64),
  }).strict(),
  admission: AdmissionSchema.nullable(),
}).strict();
export type ResearchContext = z.infer<typeof ResearchContextSchema>;
export const ResearchTransitionReplySchema = z.object({ outcome: z.enum(['applied', 'refused']), research: ResearchSchema }).strict();
const ids = z.array(IdSchema).max(1000);
export const ResearchRecoverySchema = z.object({
  failed: ids, cancelled: ids, reviewing: ids, unreadable: ids,
  // Review recovery (schema v4): jobs to freeze, jobs to resume packaging, and storage/review folder names to delete.
  freeze: ids, packaging: ids, reviewDiscard: ids,
  resume: z.array(z.object({ researchId: IdSchema, revision: RevisionSchema, workflowRunId: WorkflowRunIdSchema }).strict()).max(1000),
  dispatchable: z.array(z.object({ researchId: IdSchema, revision: RevisionSchema }).strict()).max(1000),
}).strict();

export interface ResearchTransitionCommand {
  method: 'research.transition'; requestId: string; researchId: string; expectedRevision: number;
  to: 'dispatching' | 'collecting' | 'collected' | 'failed' | 'cancelled' | 'packaging' | 'approved' | 'not_ready'; cause: string;
  target?: z.infer<typeof ResearchTargetSchema>; workflowRunId?: string; failure?: string; verification?: ResearchVerification;
  reviewDigest?: string; reviewedPackage?: ReviewedPackage;
}
export interface ResearchRecovery {
  failed: string[]; cancelled: string[]; resume: Array<{ researchId: string; revision: number; workflowRunId: string }>;
  dispatchable: Array<{ researchId: string; revision: number }>; reviewing: string[]; unreadable: string[];
  freeze: string[]; packaging: string[]; reviewDiscard: string[];
}

/** Durable research jobs. The engine owns state; main owns the collector process and drives fact transitions. */
export class ResearchJobs {
  constructor(private readonly store: Store, private readonly publish: (research: Research) => void) {}

  list(projectId: string): { research: Research[] } { return { research: this.store.listResearch(projectId).map(researchDto) }; }
  read(researchId: string): { research: Research } {
    const job = this.store.getResearch(researchId); if (!job) throw new Error('NOT_FOUND');
    return { research: researchDto(job) };
  }

  /** Runs inside the request's acceptance transaction. Records the job only; nothing is dispatched. */
  start(params: MethodInput<'research.start'>, requestId: string, notices: Research[]): { research: Research } {
    const project = this.store.getProject(params.projectId);
    const refusal = researchAdmission(project);
    if (refusal) throw new Error(refusal);
    if (this.store.hasActiveResearch(params.projectId)) throw new Error('RUN_ACTIVE');
    const inputs = ResearchInputsSchema.parse({ queries: params.queries, urls: params.urls, preferDomains: params.preferDomains, depth: params.depth, maxPages: params.maxPages });
    const { research } = this.store.createResearch({
      id: randomUUID(), projectId: params.projectId, topic: params.topic, inputs, clientRef: newClientRef(),
      researchLevel: project!.policy.research as StoreResearch['researchLevel'], policyRevision: project!.policy.revision, trustRevision: project!.trustRevision,
    }, { actor: 'user', requestId });
    const dto = researchDto(research); notices.push(dto); return { research: dto };
  }

  /** Stopping is always allowed. Work already in flight is cancelled by main once its owned process has stopped. */
  cancel(researchId: string, requestId: string, notices: Research[]): { research: Research } {
    const job = this.store.getResearch(researchId); if (!job) throw new Error('NOT_FOUND');
    const to = job.status === 'queued' ? 'cancelled' : ['dispatching', 'collecting', 'reviewing'].includes(job.status) ? 'cancelling' : undefined;
    if (!to) return { research: researchDto(job) };
    const { research } = this.store.transitionResearch({ researchId, expectedRevision: job.revision, to, actor: 'user', cause: 'CANCEL_REQUESTED', requestId });
    const dto = researchDto(research); notices.push(dto); return { research: dto };
  }

  assertIdle(projectId: string): void { if (this.store.hasActiveResearch(projectId)) throw new Error('RUN_ACTIVE'); }

  /** What main needs before an effect: the stored job, its strictly re-parsed inputs and the live admission result. */
  context(researchId: string): { research: StoreResearch & { inputs: ResearchInputs }; admission: ResearchAdmissionCode | null } {
    const job = this.store.getResearch(researchId); if (!job) throw new Error('NOT_FOUND');
    const inputs = ResearchInputsSchema.safeParse(job.inputs);
    if (!inputs.success) throw new Error('RESEARCH_STATE_INVALID');
    return { research: { ...job, inputs: inputs.data }, admission: researchAdmission(this.store.getProject(job.projectId), job) ?? null };
  }

  /** A main-originated step. Dispatch is revalidated; an inadmissible one is journaled as failed and reported as refused. */
  transition(command: ResearchTransitionCommand): { outcome: 'applied' | 'refused'; research: Research } {
    const { requestId, ...input } = command;
    const accepted = this.store.acceptRequest({ method: 'research.transition', clientRequestId: requestId, canonicalInputHash: canonicalHash(input) }, () => {
      const job = this.store.getResearch(command.researchId); if (!job) throw new Error('NOT_FOUND');
      // The review states arrive with schema v4 (Task 5); until then they are no edge, as the store would also say.
      const to = command.to;
      if (to === 'packaging' || to === 'approved' || to === 'not_ready') throw new Error('RESEARCH_TRANSITION_INVALID');
      const patch = { target: command.target, workflowRunId: command.workflowRunId, failure: command.failure, verification: command.verification };
      for (const key of Object.keys(patch) as (keyof typeof patch)[]) if (patch[key] === undefined) delete patch[key];
      // Admission is re-checked in this transaction before each effect it gates: the dispatch, and accepting a package.
      const gated = (command.to === 'dispatching' || command.to === 'collected') && job.revision === command.expectedRevision;
      const refusal = gated ? researchAdmission(this.store.getProject(job.projectId), job) : undefined;
      const { research } = refusal
        ? this.store.transitionResearch({ researchId: job.id, expectedRevision: command.expectedRevision, to: 'failed', actor: 'main', cause: command.to === 'dispatching' ? 'ADMISSION_REFUSED' : 'ADMISSION_CHANGED', requestId, patch: { failure: refusal } })
        : this.store.transitionResearch({ researchId: job.id, expectedRevision: command.expectedRevision, to, actor: 'main', cause: command.cause, requestId, patch });
      return { entityId: job.id, response: { outcome: refusal ? 'refused' as const : 'applied' as const, research: researchDto(research) } };
    });
    if (!accepted.replayed) this.publish(accepted.response.research);
    return accepted.response;
  }

  /**
   * Reconcile jobs that no live process owns. An ambiguous dispatch is never re-queued: it fails as REMOTE_STATE_UNKNOWN.
   * Main calls this at app start (owned = []) and after an engine-only restart (owned = its live jobs). It is idempotent.
   */
  recover(owned: readonly string[]): ResearchRecovery {
    const result: ResearchRecovery = { failed: [], cancelled: [], resume: [], dispatchable: [], reviewing: [], unreadable: [], freeze: [], packaging: [], reviewDiscard: [] };
    const notices: Research[] = [];
    const skip = new Set(owned);
    this.store.transaction(() => {
      for (const job of this.store.listResearchByStatus(ACTIVE_RESEARCH)) {
        if (skip.has(job.id)) continue;
        try {
          this.store.transaction(() => {
            if (job.status === 'dispatching') {
              notices.push(researchDto(this.store.transitionResearch({ researchId: job.id, expectedRevision: job.revision, to: 'failed', actor: 'recovery', cause: 'RECOVERED', patch: { failure: 'REMOTE_STATE_UNKNOWN' } }).research));
              result.failed.push(job.id);
            } else if (job.status === 'cancelling') {
              notices.push(researchDto(this.store.transitionResearch({ researchId: job.id, expectedRevision: job.revision, to: 'cancelled', actor: 'recovery', cause: 'NO_OWNED_WORK' }).research));
              result.cancelled.push(job.id);
            } else if (job.status === 'collecting') {
              if (!job.workflowRunId) throw new Error('RESEARCH_STATE_INVALID');
              result.resume.push({ researchId: job.id, revision: job.revision, workflowRunId: job.workflowRunId });
            } else if (job.status === 'queued') result.dispatchable.push({ researchId: job.id, revision: job.revision });
            else if (job.status === 'reviewing') result.reviewing.push(job.id);
          });
        } catch { result.unreadable.push(job.id); }
      }
    });
    for (const notice of notices) this.publish(notice);
    return result;
  }

  events(researchId: string): StoreResearchEvent[] { return this.store.researchEvents(researchId, 0, 1000).events; }
}
