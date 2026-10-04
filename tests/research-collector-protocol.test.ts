import { afterAll, beforeAll, expect, test } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import goldenFile from './fixtures/research-kit/collector-golden/goldens.json';
import { classifyDispatch, classifyWatch, collectorEnvironment, commandLineFits, COLLECTOR_LIMITS, dispatchArgs, packageFileName, parseKitLine, watchArgs, watchBounds, type CollectorAttempt, type CollectorJob } from '../src/adapters/research-kit/collector';
import { validatorEnvironment } from '../src/adapters/research-kit/adapter';
import { ResearchCodeSchema, WorkflowRunIdSchema } from '../src/engine/research';
import { windowsCommandLine, type OwnedResult } from '../src/tools/commands';
import { startFakeGitHub, type FakeGitHub } from './fixtures/fake-github';
import { FIXTURE_CLIENT_REF, KIT_SCRIPT, PLAIN_TOKEN, SCENARIOS, TEST_TOKEN, job, runScenario, target } from './fixtures/collector-scenarios';

const goldens = new Map(goldenFile.goldens.map(golden => [golden.name, golden]));
const golden = (name: string) => { const value = goldens.get(name); if (!value) throw new Error(`missing golden ${name}`); return value; };
const exited = (name: string, extra: Partial<OwnedResult> = {}): OwnedResult => ({ status: 'exited', code: golden(name).exitCode, output: golden(name).output, truncated: false, cancelled: false, timedOut: false, ...extra });
const started = (result: OwnedResult): CollectorAttempt => ({ started: true, result });
const script = 'C:\\kit\\research-kit\\bin\\collect-remote.mjs';

// ---------------------------------------------------------------- argv and environment

test('dispatch argv is one --name=value element per value, explicit defaults, no out, run id or token', () => {
  const full: CollectorJob = { topic: 'Topic', clientRef: 'mz-0123456789abcdef0123456789abcdef', inputs: { queries: ['q one', 'q two'], urls: ['https://example.com/a'], preferDomains: ['example.com', 'docs.example.org'], depth: 'normal', maxPages: 5 } };
  expect(dispatchArgs(script, full, target)).toEqual([
    '--max-old-space-size=256', script, '--repository=o/r', '--workflow=collect.yml', '--ref=main', '--runner=ubuntu-latest', '--search-transport=auto',
    '--depth=normal', '--max-pages=5', '--client-ref=mz-0123456789abcdef0123456789abcdef', '--topic=Topic', '--query=q one', '--query=q two',
    '--url=https://example.com/a', '--prefer=example.com,docs.example.org', '--no-wait', '--json',
  ]);
  expect(dispatchArgs(script, job, target).filter(arg => arg.startsWith('--prefer'))).toEqual([]);
  for (const arg of dispatchArgs(script, full, target).slice(2)) expect(arg).toMatch(/^--(no-wait|json|[a-z-]+=.*)$/s);
  expect(dispatchArgs(script, full, target).join(' ')).not.toMatch(/--(out|run-id|token|timeout)/);
});

test('watch argv picks up the recorded run and can never dispatch', () => {
  const args = watchArgs(script, { repository: 'o/r', workflowRunId: '42', clientRef: FIXTURE_CLIENT_REF }, 'C:\\data\\out', 1500);
  expect(args).toEqual(['--max-old-space-size=256', script, '--repository=o/r', '--run-id=42', `--client-ref=${FIXTURE_CLIENT_REF}`, '--out=C:\\data\\out', '--timeout=1500', '--json']);
  expect(args.join(' ')).not.toMatch(/--(topic|no-wait|workflow|query|url)/);
  expect(() => watchArgs(script, { repository: 'o/r', workflowRunId: '1', clientRef: 'x' }, 'C:\\o', 0)).toThrow('COLLECTOR_LIMIT_INVALID');
  expect(watchBounds(10 * 86_400_000)).toEqual({ kitSeconds: 1500, ownedTimeoutMs: 1_800_000 });
  expect(watchBounds(90_500)).toEqual({ kitSeconds: 90, ownedTimeoutMs: 390_000 });
  expect(watchBounds(400)).toEqual({ kitSeconds: 1, ownedTimeoutMs: 301_000 });
});

