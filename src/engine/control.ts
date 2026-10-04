import { GitHubInputSchema, GitHubErrorCodeSchema } from '../shared/github';
import { z } from 'zod';
import { RequestSchema, ProfileSchema, ProjectPolicySchema, EventSchema, IdSchema, ResearchSchema, ResearchStatusSchema, ToolCallSchema, ToolSpecSchema } from '../shared';
import { ResearchCodeSchema, ResearchTargetSchema, ResearchVerificationSchema, WorkflowRunIdSchema } from './research';
import { CommandInputSchema, CommandPlanSchema, CommandResultSchema } from '../shared/commands';
import { TokenUsageSchema } from '../shared/context';
import { ResearchReviewBeginSchema, ResearchReviewContextRequestSchema, ReviewDigestSchema, ReviewedPackageSchema, ReviewToolErrorSchema, ReviewToolInputSchema, ReviewToolNameSchema, ReviewToolResultSchema } from './review-contract';

const id = z.string().min(1).max(128);
const { hasCredential: _hasCredential, ...storedProfileShape } = ProfileSchema.shape;
export const StoredProfileSchema = z.object({ ...storedProfileShape, secretRef: id.optional() }).strict().refine(profile => profile.outputTokens <= profile.contextTokens);
export const ControlSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('project.register'), requestId: id, inputHash: z.string(), rootPath: z.string().max(32767), name: z.string().max(256), projectId: id.optional() }).strict(),
  z.object({ method: z.literal('profile.save'), requestId: id, inputHash: z.string(), profile: StoredProfileSchema }).strict(),
  z.object({ method: z.literal('profile.get'), profileId: id }).strict(),
  z.object({ method: z.literal('profile.revision'), revisionId: id }).strict(),
  z.object({ method: z.literal('run.context'), runId: id }).strict(),
  z.object({ method: z.literal('command.context'), runId: id, operationId: id.optional() }).strict(),
  z.object({ method: z.literal('vault.references') }).strict(),
  z.object({ method: z.literal('request.lookup'), requestId: id, requestMethod: z.string(), inputHash: z.string() }).strict(),
  z.object({ method: z.literal('research.context'), researchId: id }).strict(),
  // Main records collector and packaging facts. User cancellation is not reachable from here, and `approved` only
  // through the v4 readiness rule (docs/specification/research-review.md).
  z.object({ method: z.literal('research.transition'), requestId: id, researchId: id, expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    to: z.enum(['dispatching', 'collecting', 'collected', 'failed', 'cancelled', 'packaging', 'approved', 'not_ready']), cause: ResearchCodeSchema,
    target: ResearchTargetSchema.optional(), workflowRunId: WorkflowRunIdSchema.optional(), failure: ResearchCodeSchema.optional(), verification: ResearchVerificationSchema.optional(),
    reviewDigest: ReviewDigestSchema.optional(), reviewedPackage: ReviewedPackageSchema.optional() }).strict(),
  // `reviewFolders`: the names under storage/review, so recovery can say which whole job folders to discard.
  z.object({ method: z.literal('research.recover'), owned: z.array(id).max(1000), reviewFolders: z.array(id).max(1000).optional() }).strict(),
  ResearchReviewBeginSchema,
  ResearchReviewContextRequestSchema,
  // Main's policy route (research-review-ui spec section 4) reads only what its guard needs, never a session's history.
  z.object({ method: z.literal('policy.guard'), projectId: id }).strict(),
  z.object({ method: z.literal('session.project'), sessionId: id }).strict(),
  // Main's purge (docs/specification/research-purge.md) reads every job's retained digests in one read.
  z.object({ method: z.literal('research.retained') }).strict(),
  z.object({ method: z.literal('shutdown') }).strict(),
]);
export type Control = z.infer<typeof ControlSchema>;
/**
 * `policy.guard`: the project's stored policy revision and inference level, and whether a run not in `research` mode is
 * unfinished; null for no project. The revision lets main refuse a stale `expectedRevision` before it stops anything.
 */
