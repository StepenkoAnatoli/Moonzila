// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import type { Research } from '../src/shared';
import { ResearchPanel } from '../src/renderer/ResearchPanel';
import { RESEARCH_FAILURES } from '../src/renderer/research-text';

afterEach(cleanup);
const now = '2026-10-03T00:00:00Z';
const project = { id: 'p1', name: 'My project', pathLabel: 'C:\\work\\my-project', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only' as const, research: 'public-technical' as const }, missing: false, createdAt: now };
const collector = { revision: 1, repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', tokenConfigured: true };
const job = (patch: Partial<Research> = {}): Research => ({ id: 'r1', projectId: project.id, revision: 1, status: 'queued', topic: 'Vector databases', clientRef: 'mz-abc', createdAt: now, updatedAt: now, ...patch });
function bridge({ jobs = [] as Research[], saved = collector as typeof collector | null, routes = {} as Record<string, (params: Record<string, unknown>) => unknown> } = {}) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []; let listener: ((research: Research) => void) | undefined;
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      calls.push({ method, params });
      if (routes[method]) return routes[method](params);
      if (method === 'research.list') return { research: jobs };
      if (method === 'research.collector.read') return { collector: saved };
      throw new Error('Unexpected route');
    },
    onEvent: () => () => {},
    onResearch(callback: (research: Research) => void) { listener = callback; return () => { listener = undefined; }; },
  };
  return { api, calls, notify: (research: Research) => act(() => listener!(research)) };
}
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });

test('the start form names every public field and requires an explicit acknowledgement of the exact text', async () => {
  const { api, calls } = bridge({ routes: { 'research.start': () => ({ research: job() }) } });
  render(<ResearchPanel api={api} project={project} />);
  const disclosure = await screen.findByTestId('research-disclosure');
  await waitFor(() => expect(disclosure.textContent).toContain('octo/collector'));
  for (const field of ['topic', 'search queries', 'known URLs', 'preferred domains', 'depth', 'page budget']) expect(disclosure.textContent).toContain(field);
  expect(screen.getByRole('group', { name: 'Becomes public on GitHub' })).toBeTruthy();
  const submit = screen.getByRole('button', { name: 'Start collection' });
  fill('Topic', 'Vector databases'); fill('Search queries', 'hnsw recall\n\n  ivf pq  '); fill('Known URLs', 'https://example.com/a'); fill('Preferred domains', 'example.com');
  expect(submit.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByLabelText(/these fields become public/));
  expect(submit.hasAttribute('disabled')).toBe(false);
  // Any later edit of a public field withdraws the acknowledgement.
  fill('Topic', 'Vector databases 2026');
  expect((screen.getByLabelText(/these fields become public/) as HTMLInputElement).checked).toBe(false);
  expect(submit.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByLabelText(/these fields become public/));
  fireEvent.click(submit);
  await waitFor(() => expect(calls.some(call => call.method === 'research.start')).toBe(true));
  expect(calls.find(call => call.method === 'research.start')!.params).toEqual({ projectId: 'p1', topic: 'Vector databases 2026', queries: ['hnsw recall', 'ivf pq'], urls: ['https://example.com/a'], preferDomains: ['example.com'], depth: 'quick', maxPages: 8, acknowledgedPublic: true });
  expect(await screen.findByTestId('research-status')).toBeTruthy();
});

