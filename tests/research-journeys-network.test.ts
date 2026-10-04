import { afterEach, expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { PassThrough } from 'node:stream';
import { spawnOwned } from '../src/tools/commands';
import { packageImporter } from '../src/main/research-import';
import type { PackageHandoff } from '../src/main/collector';
import { FAKE_HEAD_SHA, FAKE_REPOSITORY, startFakeGitHub } from './fixtures/fake-github';

// The e2e harness (e2e/fixtures/collector-network.cjs) rewrites the native helper's input. These run it against the
// real spawnOwned encoder, with the helper replaced by a recording child, so a change to the protocol turns this red
// on any OS instead of only in a Windows desktop run.
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process') as { spawn: (...args: unknown[]) => unknown };
type Outcome = { code: number | null; status: string | null; clientRef: string | null; state: string | null };
const { install } = require('../e2e/fixtures/collector-network.cjs') as { install(module: unknown, network: unknown, scope?: { fetch?: unknown }): { collectors: number; rewritten: number; outcomes: Outcome[]; refusedFetches: string[] } };
const original = childProcess.spawn; const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const network = { HTTPS_PROXY: 'http://127.0.0.1:43123', NODE_EXTRA_CA_CERTS: '/fixtures/ca.pem' };
const helperPath = '/helper/MoonAlizaHost.exe';
const originalFetch = globalThis.fetch;
afterEach(() => { childProcess.spawn = original; syncBuiltinESMExports(); Object.defineProperty(process, 'platform', platform); globalThis.fetch = originalFetch; });

type Child = EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough };
/** A stand-in helper: records its input, prints `output` as the child's stdout, and exits with `code`. */
function recordingHelper(writes: Buffer[], children: Child[] = [], output = '', code = 0) {
  return (_command: unknown, _args: unknown) => {
    const child: Child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
    children.push(child);
    child.stdin.on('data', (chunk: Buffer) => {
      writes.push(chunk);
      setImmediate(() => {
        if (output) child.stdout.write(output);
        child.stderr.write(`{"status":"exited","code":${code},"cancelled":false,"timedOut":false}\n`);
        setImmediate(() => child.emit('close'));
      });
    });
    return child;
  };
}
function decode(protocol: Buffer) {
  const fields: string[] = []; let offset = 4;
  for (let index = 0; index < 4; index++) { const end = offset + 4 + protocol.readUInt32LE(offset); fields.push(protocol.subarray(offset + 4, end).toString('utf16le')); offset = end; }
  return { fields, environment: fields[3]!.split('\0').filter(Boolean), tail: protocol.subarray(offset) };
}
async function run(script: string, writes: Buffer[], output = '', code = 0) {
  childProcess.spawn = recordingHelper(writes, [], output, code);
  const state = install(childProcess, network); syncBuiltinESMExports();
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  const result = await spawnOwned({ executable: '/kit/node.exe', args: ['--max-old-space-size=256', script, '--json'], cwd: '/work', env: { TEMP: '/t', RESEARCH_KIT_GITHUB_TOKEN: 'test-token', HOME: '/t', TMP: '/t' }, timeoutMs: 1000, maxOutputBytes: 64 }, undefined, { helperPath });
  expect(result.status).toBe('exited');
  return state;
}

test('a collect-remote.mjs launch gains exactly the loopback proxy and the test CA, in spawnOwned order', async () => {
  const writes: Buffer[] = []; const state = await run('/kit/bin/collect-remote.mjs', writes);
  expect(state).toEqual({ collectors: 1, rewritten: 1, outcomes: [{ code: 0, status: null, clientRef: null, state: null }], refusedFetches: [] });
  const { fields, environment, tail } = decode(writes[0]!);
  expect(fields.slice(0, 3)).toEqual(['/kit/node.exe', '/kit/node.exe --max-old-space-size=256 /kit/bin/collect-remote.mjs --json', '/work']);
  expect(environment).toEqual(['HOME=/t', `HTTPS_PROXY=${network.HTTPS_PROXY}`, `NODE_EXTRA_CA_CERTS=${network.NODE_EXTRA_CA_CERTS}`, 'RESEARCH_KIT_GITHUB_TOKEN=test-token', 'TEMP=/t', 'TMP=/t']);
  expect(tail.length).toBe(0);
});

