import { expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import type { UtilityProcess } from 'electron';
import { Engine } from '../src/main/engine';
import type { ReviewToolResult } from '../src/engine/review-contract';

// The main-process host routes the engine's `research.tool` port message to the review supervisor and posts the
// result or a bounded error code back, as it does for command.prepare/execute. The utility process is a double.
class Child extends EventEmitter { pid = 4242; posted: unknown[] = []; postMessage(message: unknown) { this.posted.push(message); } kill() { this.emit('exit', 0); return true; } }
const result: ReviewToolResult = { tool: 'research_preflight', pass: true, counts: { pass: 1, warn: 0, fail: 0 }, evidencePolicy: 'pluralist', findings: [] };

function host(reviewTool: (runId: string, name: string, input: unknown, epoch: string) => Promise<ReviewToolResult>) {
  const children: Child[] = []; const calls: unknown[][] = [];
  const engine = new Engine('engine.cjs', 'state.sqlite', {
    readGitHub: async () => '', event: () => {}, inference: async () => { throw new Error('unused'); }, cancel: () => {}, restarted: () => {},
    prepareCommand: async () => { throw new Error('unused'); }, executeCommand: async () => { throw new Error('unused'); }, inspectGit: async () => { throw new Error('unused'); },
    reviewTool: (...args) => { calls.push(args); return reviewTool(...args); },
  }, () => { const child = new Child(); children.push(child); return child as unknown as UtilityProcess; });
  engine.start();
  const child = children[0]!; child.emit('message', { type: 'ready', epoch: engine.epoch });
  return { engine, child, calls };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('research.tool reaches the reviewTool hook and its result goes back as research.tool.result', async () => {
  const { engine, child, calls } = host(async () => result);
  child.emit('message', { type: 'research.tool', epoch: engine.epoch, id: 't1', runId: 'run-1', name: 'research_preflight', input: {} });
  await settle();
  expect(calls).toEqual([['run-1', 'research_preflight', {}, engine.epoch]]);
  expect(child.posted).toEqual([{ type: 'research.tool.result', epoch: engine.epoch, id: 't1', result }]);
});

test('a contract error code crosses as research.tool.error; anything else is REVIEW_TOOL_FAILED, never the raw text', async () => {
  for (const [thrown, code] of [['BRIEF_NOT_DRAFTED', 'BRIEF_NOT_DRAFTED'], ['RUN_CANCELLED', 'RUN_CANCELLED'], ['RESEARCH_KIT_UNAVAILABLE', 'RESEARCH_KIT_UNAVAILABLE'], ['ENOENT: C:\\Users\\someone\\secret', 'REVIEW_TOOL_FAILED']] as const) {
    const { engine, child } = host(async () => { throw new Error(thrown); });
    child.emit('message', { type: 'research.tool', epoch: engine.epoch, id: 't2', runId: 'run-1', name: 'research_draft_brief', input: { force: true } });
    await settle();
    expect(child.posted).toEqual([{ type: 'research.tool.error', epoch: engine.epoch, id: 't2', code }]);
  }
});

test('a research.tool message of another epoch, or a malformed one, never reaches the hook', async () => {
  const { engine, child, calls } = host(async () => result);
  child.emit('message', { type: 'research.tool', epoch: 'old-epoch', id: 't3', runId: 'run-1', name: 'research_preflight', input: {} });
  child.emit('message', { type: 'research.tool', epoch: engine.epoch, id: 't4', runId: 'run-1', name: 'run_command', input: {} });
  child.emit('message', { type: 'research.tool', epoch: engine.epoch, id: 't5', runId: 'run-1', name: 'research_preflight', input: { force: false } });
  await settle();
  expect(calls).toEqual([]); expect(child.posted).toEqual([]);
});

test('a result that arrives after the engine restarted is dropped', async () => {
  let finish!: (value: ReviewToolResult) => void;
  const { engine, child } = host(() => new Promise(resolve => { finish = resolve; }));
  child.emit('message', { type: 'research.tool', epoch: engine.epoch, id: 't6', runId: 'run-1', name: 'research_preflight', input: {} });
  await settle();
  engine.epoch = '00000000-0000-4000-8000-000000000000';
  finish(result); await settle();
  expect(child.posted).toEqual([]);
});

test('every research.tool request gets exactly one reply: a result outside the contract becomes REVIEW_TOOL_FAILED', async () => {
  const oversized = { tool: 'research_draft_brief', content: 'x'.repeat(1024 * 1024 + 1) } as ReviewToolResult;
  const { engine, child } = host(async () => oversized);
  child.emit('message', { type: 'research.tool', epoch: engine.epoch, id: 't7', runId: 'run-1', name: 'research_draft_brief', input: {} });
  await settle(); await settle();
  expect(child.posted).toEqual([{ type: 'research.tool.error', epoch: engine.epoch, id: 't7', code: 'REVIEW_TOOL_FAILED' }]);
});
