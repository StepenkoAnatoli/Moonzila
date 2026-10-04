import { afterEach, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { inspectProjectPath, quoteWindowsArg, safeCommandEnvironment, spawnOwned } from '../src/tools/commands';

const fixture = resolve('tests/fixtures/processes/tree.mjs');
const directories: string[] = [];
const request = (args: string[], extra: Record<string, unknown> = {}) => ({
  executable: process.execPath, args, cwd: process.cwd(), env: safeCommandEnvironment(), timeoutMs: 10000, maxOutputBytes: 8192, ...extra
});
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function pidFile(path: string): Promise<number[]> {
  for (let n = 0; n < 100; n++) {
    try { const pids = JSON.parse(await readFile(path, 'utf8')) as number[]; if (pids.length === 2) return pids; } catch { /* wait for atomic file */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Tree did not publish child/grandchild PIDs');
}
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function assertDead(pids: number[]) {
  for (let n = 0; n < 100 && pids.some(alive); n++) await new Promise(resolve => setTimeout(resolve, 50));
  expect(pids.filter(alive)).toEqual([]);
}
test('quotes spaces, empty strings, embedded quotes, and trailing slashes', () => {
  expect(quoteWindowsArg('hello world')).toBe('"hello world"');
  expect(quoteWindowsArg('a"b')).toBe('"a\\"b"');
  expect(quoteWindowsArg('')).toBe('""');
  expect(quoteWindowsArg('x y\\')).toBe('"x y\\\\"');
});
test('environment allowlist excludes secrets and engine tuning', () => {
  expect(safeCommandEnvironment({ SystemRoot: 'C:\\Windows', PATH: 'C:\\Tools', OPENAI_API_KEY: 'secret', NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1' })).toEqual({ SystemRoot: 'C:\\Windows', PATH: 'C:\\Tools' });
});
test('real process returns arguments, supplied environment, cwd, EOF stdin and nonzero exit', async () => {
  const args = ['hello world', 'a"b', 'x y\\', '', 'שלום'];
  const result = await spawnOwned(request(['-e', 'process.stdin.resume();process.stdin.on("end",()=>{console.log(JSON.stringify({args:process.argv.slice(1),cwd:process.cwd(),value:process.env.VISIBLE,secret:process.env.OPENAI_API_KEY??null}));process.exitCode=7})', '--', ...args], { env: { ...safeCommandEnvironment(), VISIBLE: 'yes' } }));
  expect(result.status).toBe('exited'); expect(result.code).toBe(7);
  expect(JSON.parse(result.output)).toEqual({ args, cwd: process.cwd(), value: 'yes', secret: null });
});
test('output cap continues draining a multi-megabyte real stream without deadlock', async () => {
  const result = await spawnOwned(request(['-e', 'for(let i=0;i<4096;i++)process.stdout.write("x".repeat(1024));'], { maxOutputBytes: 1000 }));
  expect(result.status).toBe('exited'); expect(result.code).toBe(0); expect(result.truncated).toBe(true); expect(Buffer.byteLength(result.output)).toBe(1000);
});
test('cancel waits for child and grandchild death and preserves an unrelated process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'monnzila-process-')); directories.push(directory);
  const file = join(directory, 'pids.json');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  try {
    const controller = new AbortController();
    const pending = spawnOwned(request([fixture, file]), controller.signal);
    const pids = await pidFile(file); controller.abort();
    const result = await pending;
    expect(result.status).toBe('exited'); expect(result.cancelled).toBe(true); expect(result.code).not.toBeNull();
    await assertDead(pids); expect(alive(unrelated.pid!)).toBe(true);
  } finally { unrelated.kill(); }
});
test('timeout confirms owned tree exit', async () => {
  const result = await spawnOwned(request(['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 150 }));
  expect(result.status).toBe('exited'); expect(result.timedOut).toBe(true); expect(result.code).not.toBeNull();
});
test('helper death produces unknown and preserves output', async () => {
  const result = await spawnOwned(request(['-e', 'console.log("before death");setTimeout(()=>process.kill(process.ppid),100);setInterval(()=>{},1000)']));
  expect(result.status).toBe('unknown'); expect(result.code).toBeNull(); expect(result.output).toContain('before death');
});
test('controlling engine death closes the pipe and kills owned descendants', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'monnzila-engine-')); directories.push(directory);
  const file = join(directory, 'pids.json');
  const engine = spawn(process.execPath, [resolve('tests/fixtures/processes/controller.mjs'), file], { windowsHide: true, stdio: 'ignore' });
  try { const pids = await pidFile(file); engine.kill(); await assertDead(pids); } finally { engine.kill(); }
});
test('rejects implicit cmd and inherited engine tuning', async () => {
  await expect(spawnOwned(request([], { executable: 'C:\\test.cmd' }))).rejects.toThrow(/BATCH_REQUIRES_EXPLICIT_SHELL/);
  await expect(spawnOwned(request([], { env: { NODE_OPTIONS: '--inspect' } }))).rejects.toThrow(/FORBIDDEN_COMMAND_ENV/);
});
test('native path inspection resolves the real directory on its fixed volume', async () => {
  const result = await inspectProjectPath(process.cwd());
  expect(result.rootPath.toLowerCase()).toBe(process.cwd().toLowerCase()); expect(result.localFixed).toBe(true);
});
