import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Not a real credential: a value shaped like one, so a leak into any file under the data folder is found by a byte scan.
const TOKEN = 'github_pat_e2e-only-collector-0123456789abcdef';
type Bridge = { moonaliza: { invoke(method: string, params?: unknown): Promise<unknown> } };
const invoke = (page: Page, method: string, params?: unknown) => page.evaluate(([m, p]) => (window as unknown as Bridge).moonaliza.invoke(m as string, p), [method, params] as const);
async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(path)); else if (entry.isFile()) found.push(path);
  }
  return found;
}

test('The collector token is kept by the startup reconcile, never written in clear, and can be cleared', async () => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), 'monnzila-collector-e2e-')); const data = join(root, 'data'); await mkdir(data);
  const packaged = process.env.MOONALIZA_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(packaged ? { executablePath: packaged } : {}), args: [...(packaged ? [] : [resolve('.')]), `--user-data-dir=${data}`] });
  let app: ElectronApplication | undefined;
  try {
    app = await launch(); let page = await app.firstWindow();
    expect(await invoke(page, 'research.collector.read')).toEqual({ collector: null });
    const saved = await invoke(page, 'research.collector.save', { repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', token: TOKEN });
    expect(saved).toEqual({ collector: { revision: 1, repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', tokenConfigured: true } });
    await app.close(); app = undefined;

    for (const file of await files(data)) expect((await readFile(file)).includes(TOKEN), file).toBe(false);

    // The reference lives outside the engine database: a reconcile that only knew the engine's references would drop it.
    app = await launch(); page = await app.firstWindow();
    expect(await invoke(page, 'research.collector.read')).toEqual(saved);
    const cleared = await invoke(page, 'research.collector.save', { repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', expectedRevision: 1, clearToken: true });
    expect(cleared).toEqual({ collector: { revision: 2, repository: 'octo/collector', workflow: 'collect.yml', ref: 'main', tokenConfigured: false } });
  } finally {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});
