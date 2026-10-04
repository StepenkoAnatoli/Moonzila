import { afterAll, beforeAll, expect, test } from 'vitest';
import { appendFile, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { ResearchKit } from '../src/adapters/research-kit/adapter';
import type { OwnedCommand, OwnedOptions, OwnedResult, OwnedRunner } from '../src/tools/commands';

// The collector launch against the real pinned kit, with the native helper replaced by a runner that does what the
// helper does before CreateProcessW: take the read locks, run beforeStart, then report the child. Runs on any OS.
let root: string; let nodeSha256: string;
const kitRoot = resolve('.build/research-kit-external/research-kit');
const exited: OwnedResult = { status: 'exited', code: 0, output: '{}', truncated: false, cancelled: false, timedOut: false };
interface Seen { request: OwnedCommand; options: OwnedOptions; started: boolean }
function runner(seen: Seen[], hold?: Promise<void>): OwnedRunner {
  return async (request, signal, options = {}) => {
    const entry: Seen = { request, options, started: false }; seen.push(entry);
    if (signal?.aborted) throw new Error('RUN_CANCELLED');
    await options.beforeStart?.();
    entry.started = true; options.onStarted?.({ pid: 4242, createdAt: '1' });
    await hold;
    return exited;
  };
}
const make = (seen: Seen[], name: string, hold?: Promise<void>, patch: Partial<{ nodeSha256: string; kitRoot: string }> = {}) =>
  new ResearchKit({ kitRoot, nodePath: process.execPath, nodeSha256, storageRoot: join(root, name), helperPath: resolve('.build/native/MoonAlizaHost.exe'), ...patch }, runner(seen, hold));
const options = (admit: () => Promise<void> = async () => {}) => ({ timeoutMs: 1000, admissionTimeoutMs: 600, maxOutputBytes: 4096, signal: new AbortController().signal, admit, onStarted: () => {} });

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'monnzila-collector-launch-')); nodeSha256 = createHash('sha256').update(await readFile(process.execPath)).digest('hex'); });
afterAll(async () => { if (root) { const rel = relative(resolve(tmpdir()), root); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_TEST_CLEANUP'); await rm(root, { recursive: true, force: true }); } });

test('a launch runs the staged collect-remote.mjs in its own folder, with the guarded locks and the admission inside beforeStart', async () => {
  const seen: Seen[] = []; const kit = make(seen, 'happy');
  try {
    const launch = await kit.prepareCollector();
    expect(launch.node).toBe(process.execPath);
    expect(launch.script.endsWith(join('bin', 'collect-remote.mjs'))).toBe(true);
    for (const folder of [launch.out, launch.temp]) expect((await stat(folder)).isDirectory()).toBe(true);
    const order: string[] = [];
    const result = await launch.start([launch.script, '--json'], { TEMP: launch.temp }, { ...options(async () => { order.push(`admit:${seen[0]!.started}`); }), onStarted: () => order.push('started') });
    expect(result).toEqual(exited);
    expect(order).toEqual(['admit:false', 'started']);
    const { request, options: used } = seen[0]!;
    expect(request).toMatchObject({ executable: process.execPath, args: [launch.script, '--json'], env: { TEMP: launch.temp }, timeoutMs: 1000, maxOutputBytes: 4096 });
    expect(resolve(request.cwd)).toBe(resolve(launch.out, '..'));
    // A watch's report arrives after the kit wrote its package: hitting the output limit must not kill it mid-write.
    expect(used.stopOnOutputLimit).toBe(false);
    // The helper bounds the whole pre-start step (locks, rehash, admission) by this, not by the child's own timeout.
    expect(used.admissionTimeoutMs).toBe(600);
    expect(used.readLocks![0]).toBe(process.execPath);
    expect(used.readLocks).toContain(launch.script);
    await launch.dispose();
    await expect(stat(resolve(launch.out, '..'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await kit.close(); }
}, 60000);

test('a refused admission, a changed runtime or a changed staged file means no child', async () => {
  const seen: Seen[] = []; const kit = make(seen, 'refused');
  try {
    const launch = await kit.prepareCollector();
    await expect(launch.start([launch.script], {}, options(async () => { throw new Error('ADMISSION_REFUSED'); }))).rejects.toThrow('ADMISSION_REFUSED');
    expect(seen[0]!.started).toBe(false);
    // The staged runtime is rehashed after the locks are held: a byte appended to the script is caught before admission.
    let admitted = false;
    await appendFile(launch.script, '\n');
    await expect(launch.start([launch.script], {}, options(async () => { admitted = true; }))).rejects.toThrow('INSTALLATION_INVALID');
    expect(seen[1]!.started).toBe(false); expect(admitted).toBe(false);
    await launch.dispose();
  } finally { await kit.close(); }
  const other: Seen[] = []; const changed = make(other, 'changed-node', undefined, { nodeSha256: '0'.repeat(64) });
  try {
    // Node is hashed once its read lock is held, right before admission: a changed runtime never reaches admit().
    const launch = await changed.prepareCollector(); let admitted = false;
    await expect(launch.start([launch.script], {}, options(async () => { admitted = true; }))).rejects.toThrow('INSTALLATION_INVALID');
    expect(other[0]!.started).toBe(false); expect(admitted).toBe(false);
    await launch.dispose();
  } finally { await changed.close(); }
}, 60000);

test('close waits for a running collector; sweep refuses while busy and clears what a crash left', async () => {
  let release!: () => void; const hold = new Promise<void>(r => { release = r; });
  const seen: Seen[] = []; const kit = make(seen, 'busy', hold);
  const launch = await kit.prepareCollector();
  const running = launch.start([launch.script], {}, options());
  await expect(kit.sweep()).rejects.toThrow('KIT_BUSY');
  let closed = false; const closing = kit.close().then(() => { closed = true; });
  await new Promise(r => setTimeout(r, 50));
  expect(closed).toBe(false);
  release(); await running; await closing;
  expect(closed).toBe(true);
  // A fresh instance over the same storage (the next app start) sweeps the left-over collector folder.
  const next = make([], 'busy');
  try {
    expect(await readdir(join(root, 'busy', 'collect'))).toHaveLength(1);
    await next.sweep();
    await expect(readdir(join(root, 'busy', 'collect'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await next.close(); }
}, 60000);