export const PolicyGuardResultSchema = z.object({ revision: ProjectPolicySchema.shape.revision, inference: ProjectPolicySchema.shape.inference, nonResearchRunActive: z.boolean() }).strict().nullable();
/** `session.project`: the session's project (null for a folder-free chat); the whole result is null when there is no such session. */
/** `research.retained`: every job's id, project, status, collected digest (from the collected verification) and reviewed package digest. */
export const ResearchRetainedResultSchema = z.object({ jobs: z.array(z.object({ id, projectId: id, status: ResearchStatusSchema, collected: z.string().regex(/^[0-9a-f]{64}$/).nullable(), reviewed: z.string().regex(/^[0-9a-f]{64}$/).nullable() }).strict()).max(100000) }).strict();
export const SessionProjectResultSchema = z.object({ projectId: id.nullable() }).strict().nullable();
/** The bare code an engine failure crosses the process boundary as. Main's collector maps errors the same way. */
export function engineFailureCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  return /^[A-Z_]{2,80}$/.test(raw) ? raw : /request.*reused/i.test(raw) ? 'REQUEST_CONFLICT' : 'INTERNAL_ERROR';
}
type JsonValue = z.infer<ReturnType<typeof z.json>>;
type JsonObject = Record<string, JsonValue>;
// Check depth before the recursive JSON schema can consume an untrusted tree.
export const BoundedJsonObjectSchema = z.custom<JsonObject>((value: unknown): value is JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  while (queue.length) {
    const item = queue.pop()!;
    if (++nodes > 10000 || item.depth > 32) return false;
    if (item.value === null || typeof item.value === 'string' || typeof item.value === 'boolean') continue;
    if (typeof item.value === 'number') { if (!Number.isFinite(item.value)) return false; continue; }
    if (typeof item.value !== 'object') return false;
    if (seen.has(item.value)) return false;
    seen.add(item.value);
    if (!Array.isArray(item.value) && Object.getPrototypeOf(item.value) !== Object.prototype && Object.getPrototypeOf(item.value) !== null) return false;
    for (const child of Object.values(item.value)) queue.push({ value: child, depth: item.depth + 1 });
  }
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 131072; } catch { return false; }
}, 'Expected a bounded JSON object');
export const InferenceToolCallSchema = ToolCallSchema.extend({ input: BoundedJsonObjectSchema }).refine(call => call.inputError === undefined, 'Invalid arguments cannot be submitted for execution');
export const InferenceToolCallsSchema = z.array(InferenceToolCallSchema).min(1).max(128).refine(calls => new Set(calls.map(call => call.id)).size === calls.length, 'Duplicate tool call identity');
export const InferenceToolsSchema = z.array(ToolSpecSchema.extend({ name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/), parameters: BoundedJsonObjectSchema })).max(128).refine(tools => new Set(tools.map(tool => tool.name)).size === tools.length, 'Duplicate tool declaration');
export const InferenceMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string().max(2_000_000),
  toolCalls: InferenceToolCallsSchema.optional(), toolCallId: IdSchema.optional(), toolName: z.string().min(1).max(128).optional(),
}).strict().refine(message => {
  if (message.role === 'tool') return message.toolCallId !== undefined && message.toolCalls === undefined;
  if (message.toolCallId !== undefined || message.toolName !== undefined) return false;
  return message.role === 'assistant' || message.toolCalls === undefined;
}, 'Tool data does not match the message role');
export const InferenceMessagesSchema = z.array(InferenceMessageSchema).max(1000);
export const CompletionSchema = z.object({ content: z.string().max(2_000_000), outcome: z.enum(['complete', 'incomplete', 'blocked', 'tool_calls']), toolCalls: InferenceToolCallsSchema.optional(), usage: TokenUsageSchema.optional() }).strict()
  .refine(result => result.outcome === 'tool_calls' ? result.toolCalls !== undefined : result.toolCalls === undefined, 'Only complete tool-call outcomes may contain executable calls');
const identity = { epoch: id, id };
export const ToEngineSchema = z.discriminatedUnion('type', [
  z.object({ ...identity, type: z.literal('github.result'), result: z.string().max(262144) }).strict(),
  z.object({ ...identity, type: z.literal('github.error'), code: GitHubErrorCodeSchema }).strict(),
  z.object({ ...identity, type: z.literal('request'), request: RequestSchema }).strict(),
  z.object({ ...identity, type: z.literal('control'), control: ControlSchema }).strict(),
  z.object({ ...identity, type: z.literal('inference.result'), result: CompletionSchema }).strict(),
  z.object({ ...identity, type: z.literal('inference.error'), code: z.enum(['RUN_CANCELLED', 'PROVIDER_ERROR', 'CONTEXT_LIMIT']) }).strict(),
  z.object({ ...identity, type: z.literal('command.prepared'), result: CommandPlanSchema }).strict(),
  z.object({ ...identity, type: z.literal('command.result'), result: CommandResultSchema }).strict(),
  z.object({ ...identity, type: z.literal('research.tool.result'), result: ReviewToolResultSchema }).strict(),
  z.object({ ...identity, type: z.literal('research.tool.error'), code: ReviewToolErrorSchema }).strict(),
  z.object({ ...identity, type: z.literal('command.error'), code: z.enum(['RUN_CANCELLED', 'COMMAND_UNAVAILABLE', 'COMMAND_CHANGED', 'APPROVAL_STALE', 'COMMAND_UNKNOWN', 'GIT_UNAVAILABLE', 'GIT_UNSAFE_REPOSITORY', 'GIT_INSPECTION_LIMIT']) }).strict(),
]);
export const FromEngineSchema = z.discriminatedUnion('type', [
  z.object({ ...identity, type: z.literal('github.read'), runId: id, input: GitHubInputSchema }).strict(),
  z.object({ epoch: id, type: z.literal('ready') }).strict(),
  z.object({ ...identity, type: z.literal('reply'), result: z.unknown() }).strict(),
  z.object({ ...identity, type: z.literal('failure'), code: z.string().max(128) }).strict(),
  z.object({ epoch: id, type: z.literal('event'), event: EventSchema }).strict(),
  z.object({ epoch: id, type: z.literal('research'), research: ResearchSchema }).strict(),
  z.object({ ...identity, type: z.literal('inference'), runId: id, messages: InferenceMessagesSchema, tools: InferenceToolsSchema.optional() }).strict(),
  z.object({ epoch: id, type: z.literal('inference.cancel'), runId: id }).strict(),
  z.object({ ...identity, type: z.literal('command.prepare'), runId: id, input: CommandInputSchema }).strict(),
  z.object({ ...identity, type: z.literal('research.tool'), runId: id, name: ReviewToolNameSchema, input: ReviewToolInputSchema }).strict(),
  z.object({ ...identity, type: z.literal('command.execute'), runId: id, operationId: id }).strict(),
  z.object({ ...identity, type: z.literal('git.inspect'), runId: id, name: z.enum(['git_status', 'git_diff', 'git_log']), input: BoundedJsonObjectSchema }).strict(),
]);
