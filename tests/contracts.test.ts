import { describe, expect, test } from 'vitest';
import {
  ApprovalSchema, EventSchema, HostMessageSchema, MethodSpec, ModelChunkSchema,
  ProfileSchema, ProjectSchema, ProviderWireStateSchema, RequestSchema, ResponseSchema,
  RunEventsParams, authorizeHostMessage, parseResult, wireStateMatches,
} from '../src/shared/index';

const at = '2026-09-24T12:00:00.000Z';
const project = {
  id: 'p1', name: 'Example', pathLabel: 'Example', trusted: true, trustRevision: 1,
  policy: { revision: 1, inference: 'local-only', research: 'off' }, missing: false, createdAt: at,
};
const profile = {
  id: 'profile-1', name: 'Local', kind: 'ollama', endpoint: 'http://127.0.0.1:11434',
  model: 'test-model', contextTokens: 4096, outputTokens: 512, locality: 'local',
  hasCredential: false, revision: 1, revisionId: 'revision-1', createdAt: at, updatedAt: at,
};

describe('public renderer contracts', () => {
  test('bounds replay pagination and supplies defaults', () => {
    expect(RunEventsParams.parse({ runId: 'r1' })).toEqual({ runId: 'r1', after: 0, limit: 500 });
    expect(RunEventsParams.safeParse({ runId: 'r1', after: 0, limit: 1000 }).success).toBe(true);
    for (const input of [
      { runId: 'r1', limit: 1001 }, { runId: 'r1', after: -1 },
      { runId: 'r1', after: 0.5 }, { runId: 'r1', root: 'C:\\' },
    ]) expect(RunEventsParams.safeParse(input).success).toBe(false);
  });

  test.each(['', ' ', 'a'.repeat(129), 'id\u0000'])('rejects an invalid opaque ID %j', id => {
    expect(RequestSchema.safeParse({ protocolVersion: 1, clientRequestId: id, method: 'project.list', params: {} }).success).toBe(false);
  });

  test('rejects unknown routes, envelope fields, params, and nested policy fields', () => {
    for (const input of [
      { protocolVersion: 1, clientRequestId: '1', method: 'credential.read', params: {} },
      { protocolVersion: 1, clientRequestId: '1', method: 'project.list', params: {}, root: 'C:\\' },
      { protocolVersion: 1, clientRequestId: '1', method: 'project.pick', params: { path: 'C:\\' } },
      { protocolVersion: 1, clientRequestId: '1', method: 'project.policy.update', params: { projectId: 'p1', expectedRevision: 1, policy: { inference: 'local-only', research: 'off', trusted: true } } },
    ]) expect(RequestSchema.safeParse(input).success).toBe(false);
  });

  test('exposes every specified route with response and ownership validation', () => {
    const expected = [
      'project.pick', 'project.list', 'project.trust', 'project.revokeTrust', 'project.relink', 'project.forget', 'project.policy.update',
      'session.create', 'session.list', 'session.read', 'session.delete', 'session.branch', 'session.policy.update', 'run.start', 'run.cancel', 'run.events',
      'approval.decide', 'approval.list', 'approval.read', 'profile.list', 'profile.save', 'profile.test', 'profile.delete',
      'model.list', 'model.enable', 'model.cancel', 'model.import', 'model.remove', 'model.storage.change',
      'research.collector.read', 'research.collector.save', 'research.list', 'research.start', 'research.read', 'research.cancel', 'research.review.start', 'research.document.read', 'research.purge',
      'skill.list', 'mission.create', 'mission.read', 'mission.pause', 'mission.resume', 'mission.cancel',
      'settings.read', 'settings.save', 'diagnostics.export', 'external.open', 'changes.list', 'changes.read', 'changes.undo',
      'storage.read', 'recovery.list', 'recovery.inspect', 'recovery.acknowledge',
      'hardware.read', 'runtime.inspect',
    ];
    expect(Object.keys(MethodSpec).sort()).toEqual(expected.sort());
    for (const spec of Object.values(MethodSpec)) {
      expect(spec.params.safeParse({ unexpected: true }).success).toBe(false);
      expect(spec.result.safeParse({ unexpected: true }).success).toBe(false);
      expect(['main', 'engine']).toContain(spec.owner);
      expect(spec.authorization).toBeTruthy();
    }
    expect(MethodSpec['profile.save'].owner).toBe('main');
    expect(MethodSpec['run.start'].owner).toBe('engine');
  });

  test('accepts write-only credentials but rejects renderer trust in locality or secret references', () => {
    const params = { name: 'Test', kind: 'openai-compatible', endpoint: 'https://example.test/v1', model: 'test', contextTokens: 4096, outputTokens: 512, secret: 'write-only-test' };
    expect(MethodSpec['profile.save'].params.safeParse(params).success).toBe(true);
    for (const extra of [{ secretRef: 'vault-ref' }, { locality: 'local' }, { hasCredential: true }]) {
      expect(MethodSpec['profile.save'].params.safeParse({ ...params, ...extra }).success).toBe(false);
    }
    expect(MethodSpec['profile.save'].params.safeParse({ ...params, outputTokens: 8192 }).success).toBe(false);
  });

  test('public project/profile/message responses reject private process data', () => {
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
    expect(ProjectSchema.safeParse({ ...project, rootPath: 'C:\\private' }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...profile, secretRef: 'vault-1' }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...profile, secret: 'secret' }).success).toBe(false);
    expect(() => parseResult('project.list', { projects: [{ ...project, rootPath: 'C:\\private' }] })).toThrow();
    expect(() => parseResult('session.read', { session: { id: 's1', projectId: 'p1', title: 'Chat', createdAt: at, updatedAt: at }, messages: [{ id: 'm1', sessionId: 's1', role: 'assistant', content: 'Hi', createdAt: at, wireState: {} }], runs: [] })).toThrow();
  });

  test('validates result shape against its method and rejects leaked error details', () => {
    expect(ResponseSchema.safeParse({ protocolVersion: 1, clientRequestId: '1', method: 'project.list', ok: true, result: { projects: [project] } }).success).toBe(true);
    expect(ResponseSchema.safeParse({ protocolVersion: 1, clientRequestId: '1', method: 'project.list', ok: true, result: { profiles: [profile] } }).success).toBe(false);
    const failure = { protocolVersion: 1, clientRequestId: '1', method: 'project.list', ok: false, error: { code: 'INVALID_REQUEST', message: 'Invalid request', retry: 'never' } };
    expect(ResponseSchema.safeParse(failure).success).toBe(true);
    expect(ResponseSchema.safeParse({ ...failure, error: { ...failure.error, stack: 'private stack' } }).success).toBe(false);
    expect(ResponseSchema.safeParse({ ...failure, error: { ...failure.error, code: 'ARBITRARY' } }).success).toBe(false);
  });

  test('requires current change content identity before journaled undo', () => {
    expect(MethodSpec['changes.undo'].params.safeParse({ projectId: 'p1', changeId: 'c1' }).success).toBe(false);
    expect(MethodSpec['changes.undo'].params.safeParse({ projectId: 'p1', changeId: 'c1', expectedAfterHash: 'a'.repeat(64) }).success).toBe(true);
  });

  test('approval decisions include trust, policy and immutable operation input identities', () => {
    const approval = { operationId: 'o1', projectId: 'p1', inputHash: 'a'.repeat(64), policyRevision: 1, trustRevision: 2, decision: 'allow' };
    expect(ApprovalSchema.safeParse(approval).success).toBe(true);
    const { trustRevision: _trustRevision, ...oldApproval } = approval;
    expect(ApprovalSchema.safeParse(oldApproval).success).toBe(false);
  });

  test.each(['file:///C:/private', 'javascript:alert(1)', 'https://user:secret@example.test', 'ftp://example.test'])('rejects nonpublic external URL %s', url => {
    expect(MethodSpec['external.open'].params.safeParse({ url }).success).toBe(false);
  });
});

