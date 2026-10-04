// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import type { Run } from '../src/shared';
import { ChangesPanel } from '../src/renderer/ChangesPanel';

afterEach(cleanup);
const hash = `sha256:${'a'.repeat(64)}`;
const operation = { id: 'op1', runId: 'run1', projectId: 'p1', kind: 'write' as const, inputHash: hash, policyRevision: 1, trustRevision: 1, status: 'prepared' as const };
function bridge(hold?: { list?: Promise<unknown> }) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      calls.push({ method, params });
      if (method === 'changes.list') return hold?.list ?? { changes: [] };
      if (method === 'approval.list') return { operations: [operation] };
      if (method === 'approval.read') return { kind: 'write', operation, path: 'research/BRIEF.md', before: 'old', after: 'new' };
      if (method === 'approval.decide') return { approval: params };
      if (method === 'recovery.list') return { items: [], hasMore: false, pendingCount: 0 };
      if (method === 'storage.read') return {};
      throw new Error(`Unexpected route ${method}`);
    },
    onEvent: () => () => {},
    onResearch: () => () => {},
  };
  return { api, calls };
}

test('an approval card in a research-mode run is labelled as the research workspace, not as a project edit', async () => {
  const { api, calls } = bridge();
  render(<ChangesPanel api={api} projectId="p1" runId="run1" runMode="research" />);
  expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('Research workspace · research/BRIEF.md');
  expect(screen.queryByText(/Review edit/)).toBeNull();
  // Everything else on the card is unchanged.
  expect(screen.getByText('The file will change only after you approve this exact edit.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Decline edit' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Approve edit' }));
  await waitFor(() => expect(calls.some(call => call.method === 'approval.decide')).toBe(true));
  expect(calls.find(call => call.method === 'approval.decide')!.params).toEqual({ operationId: 'op1', projectId: 'p1', inputHash: hash, policyRevision: 1, trustRevision: 1, decision: 'allow' });
});

for (const mode of ['ask', 'plan', 'build', 'mission', undefined] as Array<Run['mode'] | undefined>) {
  test(`an approval card in a ${mode ?? 'mode-less'} run keeps the "Review edit" label`, async () => {
    const { api } = bridge();
    render(<ChangesPanel api={api} projectId="p1" runId="run1" runMode={mode} />);
    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('Review edit · research/BRIEF.md');
    expect(screen.queryByText(/Research workspace/)).toBeNull();
  });
}

test('a card loaded in a research run keeps its label while the run stops being active and the reload is still pending', async () => {
  const hold: { list?: Promise<unknown> } = {};
  const { api } = bridge(hold);
  const view = render(<ChangesPanel api={api} projectId="p1" runId="run1" runMode="research" />);
  expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('Research workspace · research/BRIEF.md');
  let release!: (value: unknown) => void;
  hold.list = new Promise(resolve => { release = resolve; });
  view.rerender(<ChangesPanel api={api} projectId="p1" runId={undefined} runMode={undefined} />);
  // The stale card is still on screen until the held load resolves; it must never read as a project edit.
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Research workspace · research/BRIEF.md');
  expect(screen.queryByText(/Review edit/)).toBeNull();
  await act(async () => { release({ changes: [] }); });
  await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).toBeNull());
});
