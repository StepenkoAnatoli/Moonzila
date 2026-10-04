import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../src/engine/store';
import { FileJournal } from '../src/tools/files';

test('Recovery survives restart, preserves conflicts and never replays an uncertain command', async () => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), 'monnzila-recovery-e2e-'));
  const project = join(root, 'Recovery project'); const data = join(root, 'data');
  await mkdir(project); await mkdir(data);
  await writeFile(join(project, 'interrupt.cjs'), 'require("fs").appendFileSync("executions.txt","once\\n");console.log("effect recorded");setTimeout(()=>process.kill(process.ppid),100);setInterval(()=>{},1000);');
  let requests = 0;
  const server = createServer((request, response) => {
    request.resume(); request.on('end', () => {
      requests++;
      const message = requests === 1 ? { content: '', tool_calls: [{ id: 'interrupt', function: { name: 'run_command', arguments: { program: 'node', args: ['interrupt.cjs'], timeoutSeconds: 20 } } }] } : { content: 'Ready after recovery review.' };
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ message, done: true, done_reason: 'stop' }));
    });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  const packaged = process.env.MOONALIZA_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(packaged ? { executablePath: packaged } : {}), args: [...(packaged ? [] : [resolve('.')]), `--user-data-dir=${data}`] });
  let app: ElectronApplication | undefined;
  try {
    app = await launch(); let page = await app.firstWindow();
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
    await page.getByRole('button', { name: 'Open project' }).click(); await page.getByRole('button', { name: 'Trust and open' }).click();
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await page.getByLabel('Profile name').fill('Recovery fixture'); await page.getByLabel('Endpoint').fill(`http://127.0.0.1:${port}`); await page.getByLabel('Model name').fill('fixture');
    await page.getByRole('button', { name: 'Save profile' }).click(); await page.getByLabel('Mode', { exact: true }).selectOption('build');
    await page.getByLabel('Message Monnzila').fill('Run the interruption fixture'); await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByRole('button', { name: 'Approve command' }).click();
    await expect(page.getByText('Command outcome unknown', { exact: true })).toBeVisible({ timeout: 30000 });
    expect(requests).toBe(1); expect(await readFile(join(project, 'executions.txt'), 'utf8')).toBe('once\n');
    await app.close(); app = undefined;

    // Seed the two durable states a crash can leave around a file rename.
    // The fixture uses the production journal; recovery itself runs through the packaged UI.
    const store = new Store(join(data, 'state.sqlite'));
    try {
      const registered = store.listProjects()[0]!; const session = store.listSessions(registered.id)[0]!;
      const prior = store.listRuns(session.id)[0]!;
      store.putRun({ ...prior, id: 'crash-files', status: 'running', finishedAt: undefined });
      const journal = new FileJournal(store, join(data, 'snapshots'));
      for (const name of ['matching.txt', 'conflicting.txt']) {
        await writeFile(join(project, name), 'original');
        const op = await journal.prepareWrite('crash-files', name, 'proposed'); store.updateOperation(op.id, { status: 'started' });
        await writeFile(join(project, name), name === 'matching.txt' ? 'proposed' : 'my later changes');
      }
    } finally { store.close(); }

    app = await launch(); page = await app.firstWindow();
    await expect(page.getByText('Recovery · 3 needs review', { exact: true })).toBeVisible();
    await page.getByLabel('Mode', { exact: true }).selectOption('build');
    await page.getByLabel('Message Monnzila').fill('Continue after recovery'); await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Review interrupted operations in Recovery before starting another Build task.', { exact: true })).toBeVisible();
    expect(requests).toBe(1);
    const matching = page.locator('article.recovery-item').filter({ hasText: 'matching.txt' });
    await matching.getByRole('button', { name: 'Inspect current file' }).click();
    await expect(matching.getByText('Recovered · proposed contents found', { exact: true })).toBeVisible();
    const conflict = page.locator('article.recovery-item').filter({ hasText: 'conflicting.txt' });
    await conflict.getByRole('button', { name: 'Inspect current file' }).click();
    await expect(conflict.getByText('Current contents differ from both versions', { exact: true })).toBeVisible();
    await conflict.getByRole('checkbox').check(); await conflict.getByRole('button', { name: 'Acknowledge outcome' }).click();
    const command = page.locator('article.recovery-item').filter({ hasText: 'interrupt.cjs' });
    await command.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Dismiss error' }).click();
    await page.getByText('Recovery · 1 needs review', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/monnzila-recovery.png' });
    await command.getByRole('button', { name: 'Acknowledge outcome' }).click();
    await expect(page.getByText('Recovery · reviewed operations', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Ready after recovery review.', { exact: true })).toBeVisible();
    expect(requests).toBe(2);
    expect(await readFile(join(project, 'executions.txt'), 'utf8')).toBe('once\n');
    expect(await readFile(join(project, 'conflicting.txt'), 'utf8')).toBe('my later changes');
    expect(await readFile(join(project, 'matching.txt'), 'utf8')).toBe('proposed');
    await app.close(); app = await launch(); page = await app.firstWindow();
    await expect(page.getByText('Recovery · reviewed operations', { exact: true })).toBeVisible();
    expect(requests).toBe(2); expect(await readFile(join(project, 'executions.txt'), 'utf8')).toBe('once\n');
  } finally { await app?.close(); await new Promise<void>(done => server.close(() => done())); await rm(root, { recursive: true, force: true }); }
});