test('research off, an untrusted project or a missing token never offers a start', async () => {
  render(<ResearchPanel api={bridge().api} project={{ ...project, policy: { ...project.policy, research: 'off' } }} />);
  expect(await screen.findByText(/Research is off for this project/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start collection' })).toBeNull(); cleanup();
  render(<ResearchPanel api={bridge().api} project={{ ...project, trusted: false }} />);
  expect(await screen.findByText(/Trust this project before starting research/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start collection' })).toBeNull(); cleanup();
  render(<ResearchPanel api={bridge({ saved: { ...collector, tokenConfigured: false } }).api} project={project} />);
  expect(await screen.findByText('Save a collector token below before starting research.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start collection' }).hasAttribute('disabled')).toBe(true);
});

test('the collector token is write-only: never in an attribute, cleared after save, and only its presence is shown', async () => {
  const TOKEN = 'github_pat_SECRETVALUE123';
  let saved = { ...collector, tokenConfigured: false };
  const { api, calls } = bridge({ saved, routes: { 'research.collector.save': params => { saved = { ...saved, revision: saved.revision + 1, tokenConfigured: !params.clearToken }; return { collector: saved }; } } });
  const { container } = render(<ResearchPanel api={api} project={project} />);
  await waitFor(() => expect((screen.getByLabelText(/^Repository/) as HTMLInputElement).value).toBe('octo/collector'));
  expect(screen.getByTestId('token-state').textContent).toBe('No token is saved.');
  const field = screen.getByLabelText(/^Token/) as HTMLInputElement;
  expect(field.type).toBe('password'); expect(field.getAttribute('autocomplete')).toBe('new-password');
  fireEvent.change(field, { target: { value: ` ${TOKEN} ` } });
  expect(field.getAttribute('value')).toBeNull(); expect(container.innerHTML).not.toContain(TOKEN);
  fireEvent.click(screen.getByRole('button', { name: 'Save collector' }));
  expect(await screen.findByText('Collector settings saved.')).toBeTruthy();
  expect(calls.find(call => call.method === 'research.collector.save')!.params).toEqual({ repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', expectedRevision: 1, token: TOKEN });
  expect((screen.getByLabelText(/^Replace token/) as HTMLInputElement).value).toBe('');
  expect(container.innerHTML).not.toContain(TOKEN); expect(container.textContent).not.toContain(TOKEN);
  expect(screen.getByTestId('token-state').textContent).toContain('A token is saved');
  // Text typed into the field is not sent with a removal: the contract refuses a token and clearToken together.
  fireEvent.change(screen.getByLabelText(/^Replace token/), { target: { value: 'typed-then-removed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove saved token' }));
  expect(await screen.findByText('The saved token was removed.')).toBeTruthy();
  expect(calls.filter(call => call.method === 'research.collector.save')[1]!.params).toEqual({ repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', expectedRevision: 2, clearToken: true });
  expect(screen.getByTestId('token-state').textContent).toBe('No token is saved.');
});

test('a failed save keeps the token out of the page and shows the refusal', async () => {
  const TOKEN = 'ghp_ANOTHERSECRET';
  const { api } = bridge({ routes: { 'research.collector.save': () => { throw new Error('Enter the collector token again when you change the collector repository, or remove the saved token.'); } } });
  const { container } = render(<ResearchPanel api={api} project={project} />);
  await waitFor(() => expect((screen.getByLabelText(/^Repository/) as HTMLInputElement).value).toBe('octo/collector'));
  fireEvent.change(screen.getByLabelText(/^Repository/), { target: { value: 'octo/other' } });
  fireEvent.change(screen.getByLabelText(/^Replace token/), { target: { value: 'has space' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save collector' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The token must be printable characters without spaces.');
  fireEvent.change(screen.getByLabelText(/^Replace token/), { target: { value: TOKEN } });
  fireEvent.click(screen.getByRole('button', { name: 'Save collector' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Enter the collector token again');
  expect(container.innerHTML).not.toContain(TOKEN);
});

test('status follows notices for this project by revision, and cancel is offered while it can act', async () => {
  const { api, calls, notify } = bridge({ jobs: [job()], routes: { 'research.cancel': () => ({ research: job({ revision: 4, status: 'cancelling', workflowRunId: '77' }) }) } });
  render(<ResearchPanel api={api} project={project} />);
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toBe('Waiting to start'));
  expect(screen.queryByRole('button', { name: 'Start collection' })).toBeNull();
  notify(job({ revision: 3, status: 'collecting', workflowRunId: '77' }));
  expect(screen.getByTestId('research-status').textContent).toBe('Collecting on GitHub · GitHub run 77');
  expect(screen.getByText(/run deleted by the repository's retention setting/)).toBeTruthy();
  expect(screen.getByText(/could not be verified yet, because GitHub or the Research Kit was unavailable, waits until Monnzila restarts/)).toBeTruthy();
  notify(job({ revision: 2, status: 'dispatching' }));
  notify(job({ id: 'other', projectId: 'p2', revision: 9, status: 'failed', failure: 'RUN_FAILED', createdAt: '2026-10-04T00:00:00Z' }));
  expect(screen.getByTestId('research-status').textContent).toBe('Collecting on GitHub · GitHub run 77');
  expect(screen.queryByText(/Collection run failed/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel collection' }));
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toContain('Stopping'));
  expect(calls.find(call => call.method === 'research.cancel')!.params).toEqual({ researchId: 'r1' });
  expect(screen.queryByRole('button', { name: 'Cancel collection' })).toBeNull();
  notify(job({ revision: 5, status: 'cancelled', workflowRunId: '77' }));
  expect(screen.getByTestId('research-status').textContent).toContain('Cancelled');
  expect(screen.getByText(/was not cancelled there/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start collection' })).toBeTruthy();
});

const specFailures = (() => {
  const spec = readFileSync('docs/specification/research-collection.md', 'utf8');
  const section = spec.slice(spec.indexOf('### Job failures'), spec.indexOf('### Causes'));
  return [...section.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map(match => match[1]!);
})();
test('every job failure in the collection spec has its own actionable message', () => {
  expect(specFailures.length).toBeGreaterThanOrEqual(24);
  for (const code of specFailures) expect(RESEARCH_FAILURES[code], code).toBeDefined();
});
test.each([
  ['RESEARCH_KIT_UNAVAILABLE', 'Research Kit unavailable', /Install or repair the Research Kit/],
  ['COLLECTOR_TOKEN_MISSING', 'Collector token missing', /Save a token with Actions read and write/],
  ['COLLECTOR_TOKEN_REJECTED', 'Collector token rejected', /Save a new token/],
  ['COLLECTION_FAILED', 'Nothing could be collected', /secrets and credits/],
  ['ARTIFACT_EXPIRED', 'Corpus expired', /keeps it for 7 days/],
  ['COLLECTION_EXPIRED', 'Collection timed out', /within 7 days/],
  ['REMOTE_STATE_UNKNOWN', 'Run state unknown', /no second run was started/],
  ['POLICY_CHANGED', 'Project policy changed', /Any policy change ends/],
  ['RUN_IDENTITY_MISMATCH', 'Run did not match the request', /not the one it started/],
  ['PACKAGE_IDENTITY_MISMATCH', 'Corpus from another run', /different run, attempt or commit/],
  ['TRUST_CHANGED', 'Project trust changed', /Start a new collection once the project is trusted/],
  ['NOT_A_LISTED_CODE', 'Collection failed', /\(NOT_A_LISTED_CODE\)/],
  ['<b>not a code</b>', 'Collection failed', /^The collection stopped\. Check/],
])('failure %s is explained with a next step', async (failure, title, action) => {
  render(<ResearchPanel api={bridge({ jobs: [job({ status: 'failed', failure, revision: 2 })] }).api} project={project} />);
  const alert = await screen.findByRole('alert');
  expect(within(alert).getByText(title)).toBeTruthy(); expect(within(alert).getByText(action)).toBeTruthy();
  expect(alert.innerHTML).not.toContain('<b>');
});

test('research text is bounded plain text and no control can authorize or approve', async () => {
  const topic = `<img src=x onerror="alert(1)">\u202Egpj.exe ${'x'.repeat(2000)}`;
  const { container } = render(<ResearchPanel api={bridge({ jobs: [job({ status: 'collected', topic, revision: 2 }), job({ id: 'r0', status: 'approved', topic: 'Older', createdAt: '2026-10-01T00:00:00Z' })] }).api} project={project} />);
  const heading = await screen.findByRole('heading', { level: 3 });
  expect(container.querySelector('img')).toBeNull();
  expect(heading.textContent).toMatch(/^<img src=x onerror="alert\(1\)">gpj\.exe x+…$/); expect(heading.textContent!.length).toBe(201);
  expect(screen.getByTestId('research-evidence').textContent).toContain('not available');
  expect(screen.getByText('Ready: approved by the Research Kit gate')).toBeTruthy();
  for (const button of screen.getAllByRole('button')) expect(button.textContent).not.toMatch(/authori[sz]e|approve|review/i);
});

test('saving a different collector repository withdraws the acknowledgement of the old destination', async () => {
  let saved = collector;
  const { api, calls } = bridge({ routes: { 'research.collector.save': params => { saved = { ...saved, revision: saved.revision + 1, repository: String(params.repository) }; return { collector: saved }; }, 'research.start': () => ({ research: job() }) } });
  render(<ResearchPanel api={api} project={project} />);
  const disclosure = await screen.findByTestId('research-disclosure');
  await waitFor(() => expect(disclosure.textContent).toContain('octo/collector'));
  fill('Topic', 'Vector databases');
  const acknowledgement = screen.getByLabelText(/these fields become public/) as HTMLInputElement;
  fireEvent.click(acknowledgement); expect(acknowledgement.checked).toBe(true);
  // Re-saving the same destination keeps it.
  fireEvent.click(screen.getByRole('button', { name: 'Save collector' }));
  expect(await screen.findByText('Collector settings saved.')).toBeTruthy();
  expect(acknowledgement.checked).toBe(true);
  fireEvent.change(screen.getByLabelText(/^Repository/), { target: { value: 'octo/public' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save collector' }));
  await waitFor(() => expect(disclosure.textContent).toContain('octo/public'));
  expect(acknowledgement.checked).toBe(false);
  expect(screen.getByRole('button', { name: 'Start collection' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(acknowledgement); fireEvent.click(screen.getByRole('button', { name: 'Start collection' }));
  await waitFor(() => expect(calls.some(call => call.method === 'research.start')).toBe(true));
});

test.each(['queued', 'dispatching', 'collecting', 'reviewing'] as const)('a %s job can be cancelled and hides the start form', async status => {
  render(<ResearchPanel api={bridge({ jobs: [job({ status, revision: 2 })] }).api} project={project} />);
  expect(await screen.findByRole('button', { name: 'Cancel collection' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start collection' })).toBeNull();
});

test('a job that is stopping offers neither cancel nor a new start', async () => {
  render(<ResearchPanel api={bridge({ jobs: [job({ status: 'cancelling', revision: 2 })] }).api} project={project} />);
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toContain('Stopping'));
  expect(screen.queryByRole('button', { name: 'Cancel collection' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start collection' })).toBeNull();
});

test('earlier research is bounded plain text, at most 20 entries', async () => {
  const older = Array.from({ length: 25 }, (_, index) => job({ id: `old${index}`, status: 'failed', failure: 'RUN_FAILED', topic: `‮${index}:${'y'.repeat(300)}`, createdAt: new Date(Date.parse('2026-09-01T00:00:00Z') + index * 1000).toISOString() }));
  render(<ResearchPanel api={bridge({ jobs: [job({ status: 'collecting', revision: 2 }), ...older] }).api} project={project} />);
  const history = (await screen.findByText(/^Earlier research/)).closest('details')!;
  expect(history.querySelector('summary')!.textContent).toBe('Earlier research · 20');
  const items = [...history.querySelectorAll('li > span:first-child')];
  expect(items).toHaveLength(20);
  for (const item of items) { expect(item.textContent).not.toContain('‮'); expect(item.textContent!.length).toBe(121); expect(item.textContent!.endsWith('…')).toBe(true); }
});

test('removing the saved token keeps the saved destination, not unsaved edits', async () => {
  const { api, calls } = bridge({ routes: { 'research.collector.save': () => ({ collector: { ...collector, revision: 2, tokenConfigured: false } }) } });
  render(<ResearchPanel api={api} project={project} />);
  await waitFor(() => expect((screen.getByLabelText(/^Repository/) as HTMLInputElement).value).toBe('octo/collector'));
  fireEvent.change(screen.getByLabelText(/^Repository/), { target: { value: 'someone/else' } });
  fireEvent.change(screen.getByLabelText(/^Workflow file/), { target: { value: 'other.yml' } });
  fireEvent.change(screen.getByLabelText(/^Branch or tag/), { target: { value: 'dev' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove saved token' }));
  expect(await screen.findByText('The saved token was removed.')).toBeTruthy();
  expect(calls.find(call => call.method === 'research.collector.save')!.params).toEqual({ repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', expectedRevision: 1, clearToken: true });
});
