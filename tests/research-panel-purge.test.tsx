// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import type { Research } from '../src/shared';
import { ResearchStatusSchema } from '../src/shared/contracts';
import { ResearchPanel } from '../src/renderer/ResearchPanel';
import { PURGEABLE_RESEARCH, PURGE_TEXT } from '../src/renderer/research-text';

// Delete stored corpus (docs/specification/research-purge.md decision 8; REQUIREMENTS-P5 F-7).
afterEach(cleanup);
const now = '2026-10-03T00:00:00Z';
const project = { id: 'p1', name: 'My project', pathLabel: 'C:\\work\\my-project', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only' as const, research: 'public-technical' as const }, missing: false, createdAt: now };
const collector = { revision: 1, repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', tokenConfigured: true };
const DIGEST = '0123456789abcdef'.repeat(4);
const job = (patch: Partial<Research> = {}): Research => ({ id: 'r1', projectId: project.id, revision: 2, status: 'failed', topic: 'Vector databases', clientRef: 'mz-abc', createdAt: now, updatedAt: now, ...patch });
const approved = (patch: Partial<Research> = {}) => job({ status: 'approved', revision: 7, reviewSessionId: 's-review', reviewRunId: 'run-1', reviewedPackageDigest: DIGEST, ...patch });
const PURGE_NOT_ALLOWED = 'Only finished research can have its stored corpus deleted: approved, failed or cancelled.';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function bridge({ jobs = [] as Research[], routes = {} as Record<string, (params: Record<string, unknown>) => unknown> } = {}) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []; let listener: ((research: Research) => void) | undefined;
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      calls.push({ method, params });
      if (routes[method]) return routes[method](params);
      if (method === 'research.list') return { research: jobs };
      if (method === 'research.collector.read') return { collector };
      if (method === 'profile.list') return { profiles: [] };
      if (method === 'research.document.read') return { text: 'BRIEF', truncated: false, source: 'reviewed', verified: true };
      throw new Error('Unexpected route');
    },
    onEvent: () => () => {},
    onResearch(callback: (research: Research) => void) { listener = callback; return () => { listener = undefined; }; },
  };
  return { api, calls, purges: () => calls.filter(call => call.method === 'research.purge'), notify: (research: Research) => act(() => listener!(research)) };
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const openConfirmation = async () => { fireEvent.click(await screen.findByRole('button', { name: 'Delete stored corpus' })); return screen.getByRole('group', { name: PURGE_TEXT.title }); };
const confirm = (group: HTMLElement) => fireEvent.click(within(group).getByRole('button', { name: 'Delete stored corpus' }));

test('the offered statuses are exactly approved, failed and cancelled', () => {
  // Guard: the status list (mutation: adding collected or not_ready, which a review still starts from).
  expect([...PURGEABLE_RESEARCH].sort()).toEqual(['approved', 'cancelled', 'failed']);
});