test('the pinned kit parses every argv element back to exactly the intended flag', async () => {
  const { parseFlags } = await import(pathToFileURL(resolve('.build/research-kit-external/research-kit/lib/core.mjs')).href) as { parseFlags(argv: string[]): { flags: Record<string, unknown>; positional: string[] } };
  const topic = 'a=b "quoted" back\\slash trailing\\ ünïcode 中文 --not-a-flag';
  const odd: CollectorJob = { topic, clientRef: 'mz-0123456789abcdef0123456789abcdef', inputs: { queries: ['a=b', '--query=evil', 'ends with \\'], urls: [], preferDomains: ['example.com'], depth: 'quick', maxPages: 2 } };
  const { flags, positional } = parseFlags(dispatchArgs(script, odd, target).slice(2));
  expect(positional).toEqual([]);
  expect(flags).toEqual({ repository: 'o/r', workflow: 'collect.yml', ref: 'main', runner: 'ubuntu-latest', 'search-transport': 'auto', depth: 'quick', 'max-pages': '2', 'client-ref': 'mz-0123456789abcdef0123456789abcdef', topic, query: ['a=b', '--query=evil', 'ends with \\'], prefer: 'example.com', 'no-wait': true, json: true });
  const watch = parseFlags(watchArgs(script, { repository: 'o/r', workflowRunId: '9', clientRef: 'c' }, 'C:\\a=b\\out', 60).slice(2));
  expect(watch.flags).toEqual({ repository: 'o/r', 'run-id': '9', 'client-ref': 'c', out: 'C:\\a=b\\out', timeout: '60', json: true });
});