describe('durable events', () => {
  const base = { schemaVersion: 1, engineEpoch: 'epoch-1', runId: 'r1', seq: 1, at: 1_000 };
  test('binds each event type to its strict payload', () => {
    expect(EventSchema.safeParse({ ...base, type: 'message.delta', payload: { messageId: 'm1', text: 'Hello' } }).success).toBe(true);
    for (const event of [
      { ...base, type: 'message.delta', payload: { status: 'running' } },
      { ...base, type: 'message.delta', payload: { messageId: 'm1', text: 'Hello', secretRef: 'private' } },
      { ...base, type: 'arbitrary', payload: {} },
      { ...base, seq: 0, type: 'run.status', payload: { status: 'running' } },
      { ...base, schemaVersion: 2, type: 'run.status', payload: { status: 'running' } },
    ]) expect(EventSchema.safeParse(event).success).toBe(false);
  });
});

describe('provider identity and terminal outcomes', () => {
  const identity = { profileId: 'profile-1', profileRevisionId: 'revision-1', kind: 'ollama' as const, endpoint: 'http://127.0.0.1:11434', model: 'test-model' };
  const state = { schemaVersion: 1 as const, identity, data: { signed: 'opaque' } };
  test('continuation state must match the full immutable profile identity', () => {
    expect(ProviderWireStateSchema.safeParse(state).success).toBe(true);
    expect(wireStateMatches(state, identity)).toBe(true);
    for (const mismatch of [{ profileRevisionId: 'revision-2' }, { profileId: 'other' }, { kind: 'anthropic' as const }, { endpoint: 'https://other.test' }, { model: 'other' }]) {
      expect(wireStateMatches(state, { ...identity, ...mismatch })).toBe(false);
    }
  });
  test('requires terminal outcome instead of interpreting EOF as success', () => {
    expect(ModelChunkSchema.safeParse({ type: 'terminal', outcome: 'completed' }).success).toBe(true);
    expect(ModelChunkSchema.safeParse({ type: 'terminal', outcome: 'tool_calls' }).success).toBe(true);
    expect(ModelChunkSchema.safeParse({ type: 'terminal', outcome: 'length' }).success).toBe(true);
    expect(ModelChunkSchema.safeParse({ type: 'terminal', outcome: 'failed', error: { code: 'PROVIDER_ERROR', message: 'Provider failed', retry: 'never' } }).success).toBe(true);
    expect(ModelChunkSchema.safeParse({ type: 'terminal', outcome: 'failed' }).success).toBe(false);
    expect(ModelChunkSchema.safeParse({ type: 'terminal', outcome: 'unknown' }).success).toBe(false);
  });
});