test.each(ResearchStatusSchema.options)('a current %s job offers Delete stored corpus only when it is finished', async status => {
  // Guard: the panel's PURGEABLE_RESEARCH check on the current job (mutation: offer it for every status).
  render(<ResearchPanel api={bridge({ jobs: [job({ status, reviewedPackageDigest: DIGEST })] }).api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(screen.getByTestId('research-status')).toBeTruthy());
  await settle();
  const offered = PURGEABLE_RESEARCH.includes(status);
  expect(!!screen.queryByRole('button', { name: 'Delete stored corpus' })).toBe(offered);
});

test('earlier finished jobs offer it in the history, and only for its finished jobs', async () => {
  // Guard: the same check on history rows (mutation: offer it for every earlier job).
  const jobs = [job({ id: 'r9', status: 'collected', createdAt: '2026-10-04T00:00:00Z' }), job({ id: 'r8', status: 'not_ready', topic: 'Not ready one', createdAt: '2026-10-02T00:00:00Z' }), job({ id: 'r7', status: 'cancelled', topic: 'Cancelled one', createdAt: '2026-10-01T00:00:00Z' })];
  const { api, purges } = bridge({ jobs, routes: { 'research.purge': () => ({ removed: 1, keptShared: 0, keptBusy: false }) } });
  render(<ResearchPanel api={api} project={project} />);
  const history = (await screen.findByText(/^Earlier research/)).closest('details')!;
  await waitFor(() => expect(within(history).getAllByRole('button', { name: 'Delete stored corpus' })).toHaveLength(1));
  const row = within(history).getByText('Cancelled one').closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Delete stored corpus' }));
  confirm(within(row).getByRole('group', { name: PURGE_TEXT.title }));
  await waitFor(() => expect(purges().map(call => call.params)).toEqual([{ researchId: 'r7' }]));
});

test('the confirmation lists the three disclosures; Cancel closes it without a call, and only its confirm button purges with exactly the job id', async () => {
  // Guards: no call before the confirm (mutation: the first button purges) and the exact params.
  const { api, purges } = bridge({ jobs: [job()], routes: { 'research.purge': () => ({ removed: 1, keptShared: 0, keptBusy: false }) } });
  render(<ResearchPanel api={api} project={project} />);
  let group = await openConfirmation();
  expect(purges()).toEqual([]);
  expect(group.textContent).toContain('The brief and evidence of this research can no longer be read.');
  // A failed job has no reviewed package, so the Unverified line is not part of its confirmation.
  expect(group.textContent).not.toContain('Unverified');
  expect(group.textContent).toMatch(/record stays/);
  expect(within(group).getAllByRole('button').map(button => button.textContent)).toEqual(['Cancel', 'Delete stored corpus']);
  // While the confirmation is open, the only Delete stored corpus button is its confirm button.
  expect(screen.getAllByRole('button', { name: 'Delete stored corpus' })).toHaveLength(1);
  fireEvent.click(within(group).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('group', { name: PURGE_TEXT.title })).toBeNull();
  await settle();
  expect(purges()).toEqual([]);
  group = await openConfirmation();
  confirm(group);
  await waitFor(() => expect(purges()).toHaveLength(1));
  expect(purges()[0]!.params).toEqual({ researchId: 'r1' });
  await waitFor(() => expect(screen.queryByRole('group', { name: PURGE_TEXT.title })).toBeNull());
});

test.each([
  [{ removed: 2, keptShared: 0, keptBusy: false }, 'Removed 2 stored packages.'],
  [{ removed: 1, keptShared: 0, keptBusy: false }, 'Removed 1 stored package.'],
  [{ removed: 0, keptShared: 3, keptBusy: false }, 'Removed 0 stored packages. 3 stored packages were kept because another research job uses them.'],
  [{ removed: 1, keptShared: 1, keptBusy: true }, 'Removed 1 stored package. 1 stored package was kept because another research job uses it. Unused packages were kept because research is running.'],
  [{ removed: 4, keptShared: 0, keptBusy: true }, 'Removed 4 stored packages. Unused packages were kept because research is running.'],
])('the result %o reads "%s"', async (result, line) => {
  // Guard: each clause follows its own field (mutation: drop the keptShared or keptBusy clause, or always show them).
  const { api } = bridge({ jobs: [job()], routes: { 'research.purge': () => result } });
  render(<ResearchPanel api={api} project={project} />);
  confirm(await openConfirmation());
  await waitFor(() => expect(screen.getByTestId('research-notice').textContent).toBe(line));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a reply outside the result schema is not reported as a deletion', async () => {
  // Guard: the reply is parsed with ResearchPurgeResultSchema (mutation: read its fields unchecked).
  const { api } = bridge({ jobs: [job()], routes: { 'research.purge': () => ({ removed: 1, keptShared: 0 }) } });
  render(<ResearchPanel api={api} project={project} />);
  confirm(await openConfirmation());
  expect((await screen.findByTestId('research-purge-refusal')).textContent).toBe(PURGE_TEXT.unexpected);
  expect(screen.queryByTestId('research-notice')).toBeNull();
});

test('a refusal shows the public message once and is not retried', async () => {
  // Guard: a rejected call reaches the error line (mutation: swallow it, or call again).
  const { api, purges } = bridge({ jobs: [job({ status: 'cancelled' })], routes: { 'research.purge': () => { throw new Error(PURGE_NOT_ALLOWED); } } });
  render(<ResearchPanel api={api} project={project} />);
  confirm(await openConfirmation());
  expect((await screen.findByTestId('research-purge-refusal')).textContent).toBe(PURGE_NOT_ALLOWED);
  expect(screen.getByTestId('research-purge-refusal').getAttribute('role')).toBe('alert');
  await settle(); await settle();
  expect(purges()).toHaveLength(1);
  expect(screen.queryByTestId('research-notice')).toBeNull();
  expect(screen.queryByRole('group', { name: PURGE_TEXT.title })).toBeNull();
});

test('after a purge an approved job is checked again, never Ready from the check before it, and an open document is closed', async () => {
  // Guard: the purge re-runs ApprovedCheck and resets the reader (mutation: keep the earlier check and reader).
  const reads: Array<ReturnType<typeof deferred<unknown>>> = [];
  const purge = deferred<unknown>();
  const { api, calls } = bridge({ jobs: [approved()], routes: {
    'research.document.read': () => { const next = deferred<unknown>(); reads.push(next); return next.promise; },
    'research.purge': () => purge.promise,
  } });
  const briefChecks = () => calls.filter(call => call.method === 'research.document.read' && call.params.document === 'brief').length;
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(reads).toHaveLength(1));
  await act(async () => reads[0]!.resolve({ text: 'BRIEF', truncated: false, source: 'reviewed', verified: true }));
  expect(screen.getByTestId('research-status').textContent).toMatch(/^Ready/);
  fireEvent.click(screen.getByRole('button', { name: 'Read the brief' }));
  await waitFor(() => expect(reads).toHaveLength(2));
  await act(async () => reads[1]!.resolve({ text: 'REVIEWED BRIEF', truncated: false, source: 'reviewed', verified: true }));
  expect(screen.getByTestId('research-reader').querySelector('pre')?.textContent).toBe('REVIEWED BRIEF');
  const before = briefChecks();
  confirm(await openConfirmation());
  await act(async () => purge.resolve({ removed: 1, keptShared: 0, keptBusy: false }));
  // Wait for the check's call itself (P4-35), then hold its reply: the status must not be Ready meanwhile.
  await waitFor(() => expect(briefChecks()).toBe(before + 1));
  expect(screen.getByTestId('research-status').textContent).toBe('Checking the reviewed package');
  expect(screen.getByTestId('research-reader').querySelector('pre')).toBeNull();
  await act(async () => reads[2]!.resolve({ text: '', truncated: false, source: 'reviewed', verified: false }));
  expect(screen.getByTestId('research-status').textContent).toBe('Unverified: the reviewed package is missing or no longer matches');
  expect(screen.getByTestId('research-notice').textContent).toBe('Removed 1 stored package.');
});

