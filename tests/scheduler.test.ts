import { afterEach, expect, test, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { InferenceScheduler, LeaseFence, type InferenceLease, type SchedulerOptions } from '../src/engine/scheduler';
import { spawnOwned, safeCommandEnvironment, type OwnedResult } from '../src/tools/commands';

function deferred<T = void>() { let resolve!: (value: T | PromiseLike<T>) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const schedulers: InferenceScheduler[] = [];
afterEach(async () => { await Promise.allSettled(schedulers.splice(0).map(scheduler => scheduler.shutdown())); });
function scheduler(options: Partial<SchedulerOptions> = {}) { const value = new InferenceScheduler({ stopRuntime: async () => {}, ...options }); schedulers.push(value); return value; }
function caught<T>(promise: Promise<T>) { return promise.then(value => ({ value, error: '' }), (error: Error) => ({ value: undefined, error: error.message })); }
async function until(check: () => boolean) { const end = Date.now() + 3000; while (!check() && Date.now() < end) await delay(5); expect(check()).toBe(true); }

test('a stopping holder and a foreign or copied token cannot authorize another lease', () => {
  const fence = new LeaseFence(); const token = fence.acquire();
  expect(() => fence.assertCurrent({ ...token })).toThrow('STALE_LEASE');
  expect(() => new LeaseFence().assertCurrent(token)).toThrow('STALE_LEASE');
  fence.beginStop(token); expect(() => fence.assertCurrent(token)).toThrow('LEASE_STOPPING');
  expect(() => fence.acquire()).toThrow('BUSY');
  fence.confirmStopped(token); const next = fence.acquire(); expect(next).not.toBe(token);
  expect(() => fence.confirmStopped(token)).toThrow('STALE_LEASE'); fence.assertCurrent(next);
});

test('FIFO work waits for both the previous task and its confirmed runtime cleanup', async () => {
  const task = deferred<string>(), cleanup = deferred(); const order: string[] = []; let stopping = false;
  const queue = scheduler({ stopRuntime: async () => { stopping = true; await cleanup.promise; } });
  const first = caught(queue.run(async () => { order.push('first'); return task.promise; }));
  const second = caught(queue.run(async () => { order.push('second'); return 'two'; }));
  const third = caught(queue.run(async () => { order.push('third'); return 'three'; }));
  try {
    await until(() => order.length > 0); expect(order).toEqual(['first']);
    task.resolve('one'); await until(() => stopping); expect(order).toEqual(['first']);
    cleanup.resolve(); expect(await first).toEqual({ value: 'one', error: '' });
    expect((await second).value).toBe('two'); expect((await third).value).toBe('three');
    expect(order).toEqual(['first', 'second', 'third']);
  } finally { task.resolve('one'); cleanup.resolve(); }
});

test('queued cancellation removes work without running it or consuming later capacity', async () => {
  const gate = deferred(); const queue = scheduler({ maxQueue: 1 }); const active = caught(queue.run(async () => gate.promise));
  const controller = new AbortController(); let effect = false;
  const cancelled = caught(queue.run(async () => { effect = true; }, { signal: controller.signal }));
  try {
    expect((await caught(queue.run(async () => {}))).error).toBe('INFERENCE_QUEUE_FULL');
    controller.abort(); expect((await cancelled).error).toBe('INFERENCE_CANCELLED');
    const next = caught(queue.run(async () => 'next')); gate.resolve(); await active;
    expect((await next).value).toBe('next'); expect(effect).toBe(false);
  } finally { gate.resolve(); }
});

test('expired queued work never starts after capacity becomes available', async () => {
  const gate = deferred(); const queue = scheduler(); const active = caught(queue.run(async () => gate.promise)); let effect = false;
  const queued = caught(queue.run(async () => { effect = true; }, { queueTimeoutMs: 30 }));
  try { expect((await queued).error).toBe('INFERENCE_QUEUE_TIMEOUT'); gate.resolve(); await active; expect(effect).toBe(false); }
  finally { gate.resolve(); }
});

test('Stop revokes the holder immediately but waits for cleanup before delivering cancellation or running queued work', async () => {
  const cleanup = deferred(); const task = deferred<string>(); const controller = new AbortController(); let lease: InferenceLease | undefined; let secondStarted = false; let firstSettled = false;
  const queue = scheduler({ stopRuntime: async () => cleanup.promise });
  const first = caught(queue.run(async current => { lease = current; return task.promise; }, { signal: controller.signal })).then(value => { firstSettled = true; return value; });
  const second = caught(queue.run(async () => { secondStarted = true; return 'second'; }));
  try {
    await until(() => !!lease); controller.abort(); await delay(10);
    expect(lease!.signal.aborted).toBe(true); expect(() => lease!.assertCurrent()).toThrow();
    expect(firstSettled).toBe(false); expect(secondStarted).toBe(false);
    cleanup.resolve(); expect((await first).error).toBe('INFERENCE_CANCELLED'); expect((await second).value).toBe('second');
    task.resolve('late success'); expect(() => lease!.assertCurrent()).toThrow('STALE_LEASE');
  } finally { cleanup.resolve(); task.resolve('cleanup'); }
});

test.each([{ options: { leaseTimeoutMs: 35, heartbeatTimeoutMs: 1000 }, error: 'INFERENCE_DEADLINE' }, { options: { leaseTimeoutMs: 1000, heartbeatTimeoutMs: 35 }, error: 'INFERENCE_HEARTBEAT_TIMEOUT' }])('expiry fences abandoned work until cleanup: $error', async ({ options, error }) => {
  const cleanup = deferred(); let stopping = false, secondStarted = false;
  const queue = scheduler({ stopRuntime: async () => { stopping = true; await cleanup.promise; } });
  const first = caught(queue.run(async () => new Promise<string>(() => {}), options));
  const second = caught(queue.run(async () => { secondStarted = true; }));
  try { await until(() => stopping); expect(secondStarted).toBe(false); cleanup.resolve(); expect((await first).error).toBe(error); await second; expect(secondStarted).toBe(true); }
  finally { cleanup.resolve(); }
});

test('heartbeats renew liveness but cannot extend the hard lease deadline', async () => {
  // Virtual time: on the real clock, a worker stall of 70 ms or more between two 10 ms beats expires the heartbeat first.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  try {
    const queue = scheduler(); let beats = 0; let settled = false;
    const pending = caught(queue.run(async lease => {
      const timer = setInterval(() => { try { lease.heartbeat(); beats++; } catch { clearInterval(timer); } }, 10);
      try { await new Promise<void>(done => lease.signal.addEventListener('abort', () => done(), { once: true })); }
      finally { clearInterval(timer); }
    }, { heartbeatTimeoutMs: 80, leaseTimeoutMs: 150 })).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
    const result = await pending;
    expect(beats).toBeGreaterThan(8); expect(result.error).toBe('INFERENCE_DEADLINE');
  } finally { vi.useRealTimers(); }
});

test.each(['reject', 'timeout'] as const)('unconfirmed cleanup permanently fences the queue: %s', async failure => {
  let secondStarted = false;
  const queue = scheduler({ cleanupTimeoutMs: 30, stopRuntime: async () => { if (failure === 'reject') throw new Error('owner unknown'); await new Promise<void>(() => {}); } });
  const first = caught(queue.run(async () => 'not safe to publish'));
  const second = caught(queue.run(async () => { secondStarted = true; }));
  expect((await first).error).toBe('RUNTIME_STOP_UNCONFIRMED'); expect((await second).error).toBe('RUNTIME_STOP_UNCONFIRMED');
  expect((await caught(queue.run(async () => {}))).error).toBe('RUNTIME_STOP_UNCONFIRMED'); expect(secondStarted).toBe(false);
});

test('task failure still waits for runtime cleanup and does not poison later work after confirmed Stop', async () => {
  const queue = scheduler(); expect((await caught(queue.run(async () => { throw new Error('provider invalid'); }))).error).toBe('provider invalid');
  expect((await queue.run(async () => 'next'))).toBe('next');
});

test('maintenance drains existing work and closes new inference admission until its callback settles', async () => {
  const gate = deferred(); const maintenance = deferred(); const order: string[] = [];
  const queue = scheduler(); const first = caught(queue.run(async () => { order.push('first'); await gate.promise; }));
  const second = caught(queue.run(async () => { order.push('second'); }));
  const change = caught(queue.withRuntimeStopped(async () => { order.push('maintenance'); await maintenance.promise; return 'activated'; }));
  try {
    expect((await caught(queue.run(async () => {}))).error).toBe('RUNTIME_MAINTENANCE');
    gate.resolve(); await first; await second; await until(() => order.includes('maintenance'));
    expect(order).toEqual(['first', 'second', 'maintenance']);
    expect((await caught(queue.run(async () => {}))).error).toBe('RUNTIME_MAINTENANCE');
    maintenance.resolve(); expect((await change).value).toBe('activated'); expect(await queue.run(async () => 'ready')).toBe('ready');
  } finally { gate.resolve(); maintenance.resolve(); }
});

test('maintenance cancellation keeps the gate closed until filesystem work actually settles', async () => {
  const work = deferred(); const controller = new AbortController(); let started = false, settled = false;
  const queue = scheduler(); const change = caught(queue.withRuntimeStopped(async () => { started = true; await work.promise; }, controller.signal)).then(value => { settled = true; return value; });
  try {
    await until(() => started); controller.abort(); await delay(10); expect(settled).toBe(false);
    expect((await caught(queue.run(async () => {}))).error).toBe('RUNTIME_MAINTENANCE');
    work.resolve(); expect((await change).error).toBe('INFERENCE_CANCELLED'); expect(await queue.run(async () => 'ready')).toBe('ready');
  } finally { work.resolve(); }
});

test('shutdown closes admission, cancels queued work, and waits for owned cleanup', async () => {
  const cleanup = deferred(); let started = false, settled = false;
  const queue = scheduler({ stopRuntime: async () => cleanup.promise });
  const first = caught(queue.run(async () => { started = true; return new Promise<void>(() => {}); }));
  const queued = caught(queue.run(async () => 'must not run'));
  try {
    await until(() => started); const closing = caught(queue.shutdown()).then(value => { settled = true; return value; });
    expect((await queued).error).toBe('SCHEDULER_CLOSED'); await delay(10); expect(settled).toBe(false);
    expect((await caught(queue.run(async () => {}))).error).toBe('SCHEDULER_CLOSED'); cleanup.resolve();
    expect((await first).error).toBe('SCHEDULER_CLOSED'); expect((await closing).error).toBe('');
  } finally { cleanup.resolve(); }
});

test('pre-cancelled work and invalid limits never enter the queue', async () => {
  expect(() => scheduler({ maxQueue: -1 })).toThrow('INVALID_SCHEDULER_LIMIT');
  const queue = scheduler(); const abort = new AbortController(); abort.abort(); let effect = false;
  expect((await caught(queue.run(async () => { effect = true; }, { signal: abort.signal }))).error).toBe('INFERENCE_CANCELLED');
  expect((await caught(queue.run(async () => {}, { leaseTimeoutMs: 0 }))).error).toBe('INVALID_SCHEDULER_LIMIT');
  expect(effect).toBe(false);
});

test('an absent token cannot authorize an idle fence', () => {
  expect(() => new LeaseFence().assertCurrent(undefined as never)).toThrow('STALE_LEASE');
});

test.each(['deadline', 'heartbeat'] as const)('blocked event-loop time cannot renew an already expired %s lease', async kind => {
  const queue = scheduler(); let staleEffect = false;
  const result = await caught(queue.run(async lease => {
    // Real elapsed time while timer callbacks cannot run in this worker.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
    lease.heartbeat(); lease.assertCurrent(); staleEffect = true;
  }, { leaseTimeoutMs: kind === 'deadline' ? 20 : 1000, heartbeatTimeoutMs: kind === 'heartbeat' ? 20 : 1000 }));
  expect(staleEffect).toBe(false);
  expect(result.error).toBe(kind === 'deadline' ? 'INFERENCE_DEADLINE' : 'INFERENCE_HEARTBEAT_TIMEOUT');
});

test('a late completion cannot succeed merely because its deadline timer has not run yet', async () => {
  const queue = scheduler();
  const result = await caught(queue.run(async () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40); return 'late'; }, { leaseTimeoutMs: 20 }));
  expect(result.error).toBe('INFERENCE_DEADLINE'); expect(result.value).toBeUndefined();
});

