// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import type { Research } from '../src/shared';
import { ApprovedCheck, ResearchPanel } from '../src/renderer/ResearchPanel';
import { RESEARCH_FAILURES, RESEARCH_STATUS, RUN_ACTIVE_MESSAGE, failureText } from '../src/renderer/research-text';
import { REVIEW_FAILURES } from '../src/engine/review-contract';

afterEach(cleanup);
const now = '2026-10-03T00:00:00Z';
const project = { id: 'p1', name: 'My project', pathLabel: 'C:\\work\\my-project', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only' as const, research: 'public-technical' as const }, missing: false, createdAt: now };
const collector = { revision: 1, repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', tokenConfigured: true };
const job = (patch: Partial<Research> = {}): Research => ({ id: 'r1', projectId: project.id, revision: 1, status: 'queued', topic: 'Vector databases', clientRef: 'mz-abc', createdAt: now, updatedAt: now, ...patch });
const localProfile = { id: 'local', name: 'Local model', kind: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'qwen', contextTokens: 8192, outputTokens: 1024, locality: 'local' as const, hasCredential: false, revision: 1, revisionId: 'rev-local', createdAt: now, updatedAt: now };
const cloudProfile = { ...localProfile, id: 'cloud', name: 'Cloud model', kind: 'openai-compatible', endpoint: 'https://provider.example/v1', locality: 'external' as const, hasCredential: true, revisionId: 'rev-cloud' };
function bridge({ jobs = [] as Research[], saved = collector as typeof collector | null, profiles = [localProfile, cloudProfile] as unknown[], routes = {} as Record<string, (params: Record<string, unknown>) => unknown> } = {}) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []; let listener: ((research: Research) => void) | undefined;
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      calls.push({ method, params });
      if (routes[method]) return routes[method](params);
      if (method === 'research.list') return { research: jobs };
      if (method === 'research.collector.read') return { collector: saved };
      if (method === 'profile.list') return { profiles };
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
  expect(screen.getByText(/could not be verified yet, because GitHub or the Research Kit was unavailable, waits until Moonzila restarts/)).toBeTruthy();
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
  ['POLICY_CHANGED', 'Research setting changed', /Changing only the inference setting does not stop research/],
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
  // An older approved job is never called ready from its status alone.
  const history = (await screen.findByText(/^Earlier research/)).closest('details')!;
  expect(history.textContent).not.toMatch(/Ready/);
  // The older approved job offers Delete stored corpus (research-purge spec 8); it and its confirmation are under the rule too.
  fireEvent.click(within(history).getByRole('button', { name: 'Delete stored corpus' }));
  const confirmation = within(history).getByRole('group', { name: 'Delete the stored corpus?' });
  expect(within(confirmation).getAllByRole('button').map(button => button.textContent)).toEqual(['Cancel', 'Delete stored corpus']);
  expect(confirmation.textContent).not.toMatch(/authori[sz]e|approv/i);
  for (const button of screen.getAllByRole('button')) expect(button.textContent).not.toMatch(/authori[sz]e|approve/i);
});

