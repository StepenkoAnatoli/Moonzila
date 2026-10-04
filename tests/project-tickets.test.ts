import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { ProjectTickets } from '../src/main/projects';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'moonzila-tickets-')); roots.push(root);
  await mkdir(join(root, 'project'));
  return join(root, 'project');
}

test('a native selection creates a bounded single-use ticket tied to its window', async () => {
  const root = await fixture();
  const tickets = new ProjectTickets(async () => true);
  const result = await tickets.issue(root, 11);
  const canonicalRoot = await realpath(root);
  expect(result.pathLabel).toBe(canonicalRoot);
  expect(() => tickets.consume(result.ticket, 12)).toThrow('PROJECT_TICKET_INVALID');
  expect(tickets.consume(result.ticket, 11).rootPath).toBe(canonicalRoot);
  expect(() => tickets.consume(result.ticket, 11)).toThrow('PROJECT_TICKET_INVALID');
});

test('expiry and window teardown revoke otherwise valid selections', async () => {
  const root = await fixture(); let now = 1000;
  const tickets = new ProjectTickets(async () => true, () => now);
  const expired = await tickets.issue(root, 1);
  now += 600_001;
  expect(() => tickets.consume(expired.ticket, 1)).toThrow('PROJECT_TICKET_INVALID');
  const revoked = await tickets.issue(root, 1);
  tickets.revokeOwner(1);
  expect(() => tickets.consume(revoked.ticket, 1)).toThrow('PROJECT_TICKET_INVALID');
});

test('native selection still requires a real directory on a local fixed volume', async () => {
  const root = await fixture();
  await expect(new ProjectTickets(async () => false).issue(root, 1)).rejects.toThrow('PROJECT_VOLUME_UNSUPPORTED');
  await expect(new ProjectTickets(async () => true).issue(join(root, 'missing'), 1)).rejects.toThrow();
});