test('no purge text says approve or authorize', () => {
  const texts = [PURGE_TEXT.open, PURGE_TEXT.title, PURGE_TEXT.confirm, PURGE_TEXT.unexpected, PURGE_TEXT.unverified, ...PURGE_TEXT.points];
  for (const text of texts) expect(text).not.toMatch(/authori[sz]e|approv/i);
});

test('the Unverified line is shown for every approved job, current or history, worded for a package another job keeps', async () => {
  // Guard: the line is passed for approved jobs only (mutation: show it in every confirmation); a history row's
  // approved job gets it too, because Show makes that job current and it then reads Unverified (final audit, P5-23).
  expect(PURGE_TEXT.unverified).toBe('If this research passed review and no other research uses its stored package, it reads "Unverified" instead of "Ready" from then on.');
  render(<ResearchPanel api={bridge({ jobs: [approved(), approved({ id: 'r0', topic: 'Older approved', createdAt: '2026-10-01T00:00:00Z' })] }).api} project={project} openConversation={() => {}} />);
  const section = await screen.findByRole('region', { name: 'Current research' });
  fireEvent.click(await within(section).findByRole('button', { name: 'Delete stored corpus' }));
  expect(within(section).getByRole('group', { name: PURGE_TEXT.title }).textContent).toContain(PURGE_TEXT.unverified);
  const history = (await screen.findByText(/^Earlier research/)).closest('details')!;
  fireEvent.click(within(history).getByRole('button', { name: 'Delete stored corpus' }));
  expect(within(history).getByRole('group', { name: PURGE_TEXT.title }).textContent).toContain(PURGE_TEXT.unverified);
  for (const status of ['failed', 'cancelled'] as const) {
    cleanup();
    render(<ResearchPanel api={bridge({ jobs: [job({ status })] }).api} project={project} />);
    expect((await openConfirmation()).textContent).not.toContain('Unverified');
  }
});

test('a refused history purge stays beside its row when an automatic error follows, until dismissed', async () => {
  // Guard: the refusal has its own state (mutation: send it through the panel's shared error line, which the
  // profile.list failure below overwrites).
  const collecting = job({ id: 'r2', status: 'collecting', topic: 'Running one', createdAt: '2026-10-04T00:00:00Z' });
  const { api, purges, notify } = bridge({ jobs: [collecting, job({ status: 'cancelled', topic: 'Cancelled one' })], routes: {
    'research.purge': () => { throw new Error(PURGE_NOT_ALLOWED); },
    'profile.list': () => { throw new Error('Model profiles are unavailable right now.'); },
  } });
  render(<ResearchPanel api={api} project={project} />);
  const history = (await screen.findByText(/^Earlier research/)).closest('details')!;
  const row = within(history).getByText('Cancelled one').closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Delete stored corpus' }));
  confirm(within(row).getByRole('group', { name: PURGE_TEXT.title }));
  await waitFor(() => expect(within(row).getByTestId('research-purge-refusal').textContent).toBe(PURGE_NOT_ALLOWED));
  notify({ ...collecting, revision: 3, status: 'collected' });
  await waitFor(() => expect(screen.getByText('Model profiles are unavailable right now.')).toBeTruthy());
  expect(within(row).getByTestId('research-purge-refusal').textContent).toBe(PURGE_NOT_ALLOWED);
  fireEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByTestId('research-purge-refusal')).toBeNull();
  expect(purges()).toHaveLength(1);
});
