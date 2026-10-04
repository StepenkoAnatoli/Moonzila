// Test-only. The scenarios the real pinned collector is run through against the fake GitHub, shared by the
// maintainer capture script (scripts/capture-collector-golden.ts) and the golden freshness test, so the
// recorded outputs the classifier tests read can never drift from what the pinned kit actually prints.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { collectorEnvironment, dispatchArgs, watchArgs, type CollectorJob, type CollectorTarget } from '../../src/adapters/research-kit/collector';
import { validatorEnvironment } from '../../src/adapters/research-kit/adapter';
import { FAKE_REPOSITORY, type FakeGitHub, type FakeScenario } from './fake-github';
import { zipFixture } from './zip';

/** Test-only tokens. Neither has the shape of a real GitHub token, so a secret scanner has nothing to match. */
export const TEST_TOKEN = 'github_pat_test-only-0123456789abcdefghijklmnopqrstuvwxyz';
export const PLAIN_TOKEN = 'plain-test-token-ab12cd34ef56gh78';
export const KIT_SCRIPT = resolve('.build/research-kit-external/research-kit/bin/collect-remote.mjs');
export const GOLDEN_FILE = resolve('tests/fixtures/research-kit/collector-golden/goldens.json');
export const FIXTURE_CLIENT_REF = 'moonaliza-fixture';
export const target: CollectorTarget = { collectorRevision: 1, repository: FAKE_REPOSITORY, workflow: 'collect.yml', ref: 'main' };
export const job: CollectorJob = { topic: 'Ollama context limits', clientRef: FIXTURE_CLIENT_REF, inputs: { queries: ['ollama num_ctx'], urls: [], preferDomains: [], depth: 'quick', maxPages: 3 } };

export interface CollectorScenario {
  name: string; kind: 'dispatch' | 'watch'; fake: FakeScenario;
  /** null runs without any token variable. */
  token?: string | null;
  /** A fixture package served as the artifact; `wrapped` puts it inside GitHub's outer ZIP. */
  zip?: string; wrapped?: boolean;
  clientRef?: string; kitSeconds?: number; extraArgs?: string[];
}
export interface Golden { name: string; exitCode: number | null; output: string }

const packageBytes = async (name: string, wrapped = false) => {
  const bytes = await readFile(resolve('tests/fixtures/research-kit', `${name}.zip`));
  return wrapped ? zipFixture([{ name: `research-kit-corpus-v1-${FIXTURE_CLIENT_REF}.zip`, content: bytes }]) : bytes;
};