const REVIEW_BUTTONS = ['Start review', 'Open review', 'Cancel review'];
test.each(['collected', 'reviewing', 'packaging', 'approved', 'not_ready'] as const)('a %s job offers only the allowed review controls', async status => {
  render(<ResearchPanel api={bridge({ jobs: [job({ status, revision: 2, reviewSessionId: 's-review', reviewedPackageDigest: 'a'.repeat(64) })], routes: { 'research.document.read': () => ({ text: '', truncated: false, source: 'reviewed', verified: true }) } }).api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(screen.getByTestId('research-status')).toBeTruthy());
  await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
  const expected = { collected: ['Start review'], not_ready: ['Start review'], reviewing: ['Open review', 'Cancel review'], packaging: ['Cancel review'], approved: [] }[status];
  if (expected.length) await screen.findByRole('button', { name: expected[0]! });
  const shown = screen.getAllByRole('button').map(button => button.textContent ?? '');
  expect(shown.filter(text => /review/i.test(text)).sort()).toEqual([...expected].sort());
  for (const text of shown) { expect(text).not.toMatch(/authori[sz]e|approve/i); if (/review/i.test(text)) expect(REVIEW_BUTTONS).toContain(text); }
  expect(screen.queryByRole('button', { name: 'Cancel collection' })).toBeNull();
});

test('Start review lists the model profiles, disables cloud ones under local-only inference, and starts with the chosen one', async () => {
  const { api, calls } = bridge({ jobs: [job({ status: 'collected', revision: 2 })], routes: { 'research.review.start': () => ({ research: job({ status: 'reviewing', revision: 3, reviewSessionId: 's-review', reviewRunId: 'run-1' }) }) } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  const picker = await screen.findByLabelText('Review model') as HTMLSelectElement;
  await waitFor(() => expect(picker.options.length).toBe(2));
  const cloud = [...picker.options].find(option => option.value === 'cloud')!;
  expect(cloud.disabled).toBe(true); expect(cloud.textContent).toMatch(/local inference only/);
  expect([...picker.options].find(option => option.value === 'local')!.disabled).toBe(false);
  expect(picker.value).toBe('local');
  expect(screen.getByText(/This project allows local inference only, so cloud profiles cannot review it/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toBe('Under review'));
  expect(calls.find(call => call.method === 'research.review.start')!.params).toEqual({ researchId: 'r1', profileId: 'local' });
  expect(screen.getByRole('button', { name: 'Open review' })).toBeTruthy(); expect(screen.getByRole('button', { name: 'Cancel review' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start review' })).toBeNull();
});

test('a cloud-allowed project can pick a cloud profile, and a refused start shows the public message', async () => {
  const { api, calls } = bridge({ jobs: [job({ status: 'not_ready', failure: 'REVIEW_STOPPED', revision: 4 })], routes: { 'research.review.start': () => { throw new Error('This research cannot be reviewed now. Only a collected corpus, or one that is not ready yet, can be reviewed.'); } } });
  render(<ResearchPanel api={api} project={{ ...project, policy: { ...project.policy, inference: 'cloud-allowed' } }} openConversation={() => {}} />);
  const picker = await screen.findByLabelText('Review model') as HTMLSelectElement;
  await waitFor(() => expect(picker.options.length).toBe(2));
  expect([...picker.options].every(option => !option.disabled)).toBe(true);
  fireEvent.change(picker, { target: { value: 'cloud' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
  expect(await screen.findByText(/This research cannot be reviewed now/)).toBeTruthy();
  expect(calls.find(call => call.method === 'research.review.start')!.params).toEqual({ researchId: 'r1', profileId: 'cloud' });
});

test('Start review is not offered when no profile can run it', async () => {
  render(<ResearchPanel api={bridge({ jobs: [job({ status: 'collected', revision: 2 })], profiles: [cloudProfile] }).api} project={project} openConversation={() => {}} />);
  const button = await screen.findByRole('button', { name: 'Start review' });
  await waitFor(() => expect((screen.getByLabelText('Review model') as HTMLSelectElement).options.length).toBe(1));
  expect(button.hasAttribute('disabled')).toBe(true);
});

test('Open review hands the review conversation to the workbench', async () => {
  const opened: string[] = [];
  render(<ResearchPanel api={bridge({ jobs: [job({ status: 'reviewing', revision: 3, reviewSessionId: 's-review', reviewRunId: 'run-1' })] }).api} project={project} openConversation={id => opened.push(id)} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open review' }));
  expect(opened).toEqual(['s-review']);
});

test('Cancel review cancels a packaging job through research.cancel', async () => {
  const { api, calls } = bridge({ jobs: [job({ status: 'packaging', revision: 5 })], routes: { 'research.cancel': () => ({ research: job({ status: 'cancelling', revision: 6 }) }) } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel review' }));
  // Cancel review is terminal, so it asks first (P5-12); the confirm sends the cancel.
  fireEvent.click(within(screen.getByRole('group', { name: 'Cancel the review?' })).getByRole('button', { name: 'Cancel review' }));
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toContain('Stopping'));
  expect(calls.find(call => call.method === 'research.cancel')!.params).toEqual({ researchId: 'r1' });
});

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const DIGEST = '0123456789abcdef'.repeat(4);
const approved = (patch: Partial<Research> = {}) => job({ status: 'approved', revision: 7, reviewSessionId: 's-review', reviewRunId: 'run-1', reviewedPackageDigest: DIGEST, ...patch });

test('an approved job reads Checking until the reader answers, then Ready with the digest prefix only on verified: true (the verified flag)', async () => {
  // Guard: Ready only when the reply says verified: true (mutation: Ready on any reply). The second render answers
  // verified: false, so this test's own input reaches the guard.
  const reply = deferred<unknown>();
  const { api, calls } = bridge({ jobs: [approved()], routes: { 'research.document.read': () => reply.promise } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toBe('Checking the reviewed package'));
  expect(screen.queryByText(/Ready/)).toBeNull();
  // "Checking" is the initial state, painted before React runs the effect that sends the read: wait for the read itself.
  await waitFor(() => expect(calls.filter(call => call.method === 'research.document.read').map(call => call.params)).toEqual([{ researchId: 'r1', document: 'brief' }]));
  await act(async () => reply.resolve({ text: 'brief', truncated: false, source: 'reviewed', verified: true }));
  expect(calls.filter(call => call.method === 'research.document.read')).toHaveLength(1);
  expect(screen.getByTestId('research-status').textContent).toBe(`Ready: approved by the Research Kit gate · package ${DIGEST.slice(0, 12)}`);
  expect(screen.getByTestId('research-status').textContent).not.toContain(DIGEST.slice(0, 13));
  expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  cleanup();
  const unverified = deferred<unknown>();
  const second = bridge({ jobs: [approved()], routes: { 'research.document.read': () => unverified.promise } });
  render(<ResearchPanel api={second.api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(second.calls.filter(call => call.method === 'research.document.read')).toHaveLength(1));
  expect(screen.getByTestId('research-status').textContent).toBe('Checking the reviewed package');
  await act(async () => unverified.resolve({ text: '', truncated: false, source: 'reviewed', verified: false }));
  expect(screen.getByTestId('research-status').textContent).toBe('Unverified: the reviewed package is missing or no longer matches');
  expect(screen.queryByText(/Ready/)).toBeNull();
});

test('an approved job whose package no longer verifies reads Unverified, never Ready', async () => {
  render(<ResearchPanel api={bridge({ jobs: [approved()], routes: { 'research.document.read': () => ({ text: '', truncated: false, source: 'reviewed', verified: false }) } }).api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toBe('Unverified: the reviewed package is missing or no longer matches'));
  expect(screen.queryByText(/^Ready/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
});

test('a rejected check reads Cannot check with the public message, neither Ready nor Unverified, and can be checked again', async () => {
  let attempt = 0;
  const { api, calls } = bridge({ jobs: [approved()], routes: { 'research.document.read': () => { attempt += 1; if (attempt === 1) throw new Error('Moonzila cannot check this document for saved keys right now, so it is not shown. Try again after restarting Moonzila.'); return { text: 'x', truncated: false, source: 'reviewed', verified: true }; } } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toBe('Cannot check the reviewed package now'));
  expect(screen.getByText(/cannot check this document for saved keys/)).toBeTruthy();
  expect(screen.queryByText(/^Ready|Unverified/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toContain('Ready: approved by the Research Kit gate'));
  expect(calls.filter(call => call.method === 'research.document.read')).toHaveLength(2);
});

test('a check reply that arrives after the job changed is discarded', async () => {
  const replies = [deferred<unknown>(), deferred<unknown>()]; let index = 0;
  const { api, notify } = bridge({ jobs: [approved()], routes: { 'research.document.read': () => replies[index++]!.promise } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(index).toBe(1));
  notify(approved({ revision: 8, reviewedPackageDigest: 'f'.repeat(64) }));
  await waitFor(() => expect(index).toBe(2));
  await act(async () => replies[0]!.resolve({ text: '', truncated: false, source: 'reviewed', verified: true }));
  expect(screen.getByTestId('research-status').textContent).toBe('Checking the reviewed package');
  await act(async () => replies[1]!.resolve({ text: '', truncated: false, source: 'reviewed', verified: false }));
  expect(screen.getByTestId('research-status').textContent).toMatch(/^Unverified/);
});

const ADMISSION = ['POLICY_CHANGED', 'TRUST_CHANGED', 'RESEARCH_NOT_ALLOWED', 'PROJECT_UNTRUSTED', 'PROJECT_NOT_FOUND'];
test('every review failure, admission code and RESEARCH_KIT_UNAVAILABLE has its own review explanation', () => {
  expect(REVIEW_FAILURES.length).toBeGreaterThanOrEqual(12);
  for (const code of REVIEW_FAILURES) expect(RESEARCH_FAILURES[code], code).toBeDefined();
  const fallback = failureText('NOT_A_LISTED_CODE', 'not_ready');
  for (const code of [...REVIEW_FAILURES, ...ADMISSION, 'RESEARCH_KIT_UNAVAILABLE']) {
    const text = failureText(code, 'not_ready');
    expect(text.title, code).not.toBe(fallback.title);
    expect(text.action, code).toMatch(/review/i);
  }
  expect(fallback.action).toMatch(/\(NOT_A_LISTED_CODE\)/);
});

test('a not ready job explains its failure and offers a retry', async () => {
  render(<ResearchPanel api={bridge({ jobs: [job({ status: 'not_ready', failure: 'REVIEW_GATE_FAILED', revision: 4 })] }).api} project={project} openConversation={() => {}} />);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(RESEARCH_FAILURES.REVIEW_GATE_FAILED!.title);
  expect(await screen.findByRole('button', { name: 'Start review' })).toBeTruthy();
});

const HOSTILE = '<script>window.hacked = 1</script>\n[click me](https://evil.example) **bold** <a href="https://evil.example">x</a>\u202Eabc';
test('the reader shows the brief as untrusted plain text in a pre, with its source and verification above it', async () => {
  const { api, calls } = bridge({ jobs: [job({ status: 'collected', revision: 2 })], routes: { 'research.document.read': params => ({ text: params.document === 'brief' ? HOSTILE : '| U-1 | claim |', truncated: true, source: 'collected', verified: true }) } });
  const { container } = render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Read the brief' }));
  const reader = await screen.findByTestId('research-reader');
  const pre = reader.querySelector('pre')!;
  await waitFor(() => expect(pre.textContent).toContain('<script>'));
  expect(pre.textContent).toBe(HOSTILE.replace('\u202E', ''));
  expect(container.querySelector('script')).toBeNull(); expect(reader.querySelector('a')).toBeNull(); expect(reader.querySelector('strong, b, em')).toBeNull();
  const meta = screen.getByTestId('research-reader-source');
  expect(meta.textContent).toBe('Brief · collected package · verified by the Research Kit · shortened to the first 256 KiB');
  expect(meta.compareDocumentPosition(pre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(calls.filter(call => call.method === 'research.document.read').map(call => call.params)).toEqual([{ researchId: 'r1', document: 'brief' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Read the evidence table' }));
  await waitFor(() => expect(reader.querySelector('pre')!.textContent).toBe('| U-1 | claim |'));
});

test('the reader shows workspace text as not verified, and a refused read shows its public message', async () => {
  let refuse = false;
  const { api } = bridge({ jobs: [job({ status: 'reviewing', revision: 3, reviewSessionId: 's-review' })], routes: { 'research.document.read': () => { if (refuse) throw new Error('The review workspace changed in a way Moonzila will not read through. Start the review again.'); return { text: 'draft', truncated: false, source: 'workspace', verified: false }; } } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Read the brief' }));
  await waitFor(() => expect(screen.getByTestId('research-reader-source').textContent).toBe('Brief · review workspace · not verified'));
  refuse = true;
  fireEvent.click(screen.getByRole('button', { name: 'Read the evidence table' }));
  expect(await screen.findByText(/will not read through/)).toBeTruthy();
  expect(screen.getByTestId('research-reader').querySelector('pre')).toBeNull();
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

test.each([['queued', 'Cancel collection'], ['dispatching', 'Cancel collection'], ['collecting', 'Cancel collection'], ['reviewing', 'Cancel review'], ['packaging', 'Cancel review']] as const)('a %s job can be cancelled with %s and hides the start form', async (status, label) => {
  render(<ResearchPanel api={bridge({ jobs: [job({ status, revision: 2 })] }).api} project={project} />);
  expect(await screen.findByRole('button', { name: label })).toBeTruthy();
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

// Research switch (research-review-ui spec section 4).
const offProject = { ...project, policy: { revision: 3, inference: 'cloud-allowed' as const, research: 'off' as const } };
const policyCalls = (calls: Array<{ method: string; params: Record<string, unknown> }>) => calls.filter(call => call.method === 'project.policy.update');

test('research off: Allow research opens a confirmation with every disclosure, and Cancel sends nothing', async () => {
  const { api, calls } = bridge();
  render(<ResearchPanel api={api} project={offProject} />);
  expect(screen.queryByText(/Allow research in the project policy/)).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Allow research' }));
  const confirm = screen.getByRole('group', { name: 'Allow public research?' });
  expect(confirm.textContent).toMatch(/topic, search queries and URLs of a collection are sent to your collector repository on GitHub and are readable there/);
  expect(confirm.textContent).toMatch(/Only public web pages are fetched/);
  expect(confirm.textContent).toMatch(/No project files are sent/);
  expect(confirm.textContent).toMatch(/A collection already started on GitHub keeps running there; Moonzila stops following it and does not use its result/);
  expect(confirm.textContent).not.toMatch(/private/i);
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('group', { name: 'Allow public research?' })).toBeNull();
  expect(policyCalls(calls)).toEqual([]);
  for (const button of screen.getAllByRole('button')) expect(button.textContent).not.toMatch(/authori[sz]e|approve/i);
});

test('Allow public research sends public-technical with inference exactly as stored, then offers a collection', async () => {
  const { api, calls } = bridge({ routes: { 'project.policy.update': () => ({ project: { ...offProject, policy: { revision: 4, inference: 'cloud-allowed', research: 'public-technical' } } }) } });
  const changed: unknown[] = [];
  render(<ResearchPanel api={api} project={offProject} onProjectChange={next => changed.push(next.policy)} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Allow research' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Allow public research?' })).getByRole('button', { name: 'Allow public research' }));
  expect(await screen.findByRole('button', { name: 'Start collection' })).toBeTruthy();
  expect(policyCalls(calls).map(call => call.params)).toEqual([{ projectId: 'p1', expectedRevision: 3, policy: { inference: 'cloud-allowed', research: 'public-technical' } }]);
  expect(changed).toEqual([{ revision: 4, inference: 'cloud-allowed', research: 'public-technical' }]);
  expect(screen.getByRole('button', { name: 'Turn research off' })).toBeTruthy();
});

test('research on: Turn research off asks first, warns what stops, and sends off with inference unchanged', async () => {
  const { api, calls } = bridge({ routes: { 'project.policy.update': () => ({ project: { ...project, policy: { revision: 2, inference: 'local-only', research: 'off' } } }) } });
  render(<ResearchPanel api={api} project={project} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Turn research off' }));
  expect(policyCalls(calls)).toEqual([]);
  const confirm = screen.getByRole('group', { name: 'Turn research off?' });
  expect(confirm.textContent).toMatch(/Waiting and running research jobs, collections and reviews, stop/);
  expect(confirm.textContent).toMatch(/A collection already started on GitHub keeps running there; Moonzila stops following it and does not use its result/);
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
  expect(policyCalls(calls)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Turn research off' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Turn research off?' })).getByRole('button', { name: 'Turn research off' }));
  expect(await screen.findByRole('button', { name: 'Allow research' })).toBeTruthy();
  expect(policyCalls(calls).map(call => call.params)).toEqual([{ projectId: 'p1', expectedRevision: 1, policy: { inference: 'local-only', research: 'off' } }]);
  expect(screen.queryByRole('button', { name: 'Start collection' })).toBeNull();
});

test.each([['on', project], ['off', offProject]] as const)('a RUN_ACTIVE refusal while turning research %s reads "Finish or stop the running task first" and is not retried', async (_state, start) => {
  const { api, calls } = bridge({ routes: { 'project.policy.update': () => { throw new Error(RUN_ACTIVE_MESSAGE); } } });
  render(<ResearchPanel api={api} project={start} />);
  const opener = start.policy.research === 'off' ? 'Allow research' : 'Turn research off';
  const confirmName = start.policy.research === 'off' ? 'Allow public research?' : 'Turn research off?';
  const confirmButton = start.policy.research === 'off' ? 'Allow public research' : 'Turn research off';
  fireEvent.click(await screen.findByRole('button', { name: opener }));
  fireEvent.click(within(screen.getByRole('group', { name: confirmName })).getByRole('button', { name: confirmButton }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('Finish or stop the running task first.');
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(policyCalls(calls)).toHaveLength(1);
  expect(screen.queryByRole('group', { name: confirmName })).toBeNull();
});

test('another refusal shows its own public message', async () => {
  const { api } = bridge({ routes: { 'project.policy.update': () => { throw new Error('The project changed. Reload and try again.'); } } });
  render(<ResearchPanel api={api} project={offProject} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Allow research' }));
  fireEvent.click(screen.getByRole('button', { name: 'Allow public research' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The project changed. Reload and try again.');
});

test('the RUN_ACTIVE text the panel recognises is the bridge\'s public message', () => {
  const bridgeSource = readFileSync('src/main/bridge.ts', 'utf8');
  expect(bridgeSource).toContain(`RUN_ACTIVE: '${RUN_ACTIVE_MESSAGE}'`);
});

test.each([['off'], ['public-technical']] as const)('an untrusted project with research %s shows the trust text and no switch', async research => {
  render(<ResearchPanel api={bridge().api} project={{ ...project, trusted: false, policy: { ...project.policy, research } }} />);
  expect(await screen.findByText(/Trust this project before starting research/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Allow research' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Turn research off' })).toBeNull();
});

// Unit review P4-7: the engine refuses a review for an untrusted project or with research off, so none is offered.
test.each([['untrusted', { ...project, trusted: false }], ['research off', offProject]] as const)('a collected job in a project that is %s offers no Start review', async (_case, shown) => {
  const { api, calls } = bridge({ jobs: [job({ status: 'collected', revision: 2 })] });
  render(<ResearchPanel api={api} project={shown} openConversation={() => {}} />);
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toBe('Collected'));
  await waitFor(() => expect(calls.some(call => call.method === 'research.collector.read')).toBe(true));
  expect(screen.queryByRole('button', { name: 'Start review' })).toBeNull();
  expect(screen.queryByLabelText('Review model')).toBeNull();
});

// Unit review P4-8: a reply is stale when only the reviewed package digest changed, at the same revision. The panel's
// merge never lets that through (it keeps only a higher revision), so the check itself is driven with the new job.
test('a check reply for an earlier reviewed digest at the same revision is discarded', async () => {
  const replies = [deferred<unknown>(), deferred<unknown>()]; let index = 0;
  const { api } = bridge({ routes: { 'research.document.read': () => replies[index++]!.promise } });
  const { rerender } = render(<ApprovedCheck api={api} job={approved()} />);
  await waitFor(() => expect(index).toBe(1));
  rerender(<ApprovedCheck api={api} job={approved({ reviewedPackageDigest: 'e'.repeat(64) })} />);
  await waitFor(() => expect(index).toBe(2));
  await act(async () => replies[0]!.resolve({ text: '', truncated: false, source: 'reviewed', verified: true }));
  expect(screen.getByTestId('research-status').textContent).toBe('Checking the reviewed package');
  await act(async () => replies[1]!.resolve({ text: '', truncated: false, source: 'reviewed', verified: true }));
  expect(screen.getByTestId('research-status').textContent).toBe(`Ready: approved by the Research Kit gate · package ${'e'.repeat(12)}`);
});

// Mutation audit P4-38: DocumentReader's stale-reply guards, the revision in jobKey, the reviewed-and-unverified branch,
// `approved` in READABLE_RESEARCH and the switch's revision-wins rule, each with an input that only that guard catches.
const workspaceReply = (text: string) => ({ text, truncated: false, source: 'workspace', verified: false });
function queuedReads() {
  const replies: Array<ReturnType<typeof deferred<unknown>>> = [];
  return { replies, route: () => { const reply = deferred<unknown>(); replies.push(reply); return reply.promise; } };
}

test('a brief reply or refusal arriving after the evidence table was requested is not shown (the reader\'s request-id guard)', async () => {
  const reads = queuedReads();
  const { api } = bridge({ jobs: [job({ status: 'reviewing', revision: 3, reviewSessionId: 's-review' })], routes: { 'research.document.read': reads.route } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Read the brief' }));
  fireEvent.click(screen.getByRole('button', { name: 'Read the evidence table' }));
  await waitFor(() => expect(reads.replies).toHaveLength(2));
  const reader = screen.getByTestId('research-reader');
  // The brief answers while the evidence table is still being read: nothing of it is shown.
  await act(async () => reads.replies[0]!.resolve(workspaceReply('BRIEF TEXT')));
  expect(within(reader).getByText('Reading the evidence table…')).toBeTruthy();
  expect(reader.textContent).not.toContain('BRIEF TEXT'); expect(reader.querySelector('pre')).toBeNull();
  await act(async () => reads.replies[1]!.resolve(workspaceReply('EVIDENCE TEXT')));
  expect(screen.getByTestId('research-reader-source').textContent).toBe('Evidence table · review workspace · not verified');
  expect(reader.querySelector('pre')!.textContent).toBe('EVIDENCE TEXT');
  // The same order with a refusal: the brief's refusal does not replace the evidence table being read.
  fireEvent.click(screen.getByRole('button', { name: 'Read the brief' }));
  fireEvent.click(screen.getByRole('button', { name: 'Read the evidence table' }));
  await waitFor(() => expect(reads.replies).toHaveLength(4));
  await act(async () => reads.replies[2]!.reject(new Error('The review workspace changed in a way Moonzila will not read through. Start the review again.')));
  expect(within(reader).queryByRole('alert')).toBeNull();
  expect(within(reader).getByText('Reading the evidence table…')).toBeTruthy();
  await act(async () => reads.replies[3]!.resolve(workspaceReply('EVIDENCE AGAIN')));
  expect(screen.getByTestId('research-reader-source').textContent).toBe('Evidence table · review workspace · not verified');
  expect(reader.querySelector('pre')!.textContent).toBe('EVIDENCE AGAIN');
});

test('reader text is shown only at the job revision it was read at (the reader\'s shown-key guard), and a reply after a revision change is discarded', async () => {
  // The reply handler's own `latest.current === sent` check is layered behind the shown-key guard: a reply it lets through
  // is stored under the revision it was read at, which the panel never returns to (it keeps only higher revisions), and a
  // newer read is answered first by the request-id guard. So this input is red with the shown-key guard removed, alone or
  // with that check; with only that check removed nothing visible changes (mutation audit P4-38, reported).
  const reads = queuedReads();
  const { api, notify } = bridge({ jobs: [job({ status: 'reviewing', revision: 3, reviewSessionId: 's-review' })], routes: { 'research.document.read': reads.route } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Read the brief' }));
  await waitFor(() => expect(reads.replies).toHaveLength(1));
  const reader = screen.getByTestId('research-reader');
  await act(async () => reads.replies[0]!.resolve(workspaceReply('DRAFT AT 3')));
  expect(reader.querySelector('pre')!.textContent).toBe('DRAFT AT 3');
  // The job moves on: the text read at revision 3 is no longer shown.
  notify(job({ status: 'packaging', revision: 4, reviewSessionId: 's-review' }));
  expect(screen.getByTestId('research-status').textContent).toBe('Packaging the review');
  expect(reader.querySelector('pre')).toBeNull(); expect(reader.textContent).not.toContain('DRAFT AT 3');
  expect(screen.queryByTestId('research-reader-source')).toBeNull();
  // A read sent at revision 4 and answered after revision 5: neither its pending state nor its reply is shown.
  fireEvent.click(screen.getByRole('button', { name: 'Read the brief' }));
  await waitFor(() => expect(reads.replies).toHaveLength(2));
  expect(within(reader).getByText('Reading the brief…')).toBeTruthy();
  notify(job({ status: 'not_ready', failure: 'REVIEW_GATE_FAILED', revision: 5, reviewSessionId: 's-review' }));
  expect(screen.getByTestId('research-status').textContent).toBe(RESEARCH_STATUS.not_ready);
  expect(within(reader).queryByText('Reading the brief…')).toBeNull();
  await act(async () => reads.replies[1]!.resolve(workspaceReply('DRAFT AT 4')));
  expect(reader.querySelector('pre')).toBeNull(); expect(reader.textContent).not.toContain('DRAFT AT 4');
  expect(screen.queryByTestId('research-reader-source')).toBeNull();
});

test('an approved job whose revision changes with the same digest is checked again, and its old Ready is not kept (the revision in jobKey)', async () => {
  const reads = queuedReads();
  const { api, notify } = bridge({ jobs: [approved()], routes: { 'research.document.read': reads.route } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(reads.replies).toHaveLength(1));
  await act(async () => reads.replies[0]!.resolve({ text: 'brief', truncated: false, source: 'reviewed', verified: true }));
  expect(screen.getByTestId('research-status').textContent).toBe(`Ready: approved by the Research Kit gate · package ${DIGEST.slice(0, 12)}`);
  notify(approved({ revision: 8 }));
  await waitFor(() => expect(reads.replies).toHaveLength(2));
  expect(screen.getByTestId('research-status').textContent).toBe('Checking the reviewed package');
  await act(async () => reads.replies[1]!.resolve({ text: '', truncated: false, source: 'reviewed', verified: false }));
  expect(screen.getByTestId('research-status').textContent).toBe('Unverified: the reviewed package is missing or no longer matches');
});

test('a reviewed package that does not verify shows the reader\'s Unverified explanation, not an empty text (the reviewed-and-unverified branch)', async () => {
  const { api } = bridge({ jobs: [approved()], routes: { 'research.document.read': () => ({ text: '', truncated: false, source: 'reviewed', verified: false }) } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toMatch(/^Unverified/));
  fireEvent.click(screen.getByRole('button', { name: 'Read the brief' }));
  await waitFor(() => expect(screen.getByTestId('research-reader-source').textContent).toBe('Brief · reviewed package · not verified'));
  const reader = screen.getByTestId('research-reader');
  expect(within(reader).getByText('Unverified: the reviewed package is missing or no longer matches, so nothing is shown.')).toBeTruthy();
  expect(reader.querySelector('pre')).toBeNull();
});

test('an approved job keeps the reader, which shows the verified reviewed text (approved in READABLE_RESEARCH)', async () => {
  const { api } = bridge({ jobs: [approved()], routes: { 'research.document.read': params => ({ text: params.document === 'brief' ? 'REVIEWED BRIEF' : 'REVIEWED EVIDENCE', truncated: false, source: 'reviewed', verified: true }) } });
  render(<ResearchPanel api={api} project={project} openConversation={() => {}} />);
  await waitFor(() => expect(screen.getByTestId('research-status').textContent).toMatch(/^Ready/));
  fireEvent.click(screen.getByRole('button', { name: 'Read the evidence table' }));
  await waitFor(() => expect(screen.getByTestId('research-reader').querySelector('pre')?.textContent).toBe('REVIEWED EVIDENCE'));
  expect(screen.getByTestId('research-reader-source').textContent).toBe('Evidence table · reviewed package · verified by the Research Kit');
});

test('a newer policy revision from the workbench is not masked by an older switch reply (the switch\'s revision-wins rule)', async () => {
  const { api } = bridge({ routes: { 'project.policy.update': () => ({ project: { ...offProject, policy: { revision: 4, inference: 'cloud-allowed', research: 'public-technical' } } }) } });
  const { rerender } = render(<ResearchPanel api={api} project={offProject} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Allow research' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Allow public research?' })).getByRole('button', { name: 'Allow public research' }));
  expect(await screen.findByRole('button', { name: 'Turn research off' })).toBeTruthy();
  // The workbench has not caught up yet: its older project (revision 3, off) does not undo the switch.
  rerender(<ResearchPanel api={api} project={offProject} />);
  expect(screen.getByRole('button', { name: 'Turn research off' })).toBeTruthy();
  // Research was turned off elsewhere at revision 5: the newer revision wins over the switch's reply.
  rerender(<ResearchPanel api={api} project={{ ...offProject, policy: { revision: 5, inference: 'cloud-allowed', research: 'off' } }} />);
  expect(screen.getByRole('button', { name: 'Allow research' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Turn research off' })).toBeNull();
});
