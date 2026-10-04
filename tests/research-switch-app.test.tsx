// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { App } from '../src/renderer/App';

afterEach(cleanup);
const now = '2026-10-04T00:00:00Z';

test('after the research switch, the workbench re-reads its projects, so the details pane and policy revision are current', async () => {
  let project = { id: 'p1', name: 'My project', pathLabel: 'C:\\work\\my-project', trusted: true, trustRevision: 1, policy: { revision: 1, inference: 'local-only', research: 'off' }, missing: false, createdAt: now };
  const updates: unknown[] = [];
  const api = {
    async invoke(method: string, params: Record<string, unknown> = {}) {
      if (method === 'project.list') return { projects: [project] };
      if (method === 'project.policy.update') { updates.push(params); project = { ...project, policy: { revision: 2, inference: 'local-only', research: 'public-technical' } }; return { project }; }
      if (method === 'profile.list') return { profiles: [] };
      if (method === 'session.list') return { sessions: [] };
      if (method === 'changes.list') return { changes: [], hasMore: false };
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
  const details = screen.getByRole('complementary', { name: 'Project details' });
  expect(within(details).getByText('Research is off for this project.')).toBeTruthy();
  fireEvent.click(within(details).getByRole('button', { name: 'Open research' }));
  const dialog = await screen.findByRole('dialog', { name: 'Research' });
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Allow research' }));
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Allow public research' }));
  await waitFor(() => expect(updates).toHaveLength(1));
  // App must refresh its projects: the details pane no longer says research is off.
  await waitFor(() => expect(within(details).queryByText('Research is off for this project.')).toBeNull());
});
