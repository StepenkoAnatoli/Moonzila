import { z } from 'zod';
import { PublicErrorSchema } from './errors';

export const IdSchema = z.string().min(1).max(128).refine(value => value.trim() === value && ![...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127), 'Invalid opaque identity');
export const DateTimeSchema = z.iso.datetime({ offset: true });
export const RevisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
/** One vocabulary for durable research jobs and their events; readiness exists only as `approved`, set from a fresh kit validation. */
export const ResearchStatusSchema = z.enum(['queued', 'dispatching', 'collecting', 'collected', 'reviewing', 'packaging', 'approved', 'not_ready', 'failed', 'cancelling', 'cancelled']);
export const HttpUrlSchema = z.string().min(1).max(2048).url().refine(value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.hash; } catch { return false; }
}, 'An HTTP(S) URL without embedded credentials or fragment is required');
export const ModeSchema = z.enum(['ask', 'plan', 'research', 'build', 'mission']);
export type Mode = z.infer<typeof ModeSchema>;
export const RunStatusSchema = z.enum(['queued', 'running', 'awaiting_approval', 'awaiting_review', 'cancelling', 'completed', 'failed', 'cancelled', 'interrupted']);
export type RunStatus = z.infer<typeof RunStatusSchema>;
export const ProjectPolicySchema = z.object({ revision: RevisionSchema, inference: z.enum(['local-only', 'cloud-allowed']), research: z.enum(['off', 'public-technical', 'private-connected']) }).strict();
export type ProjectPolicy = z.infer<typeof ProjectPolicySchema>;
export const ProjectSchema = z.object({ id: IdSchema, name: z.string().min(1).max(256), pathLabel: z.string().min(1).max(1024), trusted: z.boolean(), trustRevision: RevisionSchema, policy: ProjectPolicySchema, missing: z.boolean(), createdAt: DateTimeSchema }).strict();
export type Project = z.infer<typeof ProjectSchema>;
export const SessionPolicySchema = z.object({ revision: RevisionSchema, inference: z.enum(['local-only', 'cloud-allowed']) }).strict();
export const SessionSchema = z.object({ id: IdSchema, projectId: IdSchema.nullable(), policy: SessionPolicySchema, title: z.string().min(1).max(256), createdAt: DateTimeSchema, updatedAt: DateTimeSchema }).strict();
export type Session = z.infer<typeof SessionSchema>;
export const ProfileKindSchema = z.enum(['openai-compatible', 'openai-responses', 'anthropic', 'ollama']);
export type ProfileKind = z.infer<typeof ProfileKindSchema>;
export const ProfileSchema = z.object({ id: IdSchema, name: z.string().min(1).max(128), kind: ProfileKindSchema, endpoint: HttpUrlSchema, model: z.string().min(1).max(256), contextTokens: z.number().int().min(512).max(2_000_000), outputTokens: z.number().int().min(1).max(200_000), locality: z.enum(['local', 'external']), hasCredential: z.boolean(), revision: RevisionSchema, revisionId: IdSchema, createdAt: DateTimeSchema, updatedAt: DateTimeSchema }).strict().refine(value => value.outputTokens <= value.contextTokens, 'Output budget exceeds context budget');
export type Profile = z.infer<typeof ProfileSchema>;
export const RunSchema = z.object({ id: IdSchema, sessionId: IdSchema, projectId: IdSchema.nullable(), sessionPolicyRevision: RevisionSchema.default(0), mode: ModeSchema, status: RunStatusSchema, profileId: IdSchema, profileRevisionId: IdSchema, policyRevision: RevisionSchema, trustRevision: RevisionSchema, createdAt: DateTimeSchema, finishedAt: DateTimeSchema.optional() }).strict();
export type Run = z.infer<typeof RunSchema>;
export const ToolCallSchema = z.object({ id: IdSchema, name: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/), input: z.json(), inputError: z.string().max(2048).optional() }).strict();
export type ToolCall = z.infer<typeof ToolCallSchema>;
export const MessageSchema = z.object({ id: IdSchema, sessionId: IdSchema, runId: IdSchema.optional(), role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string().max(2_097_152), createdAt: DateTimeSchema, toolCallId: IdSchema.optional(), toolName: z.string().min(1).max(128).optional(), toolCalls: z.array(ToolCallSchema).max(128).optional(), partial: z.boolean().optional() }).strict();
export type Message = z.infer<typeof MessageSchema>;
export const ProfileIdentitySchema = z.object({ profileId: IdSchema, profileRevisionId: IdSchema, kind: ProfileKindSchema, endpoint: HttpUrlSchema, model: z.string().min(1).max(256) }).strict();
export type ProfileIdentity = z.infer<typeof ProfileIdentitySchema>;
// Adapter-owned data is validated again by the owning adapter, never exposed in public DTOs.
export const ProviderWireStateSchema = z.object({ schemaVersion: z.literal(1), identity: ProfileIdentitySchema, data: z.json() }).strict();
export type ProviderWireState = z.infer<typeof ProviderWireStateSchema>;
export function wireStateMatches(state: ProviderWireState, identity: ProfileIdentity): boolean {
  return state.identity.profileId === identity.profileId && state.identity.profileRevisionId === identity.profileRevisionId && state.identity.kind === identity.kind && state.identity.endpoint === identity.endpoint && state.identity.model === identity.model;
}
export const ProviderMessageSchema = MessageSchema.extend({ wireState: ProviderWireStateSchema.optional() });
export type ProviderMessage = z.infer<typeof ProviderMessageSchema>;
export const ToolSpecSchema = z.object({ name: z.string().min(1).max(128), description: z.string().max(16384), parameters: z.record(z.string(), z.json()) }).strict();
export type ToolSpec = z.infer<typeof ToolSpecSchema>;
export const ModelChunkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_delta'), text: z.string().max(262144) }).strict(),
  z.object({ type: z.literal('thinking_delta'), text: z.string().max(262144) }).strict(),
  z.object({ type: z.literal('tool_call'), call: ToolCallSchema }).strict(),
  z.object({ type: z.literal('wire_state'), state: ProviderWireStateSchema }).strict(),
  z.object({ type: z.literal('usage'), inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional() }).strict(),
  z.object({ type: z.literal('terminal'), outcome: z.enum(['completed', 'tool_calls', 'length', 'cancelled', 'failed']), error: PublicErrorSchema.optional() }).strict().refine(value => value.outcome === 'failed' ? value.error !== undefined : value.error === undefined, 'Only failed terminal outcomes require an error'),
]);
export type ModelChunk = z.infer<typeof ModelChunkSchema>;
export interface ModelRequest { messages: ProviderMessage[]; tools: ToolSpec[]; contextLimit: number; outputLimit: number; identity?: ProfileIdentity }
export interface ModelProvider { stream(request: ModelRequest, options: { signal: AbortSignal }): AsyncIterable<ModelChunk> }
export const OperationSchema = z.object({ id: IdSchema, runId: IdSchema, projectId: IdSchema, kind: z.enum(['read', 'write', 'command', 'research']), inputHash: DigestSchema, policyRevision: RevisionSchema, trustRevision: RevisionSchema, status: z.enum(['prepared', 'started', 'completed', 'failed', 'unknown']), createdAt: DateTimeSchema.optional(), finishedAt: DateTimeSchema.optional() }).strict();
export type Operation = z.infer<typeof OperationSchema>;
export const ApprovalSchema = z.object({ operationId: IdSchema, projectId: IdSchema, inputHash: DigestSchema, policyRevision: RevisionSchema, trustRevision: RevisionSchema, decision: z.enum(['allow', 'deny']) }).strict();
export type Approval = z.infer<typeof ApprovalSchema>;
export const ChangeSchema = z.object({ id: IdSchema, projectId: IdSchema, runId: IdSchema, operationId: IdSchema, path: z.string().min(1).max(32767), beforeHash: DigestSchema.nullable(), afterHash: DigestSchema.nullable(), status: z.enum(['applied', 'undone', 'conflict', 'unknown']), snapshotAvailable: z.boolean(), createdAt: DateTimeSchema }).strict();
export type Change = z.infer<typeof ChangeSchema>;
export const BackendSchema = z.enum(['cpu', 'cuda', 'vulkan', 'rocm']);
export type Backend = z.infer<typeof BackendSchema>;
const Bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const CpuSchema = z.object({ architecture: z.enum(['x64', 'x86', 'arm64', 'arm', 'unknown']), name: z.string().min(1).max(256), logicalProcessors: z.number().int().min(1).max(65536) }).strict();
export const HardwareAdapterSchema = z.object({ id: IdSchema, name: z.string().min(1).max(256), vendorId: z.number().int().nonnegative(), deviceId: z.number().int().nonnegative(), dedicatedBytes: Bytes, availableBytes: Bytes.nullable(), driver: z.string().max(256).nullable() }).strict();
export const HardwareSchema = z.object({ fingerprint: DigestSchema, runtimeIdentity: z.string().min(1).max(256), totalRamBytes: Bytes, availableRamBytes: Bytes, cpu: CpuSchema, adapters: z.array(HardwareAdapterSchema).max(32), warnings: z.array(z.string().max(128)).max(32) }).strict();
export type Hardware = z.infer<typeof HardwareSchema>;
export const ConfigurationIdentitySchema = z.object({ modelDigest: DigestSchema, runtimeDigest: DigestSchema, backend: BackendSchema, quantization: z.string().min(1).max(64), contextTokens: z.number().int().positive(), parallelism: z.literal(1) }).strict();
export type ConfigurationIdentity = z.infer<typeof ConfigurationIdentitySchema>;
export const LabReceiptSchema = ConfigurationIdentitySchema.extend({ id: IdSchema, schemaVersion: z.literal(1), suiteVersion: z.string().min(1).max(128), quality: z.number().min(0).max(1), toolsPassed: z.boolean(), unauthorizedEffects: z.number().int().nonnegative(), writesAfterCancellation: z.number().int().nonnegative(), labHardwareFingerprint: z.string().min(1).max(256), qualifiedAt: DateTimeSchema, evidenceDigest: DigestSchema });
export type LabReceipt = z.infer<typeof LabReceiptSchema>;
export const MachineReceiptSchema = ConfigurationIdentitySchema.extend({ id: IdSchema, schemaVersion: z.literal(1), receiptKind: z.literal('machine'), labReceiptId: IdSchema, activationSetId: IdSchema, hardwareFingerprint: z.string().min(1).max(256), observedBackend: BackendSchema, adapterIds: z.array(IdSchema).max(32), requiredRamBytes: Bytes, requiredVramBytes: Bytes.nullable(), loadLatencyMs: z.number().nonnegative(), firstTokenMs: z.number().nonnegative(), tokensPerSecond: z.number().nonnegative(), toolsPassed: z.boolean(), quality: z.number().min(0).max(1), measuredAt: DateTimeSchema });
export type MachineReceipt = z.infer<typeof MachineReceiptSchema>;
