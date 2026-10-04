import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FAKE_REPOSITORY, TEST_CA, startFakeGitHub, type FakeGitHub } from '../tests/fixtures/fake-github';

// Plan Task 7's research journeys: the real app, the real pinned kit and the native helper, against the loopback fake
// GitHub. The app gives a collector child no proxy or CA variable, so e2e/fixtures/collector-network.cjs is loaded
// into main with Electron's -r and adds them to the collector's environment on its way into the helper. Nothing in
// the product reads it. See docs/specification/research-journeys.md.
// Not a real credential: shaped like one, so a leak into any file under the data folder is found by a byte scan.
const TOKEN = 'github_pat_e2e-only-journeys-0123456789abcdef';
const KIT_ROOT = resolve('.build/research-kit-external/research-kit');
const PRELOAD = resolve('e2e/fixtures/collector-network.cjs');
const DISPATCH = `/repos/${FAKE_REPOSITORY}/actions/workflows/collect.yml/dispatches`;
const RUN = `/repos/${FAKE_REPOSITORY}/actions/runs/1`;
type Bridge = { moonaliza: { invoke(method: string, params?: unknown): Promise<unknown> } };
type Job = { id: string; status: string; clientRef: string; workflowRunId?: string; failure?: string };
const invoke = <T>(page: Page, method: string, params?: unknown) => page.evaluate(([m, p]) => (window as unknown as Bridge).moonaliza.invoke(m as string, p), [method, params] as const) as Promise<T>;
// Electron's -r is handled by its default_app, which a packaged executable does not run (and Playwright adds its own
// -r loader only without an executablePath). Against MOONALIZA_TEST_EXECUTABLE the harness cannot load, and the
// collector would reach the real api.github.com, so this file runs only against the unpackaged app.
test.skip(Boolean(process.env.MOONALIZA_TEST_EXECUTABLE), 'The -r harness cannot load into a packaged executable');
// Linux only, for a local run (as root Electron needs --no-sandbox): never committed as unconditional arguments.
const localArgs = process.platform === 'linux' ? (process.env.MOONALIZA_E2E_ELECTRON_ARGS ?? '').split(' ').filter(Boolean) : [];

async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(path)); else if (entry.isFile()) found.push(path);
  }
  return found;
}

/** One isolated app: its own data folder, project folder, fake GitHub and a pinned-kit installation. */
async function journey(name: string) {
  const root = await mkdtemp(join(tmpdir(), `monnzila-${name}-`));
  const data = join(root, 'data'); const project = join(root, 'Research project');
  await mkdir(join(data, 'research-kit'), { recursive: true }); await mkdir(project);
  const nodeSha256 = createHash('sha256').update(await readFile(process.execPath)).digest('hex');
  await writeFile(join(data, 'research-kit', 'installation.json'), JSON.stringify({ kitRoot: KIT_ROOT, nodePath: process.execPath, nodeSha256 }));
  const fake = await startFakeGitHub(TOKEN);
  // The run stays in progress until a journey says otherwise, so every watch is mid-collection.
  fake.set({ runStatus: 'in_progress', conclusion: null });
  // Fails closed: an app without the harness is killed before a journey saves the token or starts a job. A restart
  // uses the same command line its first launch proved.
  const launch = async () => {
    const app = await electron.launch({
      args: [...localArgs, '-r', PRELOAD, resolve('.'), `--user-data-dir=${data}`],
      env: { ...process.env, MOONALIZA_E2E_COLLECTOR_NETWORK: JSON.stringify({ HTTPS_PROXY: fake.proxyUrl, NODE_EXTRA_CA_CERTS: TEST_CA }) },
    });
    if (await network(app) === null) {
      const main = app.process(); const exited = new Promise(done => main.once('exit', done));
      main.kill(); await exited;
      throw new Error('E2E_HARNESS_MISSING: the collector network preload did not load');
    }
    return app;
  };
  return { root, data, project, fake, launch };
}