test('every other helper launch and the guard list pass byte for byte', async () => {
  const writes: Buffer[] = []; const state = await run('/kit/bin/artifact.mjs', writes);
  expect(state).toEqual({ collectors: 0, rewritten: 0, outcomes: [], refusedFetches: [] });
  expect(decode(writes[0]!).environment).toEqual(['HOME=/t', 'RESEARCH_KIT_GITHUB_TOKEN=test-token', 'TEMP=/t', 'TMP=/t']);
  // spawnOwned cannot encode a guard list off Windows (drive-letter paths), so the guarded form is the encoded
  // collector protocol plus a guard list, written to the wrapped helper directly.
  const plain: Buffer[] = []; childProcess.spawn = recordingHelper(plain); syncBuiltinESMExports();
  await spawnOwned({ executable: '/kit/node.exe', args: ['/kit/bin/collect-remote.mjs'], cwd: '/work', env: { TEMP: '/t' }, timeoutMs: 1000, maxOutputBytes: 64 }, undefined, { helperPath });
  const guards = Buffer.concat([Buffer.from([1, 0, 0, 0, 6, 0, 0, 0]), Buffer.from('C:\\', 'utf16le')]);
  const seen: Buffer[] = []; childProcess.spawn = recordingHelper(seen); install(childProcess, network);
  const child = childProcess.spawn(helperPath, ['--guarded']) as { stdin: PassThrough };
  child.stdin.write(Buffer.concat([plain[0]!, guards]));
  await new Promise(resolve => setImmediate(resolve));
  const { environment, tail } = decode(seen[0]!);
  expect(tail).toEqual(guards);
  expect(environment).toEqual(['HTTPS_PROXY=http://127.0.0.1:43123', 'NODE_EXTRA_CA_CERTS=/fixtures/ca.pem', 'TEMP=/t']);
});

test('the harness refuses a non-loopback proxy, extra keys, and an environment that already routes the collector', async () => {
  expect(() => install({ spawn: original }, { ...network, HTTPS_PROXY: 'http://10.0.0.1:8080' })).toThrow('E2E_NETWORK_INVALID');
  expect(() => install({ spawn: original }, { ...network, NODE_OPTIONS: '--inspect' })).toThrow('E2E_NETWORK_INVALID');
  expect(() => install({ spawn: original }, { ...network, NODE_EXTRA_CA_CERTS: 'ca.pem' })).toThrow('E2E_NETWORK_INVALID');
  // Names compare case-insensitively, as Windows environment names do: a lowercase https_proxy is the same regression.
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'Node_Extra_CA_Certs']) {
    const writes: Buffer[] = []; const children: Child[] = []; childProcess.spawn = recordingHelper(writes, children); const state = install(childProcess, network); syncBuiltinESMExports();
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    await expect(spawnOwned({ executable: '/kit/node.exe', args: ['/kit/bin/collect-remote.mjs'], cwd: '/work', env: { [name]: 'http://127.0.0.1:1' }, timeoutMs: 1000, maxOutputBytes: 64 }, undefined, { helperPath }), name).rejects.toThrow('E2E_NETWORK_ALREADY_SET');
    // Nothing reached the helper, and its input is ended, so it launches nothing.
    expect(writes).toEqual([]); expect(children).toHaveLength(1); expect(children[0]!.stdin.writableEnded, name).toBe(true);
    expect(state.rewritten).toBe(0);
  }
});

test('a collector launch records its exit and only the status, client ref and state of the kit report', async () => {
  const report = JSON.stringify({ status: 'PASS', clientRef: 'mz-abc', state: 'REVIEW_REQUIRED', buildAuthorized: false, errors: [], file: '/out/x.zip' });
  const state = await run('/kit/bin/collect-remote.mjs', [], `progress\n${report}\n`, 0);
  expect(state.outcomes).toEqual([{ code: 0, status: 'PASS', clientRef: 'mz-abc', state: 'REVIEW_REQUIRED' }]);
  // A park the supervisor would not treat as a package (exit 3, no report) is told apart from it.
  const parked = await run('/kit/bin/collect-remote.mjs', [], '{"error":"refused","code":"KIT"}\n', 3);
  expect(parked.outcomes).toEqual([{ code: 3, status: null, clientRef: null, state: null }]);
});

test('main\'s own fetch reaches only loopback: a GitHub request is refused before it is sent, and only its host is recorded', async () => {
  const sent: string[] = [];
  const scope = { fetch: async (resource: string | URL | Request) => { sent.push(String(resource)); return new Response('{}'); } };
  const harness = install(childProcess, network, scope);
  const github = (scope.fetch as (r: string, i?: RequestInit) => Promise<Response>)('https://api.github.com/repos/o/r/actions/runs/1', { headers: { Authorization: 'Bearer github_pat_secret-0123' } });
  await expect(github).rejects.toThrow('E2E_NETWORK_REFUSED');
  await expect((scope.fetch as (r: URL) => Promise<Response>)(new URL('https://example.com/x'))).rejects.toThrow('E2E_NETWORK_REFUSED');
  await expect((scope.fetch as (r: string) => Promise<Response>)('not a url')).rejects.toThrow('E2E_NETWORK_REFUSED');
  expect(sent).toEqual([]);
  const local = await (scope.fetch as (r: string) => Promise<Response>)('http://127.0.0.1:43123/repos/o/r/actions/runs/1');
  expect(local.status).toBe(200); expect(sent).toEqual(['http://127.0.0.1:43123/repos/o/r/actions/runs/1']);
  expect(harness.refusedFetches).toEqual(['api.github.com', 'example.com', 'unparseable']);
  expect(JSON.stringify(harness)).not.toContain('github_pat');
});

