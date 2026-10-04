import { z } from 'zod';
import { DigestSchema, IdSchema, ResearchSchema, RevisionSchema, RunSchema } from '../shared';
// research.ts imports this module, so its schema is referenced lazily to keep the cycle harmless.
import { ResearchVerificationSchema } from './research';

/**
 * Frozen contracts for plan Task 5, the research review (docs/specification/research-review.md). Engine, main and the
 * renderer build against these; a change goes through the lead, never through a single unit. Statuses `packaging` and
 * actor `engine` arrive with schema v4, in the store and research-state, not here.
 */

/** The only workspace files a review run may write (Decisions, Q3). Checked before an operation is prepared. */
export const REVIEW_WRITE_ALLOWLIST = ['research/MAP.md', 'research/EVIDENCE.md', 'research/BRIEF.md', 'research/DISCOVERY.md'] as const;
/** Node, the 100 staged kit files and every workspace file must fit the helper's 2,048 read locks. */
export const MAX_REVIEW_WORKSPACE_FILES = 1900;

export const ReviewWorkspaceSchema = z.enum(['fresh', 'continued']);
export type ReviewWorkspace = z.infer<typeof ReviewWorkspaceSchema>;
/** SHA-256 of the canonical JSON of the sorted [path, sha256] list of the frozen workspace. */
export const ReviewDigestSchema = DigestSchema;
/** The reviewed ZIP: its digest, the validator revision of its receipt, and the job revision the receipt's binding carried. */
export const ReviewedPackageSchema = z.object({ sha256: DigestSchema, validatorRevision: z.string().regex(/^[0-9a-f]{40}$/), boundRevision: RevisionSchema }).strict();
export type ReviewedPackage = z.infer<typeof ReviewedPackageSchema>;

/** Job failures a review can end in (`not_ready`), besides the admission codes and RESEARCH_KIT_UNAVAILABLE. */
export const REVIEW_FAILURES = ['REVIEW_INTERRUPTED', 'REVIEW_STOPPED', 'REVIEW_RUN_FAILED', 'REVIEW_BUDGET_EXCEEDED', 'REVIEW_CONTEXT_LIMIT', 'REVIEW_WORKSPACE_CHANGED',
  'REVIEW_PACKAGE_BLOCKED', 'REVIEW_PACKAGE_INVALID', 'REVIEW_PACKAGE_MISMATCH', 'REVIEW_PACKAGING_FAILED', 'REVIEW_GATE_FAILED', 'REVIEW_INCOMPLETE'] as const;
export const ReviewFailureSchema = z.enum(REVIEW_FAILURES);
/** Fixed causes; `KIT_CREATE_EXIT_<n>` is composed at run time. */
export const REVIEW_CAUSES = ['REVIEW_STARTED', 'REVIEW_RETRY', 'REVIEW_RESTARTED', 'WORKSPACE_FROZEN', 'KIT_APPROVED', 'KIT_NOT_APPROVED', 'IDENTITY_MISMATCH', 'INVENTORY_MISMATCH',
  'OWNED_TIMEOUT', 'HELPER_FAILED', 'KIT_OUTPUT_LIMIT', 'REVIEW_CANCELLED', 'CANCEL_REQUESTED', 'RECOVERED', 'NO_OWNED_WORK', 'BRIEF_STALE'] as const;

/**
 * One review write, as `research.review.context` returns it (contents never cross). `completed` writes are applied;
 * an `unknown` write (a crash between its rename and its record) may or may not be on disk, so main accepts either
 * its before or its after hash for that path when it checks a `continued` workspace, and begin then reconciles it
 * (spec "Crash windows"; Phase 3 review F1).
 */
export const ReviewChangeSchema = z.object({
  operationId: IdSchema, runId: IdSchema, path: z.enum(REVIEW_WRITE_ALLOWLIST), beforeHash: DigestSchema.nullable(), afterHash: DigestSchema.nullable(),
  status: z.enum(['completed', 'unknown']),
}).strict();
export type ReviewChange = z.infer<typeof ReviewChangeSchema>;

/** Control `research.review.begin`, sent by main once the workspace exists. */
export const ResearchReviewBeginSchema = z.object({ method: z.literal('research.review.begin'), requestId: IdSchema, researchId: IdSchema, profileId: IdSchema, workspace: ReviewWorkspaceSchema }).strict();
export const ResearchReviewBeginReplySchema = z.object({ research: ResearchSchema, run: RunSchema }).strict();
/** Control `research.review.context`: what main needs to freeze, package or rebuild a workspace. */
export const ResearchReviewContextRequestSchema = z.object({ method: z.literal('research.review.context'), researchId: IdSchema }).strict();
export const ResearchReviewContextSchema = z.object({
  researchId: IdSchema, revision: RevisionSchema, status: z.string().max(32), admission: z.string().max(64).nullable(),
  reviewSessionId: IdSchema.nullable(), reviewRunId: IdSchema.nullable(), reviewRunStatus: z.string().max(32).nullable(),
  reviewDigest: DigestSchema.nullable(), reviewedPackage: ReviewedPackageSchema.nullable(),
  /** The verification journaled on `collecting -> collected` (Task 4): main's only source for the job's binding. Null before collection. */
  verification: z.lazy(() => ResearchVerificationSchema).nullable(),
  /** Completed review writes since the latest `fresh` edge, in creation order. */
  changes: z.array(ReviewChangeSchema).max(100_000),
}).strict();
export type ResearchReviewContext = z.infer<typeof ResearchReviewContextSchema>;

/** The engine asks main to run a kit tool for a review run (port message `research.tool`), like `command.prepare`. */
export const ReviewToolNameSchema = z.enum(['research_preflight', 'research_draft_brief']);
export const ReviewToolInputSchema = z.object({ force: z.literal(true).optional() }).strict();
export const ReviewToolErrorSchema = z.enum(['RUN_CANCELLED', 'REVIEW_TOOL_FAILED', 'BRIEF_NOT_DRAFTED', 'RESEARCH_KIT_UNAVAILABLE']);
const Finding = z.object({ severity: z.enum(['pass', 'warn', 'fail']), check: z.string().max(128), rule: z.string().max(128), detail: z.string().max(1024) }).strict();
/** `research_preflight`: the kit's `--json` verdict, bounded. The agent's guide only; it decides nothing. */
export const ReviewPreflightResultSchema = z.object({
  tool: z.literal('research_preflight'), pass: z.boolean(), counts: z.object({ pass: RevisionSchema, warn: RevisionSchema, fail: RevisionSchema }).strict(),
  evidencePolicy: z.string().max(32), findings: z.array(Finding).max(200),
}).strict();
/** `research_draft_brief`: the drafted brief, which the engine turns into an ordinary approved write of research/BRIEF.md. */
export const ReviewDraftBriefResultSchema = z.object({ tool: z.literal('research_draft_brief'), content: z.string().max(1024 * 1024) }).strict();
export const ReviewToolResultSchema = z.discriminatedUnion('tool', [ReviewPreflightResultSchema, ReviewDraftBriefResultSchema]);
export type ReviewToolResult = z.infer<typeof ReviewToolResultSchema>;
