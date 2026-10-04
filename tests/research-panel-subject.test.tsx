// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import type { Research } from '../src/shared';
import { ResearchPanel } from '../src/renderer/ResearchPanel';

// P5-11 / G1 (Task 5 gap-audit): any earlier job can be made the panel's subject, so its per-status controls apply.
afterEach(cleanup);
const now = '2026-10-03T00:00:00Z';
const project = { id: 'p1', name: 'My project', pathLabel: 'C:\\work\\my-project', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only' as const, research: 'public-technical' as const }, missing: false, createdAt: now };
const collector = { revision: 1, repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', tokenConfigured: true };
const localProfile = { id: 'local', name: 'Local model', kind: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'qwen', contextTokens: 8192, outputTokens: 1024, locality: 'local' as const, hasCredential: false, revision: 1, revisionId: 'rev-local', createdAt: now, updatedAt: now };
const DIGEST = '0123456789abcdef'.repeat(4);
const job = (patch: Partial<Research> = {}): Research => ({ id: 'r1', projectId: project.id, revision: 2, status: 'failed', failure: 'RUN_FAILED', topic: 'Newer failed', clientRef: 'mz-abc', createdAt: '2026-10-04T00:00:00Z', updatedAt: now, ...patch });
const older = (patch: Partial<Research> = {}) => job({ id: 'r0', topic: 'Older one', createdAt: '2026-10-01T00:00:00Z', failure: undefined, ...patch });
const olderApproved = () => older({ status: 'approved', revision: 7, reviewSessionId: 's-review', reviewRunId: 'run-1', reviewedPackageDigest: DIGEST });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function bridge({ jobs = [] as Research[], routes = {} as Record<string, (params: Record<string, unknown>) => unknown> } = {}) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []; let listener: ((research: Research) => void) | undefined;
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      calls.push({ method, params });
      if (routes[method]) return routes[method](params);
      if (method === 'research.list') return { research: jobs };
      if (method === 'research.collector.read') return { collector };
      if (method === 'profile.list') return { profiles: [localProfile] };
      throw new Error('Unexpected route');
    },
    onEvent: () => () => {},
    onResearch(callback: (research: Research) => void) { listener = callback; return () => { listener = undefined; }; },
  };
  return { api, calls, notify: (research: Research) => act(() => listener!(research)) };
}
const subject = () => screen.getByRole('region', { name: 'Current research' });
const heading = () => within(subject()).getByRole('heading', { level: 3 }).textContent;
const history = async () => (await screen.findByText(/^Earlier research/)).closest('details')!;
async function show(topic: string) {
  const row = within(await history()).getByText(topic).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Show' }));
}

test('an older approved job behind a newer failed one can be shown: its check runs, it reads Ready on verified: true, and its reader works', async () => {
  // Guard: the user's choice of subject (mutation: the subject is always the active or newest job).
  const reads: Array<{ params: Record<string, unknown>; reply: ReturnType<typeof deferred<unknown>> }> = [];
  const { api } = bridge({ jobs: [job(), olderApproved()], routes: { 'research.document.read': params => { const reply = deferred<unknown>(); reads.push({ params, reply }); return reply.promise; } } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(heading()).toBe('Newer failed'));
  await show('Older one');
  expect(heading()).toBe('Older one');
  // Wait for the check's call itself (P4-35), then answer it.
  await waitFor(() => expect(reads.map(read => read.params)).toEqual([{ researchId: 'r0', document: 'brief' }]));
  expect(screen.getByTestId('research-status').textContent).toBe('Checking the reviewed package');
  await act(async () => reads[0]!.reply.resolve({ text: 'BRIEF', truncated: false, source: 'reviewed', verified: true }));
  expect(screen.getByTestId('research-status').textContent).toBe(`Ready: approved by the Research Kit gate · package ${DIGEST.slice(0, 12)}`);
  fireEvent.click(within(subject()).getByRole('button', { name: 'Read the evidence table' }));
  await waitFor(() => expect(reads.map(read => read.params)).toContainEqual({ researchId: 'r0', document: 'evidence' }));
  await act(async () => reads[1]!.reply.resolve({ text: 'REVIEWED EVIDENCE', truncated: false, source: 'reviewed', verified: true }));
  expect(within(subject()).getByTestId('research-reader').querySelector('pre')?.textContent).toBe('REVIEWED EVIDENCE');
  // Stale replies are matched per subject: a check answered after the subject changed is not shown on the new one.
  await show('Newer failed');
  expect(heading()).toBe('Newer failed');
  await show('Older one');
  await waitFor(() => expect(reads).toHaveLength(3));
  await show('Newer failed');
  await act(async () => reads[2]!.reply.resolve({ text: 'BRIEF', truncated: false, source: 'reviewed', verified: true }));
  expect(screen.getByTestId('research-status').textContent).toBe('Failed');
  expect(screen.queryByText(/^Ready/)).toBeNull();
});

test('an older collected job behind a newer job offers Start review once shown, and starts it for that job', async () => {
  // Guard: the subject's controls follow the chosen job (mutation: the subject is always the newest job).
  const { api, calls } = bridge({ jobs: [job(), older({ status: 'collected' })], routes: { 'research.review.start': () => ({ research: older({ status: 'reviewing', revision: 3, reviewSessionId: 's-review', reviewRunId: 'run-1' }) }) } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(heading()).toBe('Newer failed'));
  expect(screen.queryByRole('button', { name: 'Start review' })).toBeNull();
  await show('Older one');
  const start = await within(subject()).findByRole('button', { name: 'Start review' });
  await waitFor(() => expect(start.hasAttribute('disabled')).toBe(false));
  fireEvent.click(start);
  await waitFor(() => expect(calls.filter(call => call.method === 'research.review.start').map(call => call.params)).toEqual([{ researchId: 'r0', profileId: 'local' }]));
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toBe('Under review'));
  expect(heading()).toBe('Older one');
});

test('a job that turns active takes precedence over the shown job; until then the choice sticks', async () => {
  // Guard: a newly active job drops the choice (mutation: the choice always wins).
  const running = job({ id: 'r2', status: 'collecting', topic: 'Running one', createdAt: '2026-10-05T00:00:00Z', failure: undefined });
  const { api, notify } = bridge({ jobs: [running, job(), older({ status: 'cancelled' })] });
  render(<ResearchPanel api={api} project={project} />);
  await waitFor(() => expect(heading()).toBe('Running one'));
  await show('Older one');
  expect(heading()).toBe('Older one');
  // Showing a finished job while another runs does not offer a second collection.
  expect(screen.queryByRole('button', { name: 'Start collection' })).toBeNull();
  // Notices about other jobs do not move the subject, including the job that was already active when it was chosen.
  notify({ ...running, revision: 3, workflowRunId: '77' });
  notify(job({ revision: 3 }));
  expect(heading()).toBe('Older one');
  notify({ ...running, revision: 4, status: 'collected' });
  expect(heading()).toBe('Older one');
  // A job that starts after the choice takes the panel, and keeps it after it finishes.
  notify(job({ revision: 4, status: 'reviewing', reviewSessionId: 's-review', reviewRunId: 'run-1', failure: undefined }));
  expect(heading()).toBe('Newer failed');
  expect(screen.getByTestId('research-status').textContent).toBe('Under review');
  notify(job({ revision: 5, status: 'not_ready', failure: 'REVIEW_STOPPED', reviewSessionId: 's-review', reviewRunId: 'run-1' }));
  expect(heading()).toBe('Newer failed');
  expect(screen.getByTestId('research-status').textContent).toMatch(/^Not ready/);
});
