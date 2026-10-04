// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { App } from '../src/renderer/App';

afterEach(cleanup);
const now = '2026-10-04T00:00:00Z';
const project = { id: 'p1', name: 'My project', pathLabel: 'C:\\work\\my-project', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'public-technical' }, missing: false, createdAt: now };
const policy = { revision: 1, inference: 'local-only' };
const ordinary = { id: 's-ask', projectId: 'p1', policy, title: 'Earlier question', createdAt: now, updatedAt: now };
const review = { id: 's-review', projectId: 'p1', policy, title: 'Review: Vector databases', createdAt: now, updatedAt: now };
const job = { id: 'r1', projectId: 'p1', revision: 3, status: 'reviewing', topic: 'Vector databases', clientRef: 'mz-abc', reviewSessionId: 's-review', reviewRunId: 'run-1', createdAt: now, updatedAt: now };

test('Open review closes the research dialog and opens the review conversation in the workbench', async () => {
  // The review conversation is created after the workbench listed this project's conversations.
  let sessions = [ordinary]; const reads: unknown[] = [];
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      if (method === 'project.list') return { projects: [project] };
      if (method === 'profile.list') return { profiles: [] };
      if (method === 'session.list') { const result = { sessions }; sessions = [review, ordinary]; return result; }
      if (method === 'session.read') { reads.push(params); return { session: params.sessionId === 's-review' ? review : ordinary, messages: [], runs: [], context: null, usage: null, failure: null }; }
      if (method === 'changes.list') return { changes: [], hasMore: false };
      if (method === 'recovery.list') return { items: [], hasMore: false, pendingCount: 0 };
      if (method === 'storage.read') return { usedBytes: 0, limitBytes: 268435456, snapshotCount: 0, protectedBytes: 0 };
      if (method === 'settings.read') return { settings: { theme: 'system' } };
      if (method === 'research.list') return { research: [job] };
      if (method === 'research.collector.read') return { collector: null };
      throw new Error('Unexpected route');
    },
    onEvent: () => () => {},
    onResearch: () => () => {},
  };
  render(<App api={api} />);
  await screen.findByRole('heading', { name: project.name });
  fireEvent.click(screen.getByRole('button', { name: 'Open research' }));
  const dialog = await screen.findByRole('dialog', { name: 'Research' });
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Open review' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Research' })).toBeNull());
  await waitFor(() => expect(reads).toContainEqual({ sessionId: 's-review' }));
  const nav = screen.getByRole('navigation', { name: 'Conversations' });
  await waitFor(() => expect(within(nav).getByRole('button', { name: 'Review: Vector databases' }).className).toContain('selected'));
});

test('in the opened review conversation, the active research run labels its approval card as the research workspace', async () => {
  const hash = `sha256:${'a'.repeat(64)}`;
  const run = { id: 'run-1', sessionId: 's-review', projectId: 'p1', sessionPolicyRevision: 1, mode: 'research', status: 'awaiting_approval', profileId: 'pr1', profileRevisionId: 'prr1', policyRevision: 1, trustRevision: 1, createdAt: now };
  const operation = { id: 'op1', runId: 'run-1', projectId: 'p1', kind: 'write', inputHash: hash, policyRevision: 1, trustRevision: 1, status: 'prepared' };
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      if (method === 'project.list') return { projects: [project] };
      if (method === 'profile.list') return { profiles: [] };
      if (method === 'session.list') return { sessions: [review] };
      if (method === 'session.read') return { session: review, messages: [], runs: params.sessionId === 's-review' ? [run] : [], context: null, usage: null, failure: null };
      if (method === 'changes.list') return { changes: [], hasMore: false };
      if (method === 'approval.list') return { operations: params.runId === 'run-1' ? [operation] : [] };
      if (method === 'approval.read') return { kind: 'write', operation, path: 'research/BRIEF.md', before: 'old', after: 'new' };
      if (method === 'recovery.list') return { items: [], hasMore: false, pendingCount: 0 };
      if (method === 'storage.read') return { usedBytes: 0, limitBytes: 268435456, snapshotCount: 0, protectedBytes: 0 };
      if (method === 'settings.read') return { settings: { theme: 'system' } };
      if (method === 'research.list') return { research: [] };
      if (method === 'research.collector.read') return { collector: null };
      throw new Error(`Unexpected route ${method}`);
    },
    onEvent: () => () => {},
    onResearch: () => () => {},
  };
  render(<App api={api} />);
  await screen.findByRole('heading', { name: project.name });
  // App must pass the active run's mode, so the card never reads like an edit to the user's project.
  fireEvent.click(await within(screen.getByRole('navigation', { name: 'Conversations' })).findByRole('button', { name: 'Review: Vector databases' }));
  await screen.findByText('Research workspace · research/BRIEF.md');
  expect(screen.queryByText(/Review edit/)).toBeNull();
});