// The opt-in run-read route (docs/specification/research-journeys.md): the journey that ends `collected` needs the
// verified import's GitHub run read answered, and only by the loopback fake, through its proxy, trusting only the test CA.
const RUN_URL = `https://api.github.com/repos/${FAKE_REPOSITORY}/actions/runs/1`;
const ROUTE_TOKEN = 'github_pat_route-only-0123456789abcdef';
type Fetch = (resource: string | URL, init?: RequestInit) => Promise<Response>;
async function routed(routeRunRead: unknown) {
  const fake = await startFakeGitHub(ROUTE_TOKEN);
  const sent: string[] = [];
  const scope: { fetch: Fetch } = { fetch: async resource => { sent.push(String(resource)); return new Response('{}'); } };
  const harness = install({ spawn: original }, { HTTPS_PROXY: fake.proxyUrl, NODE_EXTRA_CA_CERTS: fake.caPath, ...(routeRunRead === undefined ? {} : { routeRunRead }) }, scope);
  return { fake, sent, scope, harness };
}
const auth = { Authorization: `Bearer ${ROUTE_TOKEN}`, Accept: 'application/vnd.github+json' };

test('with the opt-in, main\'s run read is answered by the loopback fake through its proxy, with every field the importer verifies', async () => {
  const { fake, sent, scope, harness } = await routed(true);
  try {
    const response = await scope.fetch(RUN_URL, { method: 'GET', headers: auth });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 1, run_attempt: 1, head_sha: FAKE_HEAD_SHA, head_branch: 'main', path: '.github/workflows/collect.yml', event: 'workflow_dispatch', status: 'completed', repository: { full_name: FAKE_REPOSITORY } });
    expect(fake.connects).toEqual(['api.github.com:443']);
    expect(fake.seen).toEqual([expect.objectContaining({ host: 'api.github.com', method: 'GET', path: `/repos/${FAKE_REPOSITORY}/actions/runs/1`, authorization: 'exact' })]);
    expect(sent).toEqual([]); expect(harness.refusedFetches).toEqual([]);
  } finally { await fake.close(); }
});

test('without the opt-in the run read is still refused, and the opt-in routes nothing but a GET of one run', async () => {
  const off = await routed(undefined);
  try {
    await expect(off.scope.fetch(RUN_URL, { headers: auth })).rejects.toThrow('E2E_NETWORK_REFUSED');
    expect(off.fake.seen).toEqual([]); expect(off.harness.refusedFetches).toEqual(['api.github.com']);
  } finally { await off.fake.close(); }
  const on = await routed(true);
  try {
    for (const [resource, init] of [[RUN_URL, { method: 'POST', headers: auth }], [`${RUN_URL}/artifacts`, { headers: auth }], [`${RUN_URL}?x=1`, { headers: auth }],
      ['https://api.github.com:8443/repos/o/r/actions/runs/1', { headers: auth }], ['http://api.github.com/repos/o/r/actions/runs/1', { headers: auth }], ['https://example.com/repos/o/r/actions/runs/1', { headers: auth }]] as const) {
      await expect(on.scope.fetch(resource, init), resource).rejects.toThrow('E2E_NETWORK_REFUSED');
    }
    expect(on.fake.seen).toEqual([]); expect(on.fake.connects).toEqual([]); expect(on.sent).toEqual([]);
    expect(on.harness.refusedFetches).toHaveLength(6);
  } finally { await on.fake.close(); }
  for (const value of [false, 'yes', 1]) expect(() => install({ spawn: original }, { ...network, routeRunRead: value }), String(value)).toThrow('E2E_NETWORK_INVALID');
});

test('the verified import accepts the routed run read and binds the package to its commit, ref and attempt', async () => {
  const { fake, scope } = await routed(true);
  try {
    const bindings: unknown[] = [];
    const importer = packageImporter({
      epoch: () => 'epoch', fetch: scope.fetch,
      vault: { grant: () => 'grant', withSecret: async (_grant: string, _binding: unknown, operation: (secret: string) => unknown) => operation(ROUTE_TOKEN), revokeContext: () => {} } as never,
      settings: { current: () => ({ revision: 1, repository: FAKE_REPOSITORY, workflow: 'collect.yml', ref: 'main', secretRef: 'secret-ref' }) },
      // FAIL after the run checks: only a run read that passed every identity check reaches the validator.
      kit: { validate: async (_file, binding) => { bindings.push(binding); return { status: 'FAIL' } as never; } },
    });
    const handoff = { researchId: 'r1', projectId: 'p1', expectedRevision: 3, projectRevision: 1, clientRef: 'mz-abc', target: { repository: FAKE_REPOSITORY, workflow: 'collect.yml', ref: 'main' }, workflowRunId: '1', file: '/spool/x.zip', kit: { status: 'PASS', state: 'REVIEW_REQUIRED' }, signal: new AbortController().signal } as PackageHandoff;
    expect(await importer(handoff)).toEqual({ kind: 'rejected', failure: 'ARTIFACT_INVALID', cause: 'IMPORT_FAIL' });
    expect(bindings).toEqual([expect.objectContaining({ repository: FAKE_REPOSITORY, ref: 'main', commit: FAKE_HEAD_SHA, workflow: 'collect.yml', workflowRunId: 1, runAttempt: 1 })]);
  } finally { await fake.close(); }
});
