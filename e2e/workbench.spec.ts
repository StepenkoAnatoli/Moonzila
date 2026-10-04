import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('trusted project, encrypted profile, real IPC inference and durable history', async () => {
  // Includes two real desktop launches and shutdowns, including on an 8 GiB Windows host.
  test.setTimeout(120_000);
  const directory = await mkdtemp(join(tmpdir(), 'monnzila-e2e-'));
  const project = join(directory, 'Example project'); await mkdir(project);
  const data = join(directory, 'app-data'); await mkdir(data);
  const server = createServer((request, response) => {
    if (request.url !== '/api/chat') { response.writeHead(404).end(); return; }
    let content = '';
    request.on('data', chunk => { content += String(chunk); });
    request.on('end', () => {
      const body = JSON.parse(content) as { model: string };
      if (body.model !== 'fixture-model') { response.writeHead(400).end(); return; }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: { content: 'Fixture model response' }, done: true, done_reason: 'stop' }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  let app: ElectronApplication | undefined;
  const packaged = process.env.MOONALIZA_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(packaged ? { executablePath: packaged } : {}), args: [...(packaged ? [] : [resolve('.')]), `--user-data-dir=${data}`] });
  try {
    app = await launch(); const page = await app.firstWindow();
    await expect(page.getByText('Your work starts here')).toBeVisible();
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
    await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, project);
    await page.getByRole('button', { name: 'Open project' }).click();
    await page.getByRole('button', { name: 'Trust and open' }).click();
    await expect(page.getByRole('heading', { name: 'Example project' })).toBeVisible();
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await page.getByLabel('Profile name').fill('Fixture local');
    await page.getByLabel('Endpoint').fill(`http://127.0.0.1:${port}`);
    await page.getByLabel('Model name').fill('fixture-model');
    await page.getByLabel('API key').fill('test-only-credential-marker');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Message Monnzila').fill('Remember this conversation');
    // A CI desktop can constrain the window below the details-pane breakpoint.
    // Exercise actual pointer hit testing, including the minimum supported width.
    for (const width of [960, 1180, 1440, 1024]) {
      await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0]!.setSize(value, 768), width);
      await page.getByRole('button', { name: 'Send message' }).click({ trial: true, timeout: 5000 });
      await page.getByRole('button', { name: 'Project details', exact: true }).click();
      await page.getByRole('button', { name: 'Send message' }).click({ trial: true, timeout: 5000 });
      await page.getByRole('button', { name: 'Project details', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Fixture model response', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop run' })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/monnzila-workbench.png' });
    const invalid = await page.evaluate(async () => {
      try { await window.moonaliza.invoke('project.pick', { path: 'C:\\private' }); return false; } catch { return true; }
    });
    expect(invalid).toBe(true);
    await app.close(); app = undefined;
    for (const name of await readdir(join(data, 'vault'))) {
      expect((await readFile(join(data, 'vault', name))).includes(Buffer.from('test-only-credential-marker'))).toBe(false);
    }
    app = await launch(); const reopened = await app.firstWindow();
    await reopened.getByRole('button', { name: 'Remember this conversation', exact: true }).click();
    await expect(reopened.getByText('Fixture model response', { exact: true })).toBeVisible();
  } finally {
    await app?.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
