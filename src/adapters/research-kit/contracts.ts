import { z } from 'zod';

// Moonzila-owned boundary types. The pinned external validator owns the full wire schema.
export const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const id = z.string().min(1).max(128);
const text = z.string().min(1).max(4096);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const BindingSchema = z.object({
  projectId: id, projectRevision: positive, jobId: id, jobRevision: positive,
  clientRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
  repository: z.string().max(256).regex(/^[^/\s]+\/[^/\s]+$/), ref: text,
  commit: z.string().regex(/^[0-9a-f]{40}$/), workflow: text, workflowRunId: positive, runAttempt: positive,
}).strict();
export type Binding = z.infer<typeof BindingSchema>;
export const StateSchema = z.enum(['COLLECTION_FAILED', 'REVIEW_REQUIRED', 'REVIEW_IN_PROGRESS', 'PREFLIGHT_BLOCKED', 'APPROVED_BRIEF']);
const state = z.union([StateSchema, z.literal('HUMAN_REVIEW_REQUIRED')]);
const finding = z.object({ code: text, message: z.string().max(16384), path: z.string().max(4096).nullable(), remedy: z.string().max(16384).nullable() }).strict();
export const ReportSchema = z.object({
  status: z.enum(['PASS', 'FAIL', 'INCOMPLETE', 'BLOCKED']), buildAuthorized: z.boolean(),
  packageId: id.nullable(), clientRef: z.string().max(128).nullable(), workflowRunId: positive.nullable(),
  // Invalid manifests may echo an unknown state; never expose it to the renderer.
  state: z.string().max(128).nullable(), reviewedBy: z.enum(['agent', 'human', 'undeclared']),
  errors: z.array(finding).max(1000), warnings: z.array(finding).max(1000),
}).strict();
export type Report = z.infer<typeof ReportSchema>;

// A projection, not a replacement wire format. Only consumed fields are read here,
// after the real validator has checked the full manifest, inventory and provenance.
export const ManifestProjection = z.object({
  format: z.literal('research-kit-artifact'), formatVersion: z.string().regex(/^[12]\.[0-9]+\.[0-9]+$/),
  packageId: id, clientRef: BindingSchema.shape.clientRef, state, buildAuthorized: z.boolean(),
  kind: z.enum(['COLLECTED_CORPUS', 'APPROVED_RESEARCH']),
  source: BindingSchema.pick({ repository: true, ref: true, commit: true, workflow: true, workflowRunId: true, runAttempt: true }).strip(),
  review: z.object({ mapClassified: z.boolean(), findingsReviewed: z.boolean(), briefReviewed: z.boolean(), by: z.enum(['agent', 'human', 'undeclared']).optional() }).strict(),
  gate: z.object({ verdict: z.enum(['NOT_RUN', 'PASS', 'FAIL', 'INCOMPLETE', 'BLOCKED']), buildAuthorized: z.boolean(), blockingFindings: z.array(z.unknown()).max(1000) }).strict(),
}).strip();
export const ReceiptSchema = z.object({
  id: z.uuid(), artifactSha256: DigestSchema, artifactBytes: positive.max(32 * 1024 ** 2),
  validatorRevision: z.string().regex(/^[0-9a-f]{40}$/), nodeSha256: DigestSchema,
  binding: BindingSchema, state: StateSchema, researchReady: z.boolean(),
}).strict();
export type Receipt = z.infer<typeof ReceiptSchema>;
export const FailureSchema = z.enum(['ARTIFACT_INVALID', 'INPUT_LIMIT', 'IDENTITY_MISMATCH', 'INSTALLATION_INVALID', 'VALIDATOR_OUTPUT', 'CANCELLED', 'TIMEOUT', 'OUTPUT_LIMIT', 'STORAGE_LIMIT', 'STALE_VERIFICATION']);
export type Failure = z.infer<typeof FailureSchema>;
export const ResultSchema = z.object({
  status: z.enum(['PASS', 'FAIL', 'INCOMPLETE', 'BLOCKED']), state: StateSchema.nullable(),
  researchReady: z.boolean(), receipt: ReceiptSchema.nullable(), error: FailureSchema.nullable(),
}).strict();
export type Result = z.infer<typeof ResultSchema>;
