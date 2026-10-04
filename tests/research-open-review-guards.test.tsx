// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { App } from '../src/renderer/App';

// Open review in the workbench (unit review P4-6): a late conversation list never lands in another project, and the
// conversation never switches while the workbench refuses a switch from the conversation list.
afterEach(cleanup);
const now = '2026-10-04T00:00:00Z';
const policy = { revision: 1, inference: 'local-only', research: 'public-technical' };
const first = { id: 'p1', name: 'My project', pathLabel: 'C:\\work\\my-project', trusted: true, trustRevision: 1, policy, missing: false, createdAt: now };
const second = { ...first, id: 'p2', name: 'Other project', pathLabel: 'C:\\work\\other' };
const sessionPolicy = { revision: 1, inference: 'local-only' };
const ordinary = { id: 's-ask', projectId: 'p1', policy: sessionPolicy, title: 'Earlier question', createdAt: now, updatedAt: now };
const review = { id: 's-review', projectId: 'p1', policy: sessionPolicy, title: 'Review: Vector databases', createdAt: now, updatedAt: now };
const elsewhere = { id: 's-other', projectId: 'p2', policy: sessionPolicy, title: 'Other project chat', createdAt: now, updatedAt: now };
const job = { id: 'r1', projectId: 'p1', revision: 3, status: 'reviewing', topic: 'Vector databases', clientRef: 'mz-abc', reviewSessionId: 's-review', reviewRunId: 'run-1', createdAt: now, updatedAt: now };
const run = { id: 'run-ask', sessionId: 's-ask', projectId: 'p1', sessionPolicyRevision: 1, mode: 'ask', status: 'running', profileId: 'local', profileRevisionId: 'rev', policyRevision: 1, trustRevision: 1, createdAt: now };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

function workbench(routes: Record<string, (params: Record<string, unknown>) => unknown>) {
  const reads: unknown[] = [];
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      if (routes[method]) return routes[method](params);
      if (method === 'session.read') { reads.push(params); return { session: params.sessionId === 's-review' ? review : ordinary, messages: [], runs: [], context: null, usage: null, failure: null }; }
      if (method === 'project.list') return { projects: [first, second] };
      if (method === 'profile.list') return { profiles: [] };
      if (method === 'changes.list') return { changes: [], hasMore: false };
      if (method === 'recovery.list') return { items: [], hasMore: false, pendingCount: 0 };
      if (method === 'storage.read') return { usedBytes: 0, limitBytes: 268435456, snapshotCount: 0, protectedBytes: 0 };
      if (method === 'settings.read') return { settings: { theme: 'system' } };
      if (method === 'research.list') return { research: params.projectId === 'p1' ? [job] : [] };
      if (method === 'research.collector.read') return { collector: null };
      throw new Error('Unexpected route');
    },
    onEvent: () => () => {},
    onResearch: () => () => {},
  };
  return { api, reads };
}

test('a conversation list that arrives after switching project is discarded', async () => {
  const late = deferred<unknown>(); let p1Lists = 0;
  const { api } = workbench({ 'session.list': params => {
    if (params.projectId === 'p2') return { sessions: [elsewhere] };
    p1Lists += 1; return p1Lists === 1 ? { sessions: [ordinary] } : late.promise;
  } });
  render(<App api={api} />);
  await screen.findByRole('heading', { name: first.name });
  fireEvent.click(screen.getByRole('button', { name: 'Open research' }));
  fireEvent.click(await within(await screen.findByRole('dialog', { name: 'Research' })).findByRole('button', { name: 'Open review' }));
  await waitFor(() => expect(p1Lists).toBe(2));
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Projects' })).getByRole('button', { name: /Other project/ }));
  const conversations = screen.getByRole('navigation', { name: 'Conversations' });
  await waitFor(() => expect(within(conversations).getByRole('button', { name: 'Other project chat' })).toBeTruthy());
  await act(async () => late.resolve({ sessions: [review, ordinary] }));
  expect(within(conversations).queryByRole('button', { name: 'Review: Vector databases' })).toBeNull();
  expect(within(conversations).getByRole('button', { name: 'Other project chat' })).toBeTruthy();
});

test('Open review is disabled, with the reason, while the open conversation has an active run', async () => {
  const { api, reads } = workbench({
    'session.list': () => ({ sessions: [ordinary] }),
    'session.read': params => { reads.push(params); return { session: ordinary, messages: [], runs: [run], context: null, usage: null, failure: null }; },
  });
  render(<App api={api} />);
  fireEvent.click(await within(await screen.findByRole('navigation', { name: 'Conversations' })).findByRole('button', { name: 'Earlier question' }));
  await screen.findByRole('button', { name: 'Stop run' });
  fireEvent.click(screen.getByRole('button', { name: 'Open research' }));
  const dialog = await screen.findByRole('dialog', { name: 'Research' });
  const open = await within(dialog).findByRole('button', { name: 'Open review' });
  expect(open.hasAttribute('disabled')).toBe(true);
  expect(within(dialog).getByText('Finish or stop the running task in this conversation before opening the review.')).toBeTruthy();
  fireEvent.click(open);
  expect(screen.getByRole('dialog', { name: 'Research' })).toBeTruthy();
  expect(reads).not.toContainEqual({ sessionId: 's-review' });
});