test('the collector environment is exactly the validator environment plus the token', () => {
  const poisoned = { SystemRoot: 'C:\\Windows', PATH: '/bin', GITHUB_TOKEN: 'inherited', HTTPS_PROXY: 'http://proxy', https_proxy: 'http://proxy', NODE_OPTIONS: '--require x', NODE_EXTRA_CA_CERTS: 'ca.pem', NODE_TLS_REJECT_UNAUTHORIZED: '0', SSLKEYLOGFILE: 'keys', NODE_USE_ENV_PROXY: '1' };
  const env = collectorEnvironment('C:\\temp', TEST_TOKEN, poisoned);
  expect(env).toEqual({ ...validatorEnvironment('C:\\temp', poisoned), RESEARCH_KIT_GITHUB_TOKEN: TEST_TOKEN });
  expect(Object.keys(env).sort()).toEqual(['HOME', 'RESEARCH_KIT_GITHUB_TOKEN', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE']);
  for (const token of ['', ' padded', 'new\nline', 'tab\t', 'nul\0', 'x'.repeat(16385), 'ünicode']) expect(() => collectorEnvironment('C:\\temp', token)).toThrow('COLLECTOR_TOKEN_INVALID');
});

test('the command line is measured as CreateProcessW receives it; the contract worst case does not fit', () => {
  const node = 'C:\\Program Files\\nodejs\\node.exe';
  const args = dispatchArgs(script, job, target);
  expect(windowsCommandLine(node, args)).toContain('"--topic=Ollama context limits"');
  expect(windowsCommandLine(node, args).length).toBeLessThan(1500);
  expect(commandLineFits(node, args)).toBe(true);
  const url = `https://example.com/${'p'.repeat(2000)}`;
  const worst: CollectorJob = { topic: 't'.repeat(2048), clientRef: 'mz-0123456789abcdef0123456789abcdef', inputs: { queries: Array(16).fill('"'.repeat(512)), urls: Array(25).fill(url), preferDomains: Array(16).fill('d'.repeat(253)), depth: 'normal', maxPages: 25 } };
  expect(windowsCommandLine(node, dispatchArgs(script, worst, target)).length).toBeGreaterThan(COLLECTOR_LIMITS.maxCommandLine);
  expect(commandLineFits(node, dispatchArgs(script, worst, target))).toBe(false);
  expect(packageFileName(FIXTURE_CLIENT_REF)).toBe('research-kit-corpus-v1-moonaliza-fixture.zip');
});

// ---------------------------------------------------------------- table A, over the real kit's output

const DISPATCH: Record<string, ReturnType<typeof classifyDispatch>> = {
  'dispatch-ok': { kind: 'dispatched', workflowRunId: '1' },
  'dispatch-echo-token': { kind: 'dispatched', workflowRunId: '1' },
  'dispatch-echo-plain-token': { kind: 'dispatched', workflowRunId: '1' },
  'dispatch-204': { kind: 'ambiguous', cause: 'KIT_NO_RUN_ID' },
  'dispatch-reset': { kind: 'ambiguous', cause: 'KIT_NETWORK' },
  'dispatch-429': { kind: 'ambiguous', cause: 'KIT_HTTP_429' },
  'dispatch-503': { kind: 'ambiguous', cause: 'KIT_HTTP_503' },
  'dispatch-401': { kind: 'notDispatched', failure: 'COLLECTOR_TOKEN_REJECTED', cause: 'KIT_HTTP_401' },
  'dispatch-403': { kind: 'notDispatched', failure: 'COLLECTOR_FORBIDDEN', cause: 'KIT_FORBIDDEN' },
  'dispatch-404': { kind: 'notDispatched', failure: 'COLLECTOR_NOT_FOUND', cause: 'KIT_NOT_FOUND' },
  'dispatch-422': { kind: 'notDispatched', failure: 'COLLECTOR_REJECTED', cause: 'KIT_HTTP_422' },
  'dispatch-422-echo-token': { kind: 'notDispatched', failure: 'COLLECTOR_REJECTED', cause: 'KIT_HTTP_422' },
  'dispatch-no-token': { kind: 'notDispatched', failure: 'COLLECTOR_TOKEN_MISSING', cause: 'KIT_NO_TOKEN' },
  'dispatch-help': { kind: 'notDispatched', failure: 'COLLECTOR_REFUSED', cause: 'KIT_REFUSED' },
};

test.each(Object.entries(DISPATCH))('table A: %s', (name, expected) => {
  expect(classifyDispatch(started(exited(name)))).toEqual(expected);
});

test('table A: only an attempt that never ran is relaunchable; everything after start is final', () => {
  expect(Object.keys(DISPATCH).sort()).toEqual(goldenFile.goldens.filter(g => g.name.startsWith('dispatch-')).map(g => g.name).sort());
  const ok = exited('dispatch-ok');
  expect(classifyDispatch({ started: false, refusal: 'ADMISSION_REFUSED' })).toEqual({ kind: 'notLaunched', refusal: 'ADMISSION_REFUSED' });
  expect(classifyDispatch({ started: false })).toEqual({ kind: 'notLaunched', refusal: 'LAUNCH_FAILED' });
  expect(classifyDispatch({ started: false, result: { ...ok, status: 'failed', code: null } })).toEqual({ kind: 'notLaunched', refusal: 'LAUNCH_FAILED' });
  expect(classifyDispatch({ started: true, result: { ...ok, status: 'failed', code: null } })).toEqual({ kind: 'ambiguous', cause: 'HELPER_FAILED' });
  expect(classifyDispatch({ started: true })).toEqual({ kind: 'ambiguous', cause: 'HELPER_FAILED' });
  for (const wasStarted of [true, false]) expect(classifyDispatch({ started: wasStarted, result: { ...ok, status: 'unknown', code: null } })).toEqual({ kind: 'ambiguous', cause: 'HELPER_UNKNOWN' });
  expect(classifyDispatch({ started: false, result: ok })).toEqual({ kind: 'ambiguous', cause: 'HELPER_UNKNOWN' });
  // The kit's own success is recorded even when Stop or the bound arrived after it printed.
  expect(classifyDispatch(started({ ...ok, cancelled: true }))).toEqual({ kind: 'dispatched', workflowRunId: '1' });
  expect(classifyDispatch(started({ ...ok, timedOut: true }))).toEqual({ kind: 'dispatched', workflowRunId: '1' });
  expect(classifyDispatch(started({ ...ok, truncated: true }))).toEqual({ kind: 'ambiguous', cause: 'KIT_OUTPUT_LIMIT' });
  expect(classifyDispatch(started({ ...ok, output: '{"workflowRunId":1}' }))).toEqual({ kind: 'ambiguous', cause: 'KIT_OUTPUT_INVALID' });
  expect(classifyDispatch(started({ ...ok, code: 1, output: '', cancelled: true }))).toEqual({ kind: 'ambiguous', cause: 'OWNED_STOPPED' });
  expect(classifyDispatch(started({ ...ok, code: 1, output: '', timedOut: true }))).toEqual({ kind: 'ambiguous', cause: 'OWNED_TIMEOUT' });
  expect(classifyDispatch(started({ ...ok, code: 1, output: 'TypeError: boom' }))).toEqual({ kind: 'ambiguous', cause: 'KIT_EXIT_1' });
  expect(classifyDispatch(started({ ...ok, code: 3, output: '' }))).toEqual({ kind: 'ambiguous', cause: 'KIT_EXIT_3' });
  // A cause is a stored code: a negative exit code must still match ResearchCodeSchema.
  expect(classifyDispatch(started({ ...ok, code: -1073741819, output: '' }))).toEqual({ kind: 'ambiguous', cause: 'KIT_EXIT_NEG1073741819' });
  const watched = classifyWatch(started({ ...exited('watch-collected'), code: -2, output: 'TypeError: boom' }), fresh, 'present');
  expect(watched).toEqual({ kind: 'transient', cause: 'KIT_EXIT_NEG2' });
  expect(ResearchCodeSchema.safeParse(watched.kind === 'transient' && watched.cause).success).toBe(true);
  expect(classifyDispatch(started({ ...ok, code: 3, output: '{"surprise":true}' }))).toEqual({ kind: 'ambiguous', cause: 'KIT_OUTPUT_INVALID' });
  expect(classifyDispatch(started({ ...ok, code: 3, output: '{"code":"WHATEVER","error":"x"}' }))).toEqual({ kind: 'ambiguous', cause: 'KIT_OTHER' });
});

// ---------------------------------------------------------------- table B

const WATCH: Record<string, ReturnType<typeof classifyWatch>> = {
  'watch-collected': { kind: 'package', state: 'REVIEW_IN_PROGRESS' },
  'watch-collected-wrapped': { kind: 'package', state: 'REVIEW_IN_PROGRESS' },
  'watch-collected-redirect': { kind: 'package', state: 'REVIEW_IN_PROGRESS' },
  'watch-legacy-review': { kind: 'package', state: 'REVIEW_REQUIRED' },
  'watch-approved': { kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'KIT_UNEXPECTED_APPROVAL' },
  'watch-failed-collection': { kind: 'runFailed', failure: 'COLLECTION_FAILED', cause: 'KIT_COLLECTION_FAILED' },
  'watch-tampered': { kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'KIT_FILE_SIZE_MISMATCH' },
  'watch-unsupported': { kind: 'runFailed', failure: 'ARTIFACT_INCOMPLETE', cause: 'KIT_INCOMPLETE' },
  'watch-client-ref-mismatch': { kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'KIT_CLIENT_REF_MISMATCH' },
  'watch-run-failure': { kind: 'runFailed', failure: 'RUN_FAILED', cause: 'RUN_FAILURE' },
  'watch-run-cancelled': { kind: 'runFailed', failure: 'RUN_FAILED', cause: 'RUN_CANCELLED' },
  'watch-timeout': { kind: 'stillRunning' },
  'watch-no-artifact': { kind: 'runFailed', failure: 'ARTIFACT_MISSING', cause: 'KIT_NO_ARTIFACT' },
  'watch-expired-410': { kind: 'runFailed', failure: 'ARTIFACT_EXPIRED', cause: 'KIT_EXPIRED' },
  'watch-run-401': { kind: 'park', reason: 'credentials', cause: 'KIT_HTTP_401' },
  'watch-run-404': { kind: 'park', reason: 'credentials', cause: 'KIT_HTTP_404' },
  'watch-artifacts-403': { kind: 'park', reason: 'credentials', cause: 'KIT_HTTP_403' },
  'watch-run-503': { kind: 'transient', cause: 'KIT_HTTP_503' },
  'watch-no-token': { kind: 'park', reason: 'credentials', cause: 'KIT_NO_TOKEN' },
};
const fresh = { clientRef: FIXTURE_CLIENT_REF, pastRetention: false };

test.each(Object.entries(WATCH))('table B: %s', (name, expected) => {
  expect(classifyWatch(started(exited(name)), fresh, 'present')).toEqual(expected);
});

test('table B: retention, package checks, mismatched exits and helper failures', () => {
  expect(Object.keys(WATCH).sort()).toEqual(goldenFile.goldens.filter(g => g.name.startsWith('watch-')).map(g => g.name).sort());
  // Since 2026-09-24 GitHub no longer lists an expired artifact: past retention, NO_ARTIFACT means expired.
  expect(classifyWatch(started(exited('watch-no-artifact')), { ...fresh, pastRetention: true }, 'absent')).toEqual({ kind: 'runFailed', failure: 'ARTIFACT_EXPIRED', cause: 'KIT_NO_ARTIFACT' });
  for (const pkg of ['absent', 'unexpected'] as const) expect(classifyWatch(started(exited('watch-collected')), fresh, pkg)).toEqual({ kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'PACKAGE_NAME_UNEXPECTED' });
  expect(classifyWatch(started(exited('watch-collected')), { ...fresh, clientRef: 'mz-other' }, 'present')).toEqual({ kind: 'runFailed', failure: 'ARTIFACT_INVALID', cause: 'IDENTITY_MISMATCH' });
  // No fixture produces BLOCKED; collect-remote maps it to exit 2 like INCOMPLETE. Derived from the real INCOMPLETE line.
  const blocked = golden('watch-unsupported').output.replace('"status":"INCOMPLETE"', '"status":"BLOCKED"');
  expect(classifyWatch(started({ ...exited('watch-unsupported'), output: blocked }), fresh, 'present')).toEqual({ kind: 'runFailed', failure: 'ARTIFACT_INCOMPLETE', cause: 'KIT_BLOCKED' });
  expect(classifyWatch(started({ ...exited('watch-collected'), code: 1 }), fresh, 'present')).toEqual({ kind: 'transient', cause: 'KIT_OUTPUT_INVALID' });
  expect(classifyWatch(started({ ...exited('watch-tampered'), code: 0 }), fresh, 'present')).toEqual({ kind: 'transient', cause: 'KIT_OUTPUT_INVALID' });
  expect(classifyWatch(started({ ...exited('watch-collected'), code: 1, output: 'TypeError: boom' }), fresh, 'present')).toEqual({ kind: 'transient', cause: 'KIT_EXIT_1' });
  expect(classifyWatch(started({ ...exited('watch-collected'), truncated: true }), fresh, 'present')).toEqual({ kind: 'transient', cause: 'KIT_OUTPUT_LIMIT' });
  expect(classifyWatch(started({ ...exited('watch-collected'), timedOut: true }), fresh, 'present')).toEqual({ kind: 'transient', cause: 'OWNED_TIMEOUT' });
  expect(classifyWatch(started({ ...exited('watch-collected'), status: 'unknown', code: null }), fresh, 'present')).toEqual({ kind: 'transient', cause: 'HELPER_UNKNOWN' });
  expect(classifyWatch({ started: false, refusal: 'INSTALLATION_INVALID' }, fresh, 'absent')).toEqual({ kind: 'notLaunched', refusal: 'INSTALLATION_INVALID' });
  expect(classifyWatch(started({ ...exited('watch-collected'), code: 3, output: 'refused' }), fresh, 'absent')).toEqual({ kind: 'park', reason: 'kit', cause: 'KIT_REFUSED' });
  expect(classifyWatch(started({ ...exited('watch-timeout'), code: 2 }), fresh, 'absent')).toEqual({ kind: 'transient', cause: 'KIT_TIMEOUT' });
});

test('no classifier result carries kit text: tokens echoed by the server never leave the parser', () => {
  const results = [
    ...goldenFile.goldens.filter(g => g.name.startsWith('dispatch-')).map(g => classifyDispatch(started(exited(g.name)))),
    ...goldenFile.goldens.filter(g => g.name.startsWith('watch-')).map(g => classifyWatch(started(exited(g.name)), fresh, 'present')),
  ];
  expect(golden('dispatch-echo-token').output).toContain(TEST_TOKEN);
  expect(golden('dispatch-echo-plain-token').output).toContain(PLAIN_TOKEN);
  expect(golden('dispatch-422-echo-token').output).toContain(TEST_TOKEN);
  const serialized = JSON.stringify([...results, ...goldenFile.goldens.map(g => parseKitLine(g.output))]);
  expect(serialized).not.toContain(TEST_TOKEN); expect(serialized).not.toContain(PLAIN_TOKEN);
  // Every string a classifier returns is a run id, a research code, or a member of a closed vocabulary.
  const closed: Record<string, readonly string[]> = { kind: ['notLaunched', 'dispatched', 'notDispatched', 'ambiguous', 'package', 'runFailed', 'stillRunning', 'transient', 'park'], reason: ['kit', 'credentials'], state: ['REVIEW_REQUIRED', 'REVIEW_IN_PROGRESS', 'PREFLIGHT_BLOCKED'] };
  for (const result of results) for (const [key, value] of Object.entries(result)) {
    expect(typeof value).toBe('string');
    if (key === 'workflowRunId') expect(WorkflowRunIdSchema.safeParse(value).success).toBe(true);
    else if (closed[key]) expect(closed[key]).toContain(value);
    else { expect(['failure', 'cause']).toContain(key); expect(ResearchCodeSchema.safeParse(value).success, `${key}=${value as string}`).toBe(true); }
  }
});

// ---------------------------------------------------------------- the goldens are the pinned kit's real output

let fake: FakeGitHub;
beforeAll(async () => { fake = await startFakeGitHub(TEST_TOKEN); });
afterAll(async () => { await fake?.close(); });

test('golden freshness: the pinned kit reproduces every recorded output byte for byte', async () => {
  expect(goldenFile.kitRevision).toBe((await import('../src/adapters/research-kit/runtime-inventory.json')).revision);
  expect(SCENARIOS.map(s => s.name)).toEqual(goldenFile.goldens.map(g => g.name));
  for (const scenario of SCENARIOS) {
    const { requests: _requests, ...actual } = await runScenario(fake, scenario);
    expect(actual, scenario.name).toEqual(golden(scenario.name));
  }
}, 120_000);

test('the real kit sends one authenticated dispatch, and never the token to the artifact host', async () => {
  const dispatch = await runScenario(fake, SCENARIOS.find(s => s.name === 'dispatch-ok')!);
  expect(dispatch.requests).toHaveLength(1);
  expect(dispatch.requests[0]).toEqual({ host: 'api.github.com', method: 'POST', path: '/repos/o/r/actions/workflows/collect.yml/dispatches', authorization: 'exact', version: '2026-03-10', body: { ref: 'main', inputs: { topic: 'Ollama context limits', max_pages: '3', depth: 'quick', runner: 'ubuntu-latest', search_transport: 'auto', client_ref: FIXTURE_CLIENT_REF, queries: 'ollama num_ctx' }, return_run_details: true } });
  const redirect = await runScenario(fake, SCENARIOS.find(s => s.name === 'watch-collected-redirect')!);
  expect(redirect.requests.filter(r => r.method === 'POST')).toEqual([]);
  expect(redirect.requests.filter(r => r.host.startsWith('artifacts.invalid'))).toEqual([expect.objectContaining({ authorization: 'none' })]);
  expect(redirect.requests.filter(r => r.host === 'api.github.com').every(r => r.authorization === 'exact')).toBe(true);
  const missing = await runScenario(fake, SCENARIOS.find(s => s.name === 'dispatch-no-token')!);
  expect(missing.requests).toEqual([]);
}, 60_000);

test('TLS is really checked: an untrusted CA reaches the proxy but never the API', async () => {
  fake.reset(); fake.set({});
  const { spawn } = await import('node:child_process');
  const { mkdtemp, rm } = await import('node:fs/promises'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const temp = await mkdtemp(join(tmpdir(), 'monnzila-collector-'));
  try {
    const output = await new Promise<{ code: number | null; text: string }>((done, fail) => {
      const child = spawn(process.execPath, dispatchArgs(KIT_SCRIPT, job, target), { cwd: temp, env: { ...collectorEnvironment(temp, TEST_TOKEN), HTTPS_PROXY: fake.proxyUrl }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let text = ''; child.stdout.on('data', (chunk: Buffer) => { text += chunk; }); child.stderr.on('data', (chunk: Buffer) => { text += chunk; });
      child.once('error', fail); child.once('exit', code => done({ code, text }));
    });
    expect(classifyDispatch(started({ status: 'exited', code: output.code, output: output.text, truncated: false, cancelled: false, timedOut: false }))).toEqual({ kind: 'ambiguous', cause: 'KIT_NETWORK' });
    expect(fake.connects).toContain('api.github.com:443');
    expect(fake.seen).toEqual([]);
  } finally { await rm(temp, { recursive: true, force: true }); }
}, 60_000);