/** Opens a trusted project, allows public research and saves the collector: everything a start needs. */
async function prepare(app: ElectronApplication, page: Page, project: string) {
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
  await page.getByRole('button', { name: 'Open project' }).click();
  await page.getByRole('button', { name: 'Trust and open' }).click();
  await expect(page.getByRole('heading', { name: 'Research project' })).toBeVisible();
  const { projects } = await invoke<{ projects: { id: string; policy: { revision: number; inference: string } }[] }>(page, 'project.list');
  const opened = projects[0]!;
  await invoke(page, 'project.policy.update', { projectId: opened.id, expectedRevision: opened.policy.revision, policy: { inference: opened.policy.inference, research: 'public-technical' } });
  await invoke(page, 'research.collector.save', { repository: FAKE_REPOSITORY, workflow: 'collect.yml', ref: 'main', token: TOKEN });
  const { research } = await invoke<{ research: Job }>(page, 'research.start', { projectId: opened.id, topic: 'Ollama context limits', queries: ['ollama num_ctx'], depth: 'quick', maxPages: 3, acknowledgedPublic: true });
  return research;
}
const read = async (page: Page, id: string) => (await invoke<{ research: Job }>(page, 'research.read', { researchId: id })).research;
const count = (fake: FakeGitHub, method: string, path: string) => fake.seen.filter(request => request.method === method && request.path === path).length;
type Outcome = { code: number | null; status: string | null; clientRef: string | null; state: string | null };
type Harness = { collectors: number; rewritten: number; outcomes: Outcome[]; refusedFetches: string[] };
const network = (app: ElectronApplication) => app.evaluate(() => (globalThis as { __monnzilaE2eCollectorNetwork?: Harness }).__monnzilaE2eCollectorNetwork ?? null);

test('The harness is loaded into main before the app, and the product never sees its variable', async () => {
  const { root, fake, launch } = await journey('journey-harness');
  let app: ElectronApplication | undefined;
  try {
    app = await launch(); const page = await app.firstWindow();
    await expect(page.getByText('Your work starts here')).toBeVisible();
    expect(await network(app)).toEqual({ collectors: 0, rewritten: 0, outcomes: [], refusedFetches: [] });
    expect(await app.evaluate(() => process.env.MOONALIZA_E2E_COLLECTOR_NETWORK ?? null)).toBeNull();
  } finally { await app?.close(); await fake.close(); await rm(root, { recursive: true, force: true }); }
});

