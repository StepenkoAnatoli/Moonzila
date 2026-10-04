import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FAKE_HEAD_SHA, FAKE_REPOSITORY, TEST_CA, startFakeGitHub, type FakeGitHub } from '../tests/fixtures/fake-github';

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

/**
 * One isolated app: its own data folder, project folder, fake GitHub and a pinned-kit installation. `routeRunRead` opts
 * into the harness route that answers the verified import's run read from the fake; without it that read is refused.
 */
async function journey(name: string, { routeRunRead = false }: { routeRunRead?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), `moonzila-${name}-`));
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
      env: { ...process.env, MOONALIZA_E2E_COLLECTOR_NETWORK: JSON.stringify({ HTTPS_PROXY: fake.proxyUrl, NODE_EXTRA_CA_CERTS: TEST_CA, ...(routeRunRead ? { routeRunRead: true } : {}) }) },
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
const network = (app: ElectronApplication) => app.evaluate(() => (globalThis as { __moonzilaE2eCollectorNetwork?: Harness }).__moonzilaE2eCollectorNetwork ?? null);

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

  // research-review-ui spec 5 (P4-20): research is turned on through the panel's confirmation, never through the bridge,
  // then a collected job's brief is read in the panel. The job reaches `collected` only through the verified import, whose
  // GitHub run read the harness answers from the loopback fake when this journey opts in (`routeRunRead`).
  test('Allow research through the confirmation, collect, and read the collected brief verified by the Research Kit', async () => {
    test.setTimeout(300_000);
    const { root, data, project, fake, launch } = await journey('journey-reader', { routeRunRead: true });
    let app: ElectronApplication | undefined; let producer: string | undefined;
    type Listed = { projects: { id: string; policy: { revision: number; inference: string; research: string } }[] };
    try {
      app = await launch(); const page = await app.firstWindow();
      await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
      await page.getByRole('button', { name: 'Open project' }).click();
      await page.getByRole('button', { name: 'Trust and open' }).click();
      await expect(page.getByRole('heading', { name: 'Research project' })).toBeVisible();
      const details = page.getByRole('complementary', { name: 'Project details' });
      await expect(details.getByText('Research is off for this project.')).toBeVisible();
      const before = (await invoke<Listed>(page, 'project.list')).projects[0]!;
      expect(before.policy.research).toBe('off');

      await details.getByRole('button', { name: 'Open research' }).click();
      const dialog = page.getByRole('dialog', { name: 'Research' });
      await dialog.getByRole('button', { name: 'Allow research', exact: true }).click();
      const confirm = dialog.getByRole('group', { name: 'Allow public research?' });
      await expect(confirm.getByText('The topic, search queries and URLs of a collection are sent to your collector repository on GitHub and are readable there.')).toBeVisible();
      await expect(confirm.getByText('Only public web pages are fetched.')).toBeVisible();
      await expect(confirm.getByText('No project files are sent.')).toBeVisible();
      await expect(confirm.getByText('A collection already started on GitHub keeps running there; Moonzila stops following it and does not use its result.')).toBeVisible();
      await confirm.getByRole('button', { name: 'Allow public research' }).click();

      await expect(dialog.getByText('Research is on for this project: public web pages only.')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Turn research off' })).toBeVisible();
      await expect(dialog.getByRole('form', { name: 'Start research' })).toBeVisible();
      await expect(confirm).toHaveCount(0);
      // The details pane is read after the modal closes, so no locator depends on how aria-modal hides the page behind it.
      await dialog.getByRole('button', { name: 'Close dialog' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(details.getByText('Collections send only the fields you review to your GitHub collector.')).toBeVisible();
      await expect(details.getByText('Research is off for this project.')).toHaveCount(0);
      const after = (await invoke<Listed>(page, 'project.list')).projects[0]!;
      expect(after.policy).toEqual({ revision: before.policy.revision + 1, inference: before.policy.inference, research: 'public-technical' });
      // Turning research on reaches nothing outside the machine: no collector was launched and nothing reached the fake.
      expect(fake.seen).toEqual([]);
      expect(await network(app)).toEqual({ collectors: 0, rewritten: 0, outcomes: [], refusedFetches: [] });

      // Collect the way journey 2 does, with a package the pinned kit's producer makes for this job, on the fake run's commit.
      await invoke(page, 'research.collector.save', { repository: FAKE_REPOSITORY, workflow: 'collect.yml', ref: 'main', token: TOKEN });
      const { research: started } = await invoke<{ research: Job }>(page, 'research.start', { projectId: after.id, topic: 'Ollama context limits', queries: ['ollama num_ctx'], depth: 'quick', maxPages: 3, acknowledgedPublic: true });
      await expect.poll(async () => (await read(page, started.id)).status, { timeout: 90_000, message: 'the dispatch must commit collecting' }).toBe('collecting');
      await expect.poll(() => count(fake, 'GET', RUN), { timeout: 60_000, message: 'the watch must read the run' }).toBeGreaterThan(0);
      const { collectedProject } = await import(pathToFileURL(join(KIT_ROOT, 'test/artifact-fixtures.mjs')).href) as { collectedProject(date: string): string };
      producer = collectedProject('2026-10-03'); const zip = join(root, 'package.zip');
      const made = spawnSync(process.execPath, [join(KIT_ROOT, 'bin/artifact.mjs'), 'create', '--root', producer, '--output', zip, '--client-ref', started.clientRef, '--repository', FAKE_REPOSITORY, '--ref', 'main', '--commit', FAKE_HEAD_SHA, '--workflow', 'collect.yml', '--run-id', '1', '--run-attempt', '1'], { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
      expect(made.status, made.stderr).toBe(0);
      const brief = await readFile(join(producer, 'research/BRIEF.md'), 'utf8');
      fake.set({ zip: await readFile(zip), artifacts: [{ id: 7, name: `research-kit-corpus-v1-${started.clientRef}` }] });
      await expect.poll(async () => (await read(page, started.id)).status, { timeout: 120_000, message: 'the verified import must commit collected' }).toBe('collected');
      expect(await read(page, started.id)).not.toHaveProperty('failure');
      // The import's run read was answered by the fake, never refused and never sent anywhere else.
      const harness = await network(app);
      expect(harness?.refusedFetches).toEqual([]); expect(harness?.rewritten).toBe(harness?.collectors);
      expect(count(fake, 'POST', DISPATCH)).toBe(1);
      expect(fake.seen.every(request => request.authorization === 'exact')).toBe(true);
      expect(fake.connects.every(authority => authority === 'api.github.com:443')).toBe(true);

      // The reader: the collected package, validated in this call; its text as plain text; readiness is never claimed.
      await details.getByRole('button', { name: 'Open research' }).click();
      await expect(dialog.getByTestId('research-status')).toHaveText('Collected');
      await dialog.getByRole('button', { name: 'Read the brief' }).click();
      await expect(dialog.getByTestId('research-reader-source')).toHaveText('Brief · collected package · verified by the Research Kit');
      const text = dialog.locator('pre.research-document');
      await expect(text).toBeVisible();
      expect(await text.textContent()).toBe(brief);
      // The brief opens with an HTML comment: shown as text, so it was not rendered as markup.
      expect(brief.startsWith('<!--')).toBe(true);
      // "Ready" is checked inside the panel: the window's status bar says "Ready" when the engine is connected.
      await expect(dialog.getByText(/Ready/)).toHaveCount(0);
      await app.close(); app = undefined;
      for (const file of await files(data)) expect((await readFile(file)).includes(TOKEN), file).toBe(false);
    } finally {
      await app?.close(); await fake.close();
      if (producer) await rm(producer, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });
});
