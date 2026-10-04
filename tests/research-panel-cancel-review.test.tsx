// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import type { Research } from '../src/shared';
import { ResearchPanel } from '../src/renderer/ResearchPanel';
import { CANCEL_REVIEW_TEXT, REVIEW_CANCEL_STATUS } from '../src/renderer/research-text';

// P5-12 / G3 (Task 5 gap-audit): Cancel review is terminal, so it asks first, and a cancelled review is described as one.
afterEach(cleanup);
const now = '2026-10-03T00:00:00Z';
const project = { id: 'p1', name: 'My project', pathLabel: 'C:\\work\\my-project', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only' as const, research: 'public-technical' as const }, missing: false, createdAt: now };
const collector = { revision: 1, repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', tokenConfigured: true };
const job = (patch: Partial<Research> = {}): Research => ({ id: 'r1', projectId: project.id, revision: 3, status: 'reviewing', topic: 'Vector databases', clientRef: 'mz-abc', reviewSessionId: 's-review', reviewRunId: 'run-1', createdAt: now, updatedAt: now, ...patch });
function bridge({ jobs = [] as Research[], routes = {} as Record<string, (params: Record<string, unknown>) => unknown> } = {}) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      calls.push({ method, params });
      if (routes[method]) return routes[method](params);
      if (method === 'research.list') return { research: jobs };
      if (method === 'research.collector.read') return { collector };
      if (method === 'profile.list') return { profiles: [] };
      throw new Error('Unexpected route');
    },
    onEvent: () => () => {},
    onResearch: () => () => {},
  };
  return { api, calls, cancels: () => calls.filter(call => call.method === 'research.cancel') };
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const COLLECTION_CANCELLING = 'Stopping the collector. A run already started on GitHub is not cancelled there.';
const COLLECTION_CANCELLED = 'Moonzila stopped following this collection. A run already started on GitHub was not cancelled there.';

test.each(['reviewing', 'packaging'] as const)('Cancel review on a %s job asks first; Keep the review sends nothing, and only the confirm cancels', async status => {
  // Guard: the confirmation (mutation: Cancel review calls research.cancel at once).
  const { api, cancels } = bridge({ jobs: [job({ status })], routes: { 'research.cancel': () => ({ research: job({ status: 'cancelling', revision: 4 }) }) } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel review' }));
  const group = screen.getByRole('group', { name: CANCEL_REVIEW_TEXT.title });
  expect(group.textContent).toMatch(/cannot be resumed/);
  expect(group.textContent).toMatch(/Stop in the review conversation/);
  expect(within(group).getAllByRole('button').map(button => button.textContent)).toEqual([CANCEL_REVIEW_TEXT.keep, 'Cancel review']);
  // While it is open, the only Cancel review button is its confirm.
  expect(screen.getAllByRole('button', { name: 'Cancel review' })).toHaveLength(1);
  fireEvent.click(within(group).getByRole('button', { name: CANCEL_REVIEW_TEXT.keep }));
  expect(screen.queryByRole('group', { name: CANCEL_REVIEW_TEXT.title })).toBeNull();
  await settle();
  expect(cancels()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel review' }));
  fireEvent.click(within(screen.getByRole('group', { name: CANCEL_REVIEW_TEXT.title })).getByRole('button', { name: 'Cancel review' }));
  await waitFor(() => expect(cancels().map(call => call.params)).toEqual([{ researchId: 'r1' }]));
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toBe('Stopping'));
  expect(screen.queryByRole('group', { name: CANCEL_REVIEW_TEXT.title })).toBeNull();
});

test.each([['cancelling', REVIEW_CANCEL_STATUS.cancelling, COLLECTION_CANCELLING], ['cancelled', REVIEW_CANCEL_STATUS.cancelled, COLLECTION_CANCELLED]] as const)('a %s job with a review run reads the review text, not the collection text', async (status, review, collection) => {
  // Guard: the text is chosen by reviewRunId (mutation: always the collection text).
  render(<ResearchPanel api={bridge({ jobs: [job({ status })] }).api} project={project} />);
  expect(await screen.findByText(review)).toBeTruthy();
  expect(screen.queryByText(collection)).toBeNull();
});

test.each([['cancelling', REVIEW_CANCEL_STATUS.cancelling, COLLECTION_CANCELLING], ['cancelled', REVIEW_CANCEL_STATUS.cancelled, COLLECTION_CANCELLED]] as const)('a %s job without a review run keeps the collection text', async (status, review, collection) => {
  // Guard: the same choice the other way (mutation: always the review text).
  render(<ResearchPanel api={bridge({ jobs: [job({ status, reviewRunId: undefined, reviewSessionId: undefined })] }).api} project={project} />);
  expect(await screen.findByText(collection)).toBeTruthy();
  expect(screen.queryByText(review)).toBeNull();
});

test('Cancel collection still cancels in one step', async () => {
  const { api, cancels } = bridge({ jobs: [job({ status: 'collecting', reviewRunId: undefined, reviewSessionId: undefined })], routes: { 'research.cancel': () => ({ research: job({ status: 'cancelling', revision: 4, reviewRunId: undefined }) }) } });
  render(<ResearchPanel api={api} project={project} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel collection' }));
  await waitFor(() => expect(cancels()).toHaveLength(1));
  expect(screen.queryByRole('group', { name: CANCEL_REVIEW_TEXT.title })).toBeNull();
});

test('no cancel-review text says approve or authorize', () => {
  for (const text of [CANCEL_REVIEW_TEXT.title, CANCEL_REVIEW_TEXT.keep, CANCEL_REVIEW_TEXT.confirm, ...CANCEL_REVIEW_TEXT.points, REVIEW_CANCEL_STATUS.cancelling, REVIEW_CANCEL_STATUS.cancelled]) expect(text).not.toMatch(/authori[sz]e|approv/i);
});