export const SCENARIOS: CollectorScenario[] = [
  { name: 'dispatch-ok', kind: 'dispatch', fake: {} },
  { name: 'dispatch-204', kind: 'dispatch', fake: { dispatch: 204 } },
  { name: 'dispatch-reset', kind: 'dispatch', fake: { dispatch: 'reset' } },
  { name: 'dispatch-401', kind: 'dispatch', fake: { dispatch: 401 } },
  { name: 'dispatch-403', kind: 'dispatch', fake: { dispatch: 403 } },
  { name: 'dispatch-404', kind: 'dispatch', fake: { dispatch: 404 } },
  { name: 'dispatch-422', kind: 'dispatch', fake: { dispatch: 422 } },
  { name: 'dispatch-429', kind: 'dispatch', fake: { dispatch: 429 } },
  { name: 'dispatch-503', kind: 'dispatch', fake: { dispatch: 503 } },
  { name: 'dispatch-no-token', kind: 'dispatch', fake: {}, token: null },
  { name: 'dispatch-help', kind: 'dispatch', fake: {}, extraArgs: ['--bogus'] },
  { name: 'dispatch-echo-token', kind: 'dispatch', fake: { htmlUrl: `https://github.com/o/r/actions/runs/1?t=${TEST_TOKEN}` } },
  { name: 'dispatch-echo-plain-token', kind: 'dispatch', fake: { htmlUrl: `https://github.com/o/r/actions/runs/1?t=${PLAIN_TOKEN}` }, token: PLAIN_TOKEN },
  { name: 'dispatch-422-echo-token', kind: 'dispatch', fake: { dispatch: 422, dispatchBody: { message: `bad input near ${TEST_TOKEN}` } } },
  { name: 'watch-collected', kind: 'watch', fake: {}, zip: 'collected' },
  { name: 'watch-collected-wrapped', kind: 'watch', fake: {}, zip: 'collected', wrapped: true },
  { name: 'watch-collected-redirect', kind: 'watch', fake: { download: 'redirect' }, zip: 'collected' },
  { name: 'watch-legacy-review', kind: 'watch', fake: {}, zip: 'legacy-review' },
  { name: 'watch-approved', kind: 'watch', fake: {}, zip: 'approved' },
  { name: 'watch-failed-collection', kind: 'watch', fake: {}, zip: 'failed' },
  { name: 'watch-tampered', kind: 'watch', fake: {}, zip: 'tampered' },
  { name: 'watch-unsupported', kind: 'watch', fake: {}, zip: 'unsupported' },
  { name: 'watch-client-ref-mismatch', kind: 'watch', fake: {}, zip: 'collected', clientRef: 'mz-0123456789abcdef0123456789abcdef' },
  { name: 'watch-run-failure', kind: 'watch', fake: { conclusion: 'failure' } },
  { name: 'watch-run-cancelled', kind: 'watch', fake: { conclusion: 'cancelled' } },
  { name: 'watch-timeout', kind: 'watch', fake: { runStatus: 'in_progress', conclusion: null, holdRunMs: 1500 }, kitSeconds: 1 },
  { name: 'watch-no-artifact', kind: 'watch', fake: { artifacts: [] } },
  { name: 'watch-expired-410', kind: 'watch', fake: { download: 410 }, zip: 'collected' },
  { name: 'watch-run-401', kind: 'watch', fake: { runHttp: 401 } },
  { name: 'watch-run-404', kind: 'watch', fake: { runHttp: 404 } },
  { name: 'watch-run-503', kind: 'watch', fake: { runHttp: 503, holdRunMs: 1500 }, kitSeconds: 1 },
  { name: 'watch-artifacts-403', kind: 'watch', fake: { artifactsHttp: 403 } },
  { name: 'watch-no-token', kind: 'watch', fake: {}, token: null },
];

/**
 * Runs the real pinned collect-remote.mjs once. stdout and stderr go to one O_APPEND file in write order, as the
 * native helper merges them (host.cpp). The proxy and CA variables are the only test additions to the production env.
 */
export async function runScenario(fake: FakeGitHub, scenario: CollectorScenario): Promise<Golden & { requests: FakeGitHub['seen'] }> {
  const temp = await mkdtemp(join(tmpdir(), 'moonaliza-collector-'));
  try {
    const out = join(temp, 'out'); await mkdir(out);
    fake.reset(); fake.set({ ...scenario.fake, ...(scenario.zip ? { zip: await packageBytes(scenario.zip, scenario.wrapped) } : {}) });
    const token = scenario.token === undefined ? TEST_TOKEN : scenario.token;
    const env = { ...(token === null ? validatorEnvironment(temp) : collectorEnvironment(temp, token)), HTTPS_PROXY: fake.proxyUrl, NODE_EXTRA_CA_CERTS: fake.caPath };
    const args = scenario.kind === 'dispatch'
      ? dispatchArgs(KIT_SCRIPT, job, target)
      : watchArgs(KIT_SCRIPT, { repository: target.repository, workflowRunId: '1', clientRef: scenario.clientRef ?? FIXTURE_CLIENT_REF }, out, scenario.kitSeconds ?? 60);
    if (scenario.extraArgs) args.splice(args.length - 1, 0, ...scenario.extraArgs);
    const file = join(temp, 'output'); const handle = await open(file, 'a');
    let exitCode: number | null;
    try {
      exitCode = await new Promise<number | null>((done, fail) => {
        const child = spawn(process.execPath, args, { cwd: temp, env, stdio: ['ignore', handle.fd, handle.fd], windowsHide: true });
        child.once('error', fail); child.once('exit', code => done(code));
      });
    } finally { await handle.close(); }
    // Paths appear raw in text and JSON-escaped in the payload; both become placeholders with '/' separators.
    let output = await readFile(file, 'utf8');
    for (const [path, name] of [[out, '<out>'], [temp, '<temp>']] as const) output = output.replaceAll(JSON.stringify(path).slice(1, -1), name).replaceAll(path, name);
    output = output.replaceAll('<out>\\\\', '<out>/').replaceAll('<out>\\', '<out>/');
    return { name: scenario.name, exitCode, output, requests: [...fake.seen] };
  } finally { await rm(temp, { recursive: true, force: true }); }
}