describe('main-owned host capabilities', () => {
  const message = {
    schemaVersion: 1, id: 'h1', engineEpoch: 'epoch-1', type: 'network.request',
    payload: { purpose: 'inference', contextId: 'r1', profileId: 'profile-1', profileRevisionId: 'revision-1', requestId: 'n1', path: '/api/chat', method: 'POST', body: '{}', timeoutMs: 30_000, maxBytes: 1_000_000 },
  };
  const grant = { engineEpoch: 'epoch-1', purpose: 'inference' as const, contextId: 'r1', profileId: 'profile-1', profileRevisionId: 'revision-1', active: true, capabilities: ['network.request' as const] };
  test('accepts only declared host messages and excludes caller-provided credentials/destinations', () => {
    expect(HostMessageSchema.safeParse(message).success).toBe(true);
    for (const extra of [{ url: 'https://evil.test' }, { secretRef: 'other' }, { headers: { Authorization: 'secret' } }]) {
      expect(HostMessageSchema.safeParse({ ...message, payload: { ...message.payload, ...extra } }).success).toBe(false);
    }
    expect(HostMessageSchema.safeParse({ ...message, type: 'secret.read' }).success).toBe(false);
  });
  test('rejects stale epochs, inactive contexts and mismatched grants', () => {
    expect(authorizeHostMessage(message, grant)).toBe(true);
    for (const mismatch of [
      { engineEpoch: 'epoch-old' }, { contextId: 'other' }, { active: false },
      { purpose: 'provider-test' as const }, { profileRevisionId: 'revision-2' },
      { capabilities: [] },
    ]) expect(authorizeHostMessage(message, { ...grant, ...mismatch })).toBe(false);
  });
});