test('queued work cannot start after its deadline while the event loop is delayed', async () => {
  const queue = scheduler(); let expiredEffect = false;
  const first = caught(queue.run(async () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40); }));
  const queued = caught(queue.run(async () => { expiredEffect = true; }, { queueTimeoutMs: 20 }));
  await first; expect((await queued).error).toBe('INFERENCE_QUEUE_TIMEOUT'); expect(expiredEffect).toBe(false);
});

test('completed work revokes its abort signal before cleanup can admit another holder', async () => {
  let lease: InferenceLease | undefined; let revokedDuringStop = false;
  const queue = scheduler({ stopRuntime: async () => { revokedDuringStop = lease?.signal.aborted === true; } });
  expect(await queue.run(async current => { lease = current; return 'complete'; })).toBe('complete');
  expect(revokedDuringStop).toBe(true); expect(() => lease!.assertCurrent()).toThrow('STALE_LEASE');
});

test('cleanup beyond its elapsed deadline does not publish success if the timer callback was delayed', async () => {
  const queue = scheduler({ cleanupTimeoutMs: 20, stopRuntime: async () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40); } });
  expect((await caught(queue.run(async () => 'late cleanup'))).error).toBe('RUNTIME_STOP_UNCONFIRMED');
});

test('a real native-owned child and grandchild exit before a queued holder starts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'monnzila-scheduler-')); const path = join(directory, 'pids.json');
  const controller = new AbortController(); const ownerStop = new AbortController();
  let running: Promise<OwnedResult> | undefined; let ready: number[] = [];
  const queue = scheduler({ stopRuntime: async () => {
    ownerStop.abort();
    if (running && (await running).status !== 'exited') throw new Error('OWNER_UNKNOWN');
  } });
  // The directory is deleted even when the owned tree or shutdown fails; that failure is still reported.
  const cleanup = async () => {
    controller.abort(); ownerStop.abort(); let failure: unknown;
    try { await running; await queue.shutdown(); } catch (error) { failure = error; }
    const child = relative(resolve(tmpdir()), directory); expect(child && !child.startsWith('..') && !isAbsolute(child)).toBeTruthy();
    try { await rm(directory, { recursive: true, force: true }); } catch (error) { if (failure === undefined) throw error; }
    if (failure !== undefined) throw failure;
  };
  const first = caught(queue.run(async lease => {
    lease.assertCurrent();
    running = spawnOwned({ executable: process.execPath, args: [resolve('tests/fixtures/processes/tree.mjs'), path], cwd: directory, env: safeCommandEnvironment(), timeoutMs: 10000, maxOutputBytes: 4096 }, AbortSignal.any([lease.signal, ownerStop.signal]));
    return running;
  }, { signal: controller.signal }));
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = JSON.parse(await readFile(path, 'utf8')) as number[]; if (ready.length === 2) break; } catch { /* The native-owned tree publishes this when ready. */ }
      await delay(25);
    }
    expect(ready).toHaveLength(2);
    const next = caught(queue.run(async lease => {
      lease.assertCurrent();
      return ready.filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
    }));
    controller.abort(); expect((await first).error).toBe('INFERENCE_CANCELLED');
    expect((await next).value).toEqual([]); expect((await running)!.cancelled).toBe(true);
  } finally { await cleanup(); }
});