test.describe('research journeys', () => {
  // The collector runs only through the Windows native helper (spawnOwned refuses elsewhere).
  test.skip(process.platform !== 'win32', 'The collector needs the Windows native helper');

  test('Start, restart mid-collection, and a collected package parks for import without a second dispatch', async () => {
    test.setTimeout(300_000);
    const { root, data, project, fake, launch } = await journey('journey-start');
    let app: ElectronApplication | undefined; let producer: string | undefined;
    try {
      app = await launch(); let page = await app.firstWindow();
      const started = await prepare(app, page, project);
      expect(started.status).toBe('queued');
      await expect.poll(async () => (await read(page, started.id)).status, { timeout: 90_000, message: 'the dispatch must commit collecting' }).toBe('collecting');
      expect(await read(page, started.id)).toMatchObject({ workflowRunId: '1', clientRef: started.clientRef });
      const dispatch = fake.seen.filter(request => request.method === 'POST' && request.path === DISPATCH);
      expect(dispatch).toHaveLength(1);
      expect(dispatch[0]).toMatchObject({ authorization: 'exact', body: { ref: 'main', inputs: { client_ref: started.clientRef } } });
      await expect.poll(() => count(fake, 'GET', RUN), { timeout: 60_000, message: 'the watch must read the run' }).toBeGreaterThan(0);
      expect(fake.connects.every(authority => authority === 'api.github.com:443')).toBe(true);

      // Restart while the run is still in progress: the job is adopted and watched again, never dispatched again.
      await app.close(); app = undefined;
      const before = count(fake, 'GET', RUN);
      app = await launch(); page = await app.firstWindow();
      await expect.poll(() => count(fake, 'GET', RUN), { timeout: 60_000, message: 'the adopted job must be watched again' }).toBeGreaterThan(before);
      expect(await read(page, started.id)).toMatchObject({ status: 'collecting', workflowRunId: '1' });
      expect(count(fake, 'POST', DISPATCH)).toBe(1);

      // The run completes with a package the pinned kit's own producer made for this job's client ref.
      const { collectedProject } = await import(pathToFileURL(join(KIT_ROOT, 'test/artifact-fixtures.mjs')).href) as { collectedProject(date: string): string };
      producer = collectedProject('2026-10-03'); const zip = join(root, 'package.zip');
      const made = spawnSync(process.execPath, [join(KIT_ROOT, 'bin/artifact.mjs'), 'create', '--root', producer, '--output', zip, '--client-ref', started.clientRef, '--repository', FAKE_REPOSITORY, '--ref', 'main', '--commit', 'a'.repeat(40), '--workflow', 'collect.yml', '--run-id', '1', '--run-attempt', '1'], { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
      expect(made.status, made.stderr).toBe(0);
      fake.set({ zip: await readFile(zip), artifacts: [{ id: 7, name: `research-kit-corpus-v1-${started.clientRef}` }] });
      await expect.poll(() => count(fake, 'GET', `/repos/${FAKE_REPOSITORY}/actions/artifacts/7/zip`), { timeout: 60_000, message: 'the watch must download the package' }).toBe(1);
      // The verified import's GitHub run read is refused by the harness before it leaves the machine (the fake does not
      // serve the run yet), so the import defers and the job stays collecting and parked. A transient outcome would
      // relaunch within 30 s and a failed validation would fail the job; neither may happen.
      const settled = fake.seen.length;
      await page.waitForTimeout(40_000);
      expect(fake.seen.length).toBe(settled);
      expect(await read(page, started.id)).toMatchObject({ status: 'collecting', workflowRunId: '1' });
      expect(await read(page, started.id)).not.toHaveProperty('failure');
      const harness = await network(app);
      expect(harness?.collectors).toBeGreaterThan(0); expect(harness?.rewritten).toBe(harness?.collectors);
      // A kit or credentials park also leaves the job collecting and quiet. Only a watch that exited 0 with a PASS
      // report for this client ref, a reviewable state and no failure on the job, is classified as a package, so the
      // park is the import one. Every collector launch has ended, so nothing replaced that last watch.
      expect(harness?.outcomes).toHaveLength(harness!.collectors);
      expect(harness?.outcomes.at(-1)).toEqual({ code: 0, status: 'PASS', clientRef: started.clientRef, state: expect.stringMatching(/^(REVIEW_REQUIRED|REVIEW_IN_PROGRESS|PREFLIGHT_BLOCKED)$/) });
      expect(count(fake, 'POST', DISPATCH)).toBe(1);
      expect(fake.seen.every(request => request.authorization === 'exact')).toBe(true);
      // The import tried to read the run from GitHub and was refused there: the test token never left for a real host.
      expect(harness?.refusedFetches.length).toBeGreaterThan(0);
      expect(harness?.refusedFetches.every(host => host === 'api.github.com')).toBe(true);
      await app.close(); app = undefined;
      for (const file of await files(data)) expect((await readFile(file)).includes(TOKEN), file).toBe(false);
    } finally {
      await app?.close(); await fake.close();
      if (producer) await rm(producer, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });

  test('Cancel mid-collection stops the watch and ends the job cancelled', async () => {
    test.setTimeout(240_000);
    const { root, data, project, fake, launch } = await journey('journey-cancel');
    let app: ElectronApplication | undefined;
    try {
      app = await launch(); const page = await app.firstWindow();
      const started = await prepare(app, page, project);
      await expect.poll(async () => (await read(page, started.id)).status, { timeout: 90_000, message: 'the dispatch must commit collecting' }).toBe('collecting');
      await expect.poll(() => count(fake, 'GET', RUN), { timeout: 60_000, message: 'the watch must read the run' }).toBeGreaterThan(0);
      const cancelled = await invoke<{ research: Job }>(page, 'research.cancel', { researchId: started.id });
      expect(['cancelling', 'cancelled']).toContain(cancelled.research.status);
      await expect.poll(async () => (await read(page, started.id)).status, { timeout: 60_000, message: 'the stopped watch must commit cancelled' }).toBe('cancelled');
      const ended = await read(page, started.id);
      expect(ended).toMatchObject({ workflowRunId: '1' }); expect(ended).not.toHaveProperty('failure');
      // The kit polls every 10 s: a watch still alive would read the run again.
      const settled = fake.seen.length;
      await page.waitForTimeout(15_000);
      expect(fake.seen.length).toBe(settled);
      expect(count(fake, 'POST', DISPATCH)).toBe(1);
      await app.close(); app = undefined;
      for (const file of await files(data)) expect((await readFile(file)).includes(TOKEN), file).toBe(false);
    } finally { await app?.close(); await fake.close(); await rm(root, { recursive: true, force: true }); }
  });
});
