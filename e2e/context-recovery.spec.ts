import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('privacy choices, durable result retrieval, usage and context recovery in the desktop', async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), 'monnzila-context-'));
  const project = join(root, 'Context project'); await mkdir(project);
  await writeFile(join(project, 'large.txt'), 'A'.repeat(25000) + 'TAIL_EVIDENCE');
  const data = join(root, 'app-data'); await mkdir(data);
  let calls = 0;
  const server = createServer((request, response) => {
    let text = ''; request.on('data', chunk => { text += String(chunk); });
    request.on('end', () => {
      calls++;
      const body = JSON.parse(text) as { messages: Array<{ role: string; content: string }> };
      const last = body.messages.at(-1)!;
      if (last.content === 'Trigger provider context limit') {
        response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'context_length_exceeded', message: 'PRIVATE_PROVIDER_TEXT' } })); return;
      }
      const tool = (id: string, name: string, args: Record<string, unknown>) => ({ message: { content: '', tool_calls: [{ id, function: { name, arguments: args } }] }, done: true, done_reason: 'stop', prompt_eval_count: 400, eval_count: 15 });
      let output;
      if (last.role === 'user') output = tool('read-large', 'read_file', { path: 'large.txt' });
      else if (JSON.parse(last.content).compacted) output = tool('read-tail', 'read_tool_result', { resultId: JSON.parse(last.content).resultId, offset: 24000, length: 2048 });
      else output = { message: { content: last.content.includes('TAIL_EVIDENCE') ? 'Retrieved the saved tail successfully.' : 'Tail was missing.' }, done: true, done_reason: 'stop', prompt_eval_count: 712, eval_count: 15 };
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(output));
    });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  const executablePath = process.env.MOONALIZA_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [resolve('.')]), `--user-data-dir=${data}`] });
  let app: ElectronApplication | undefined;
  try {
    app = await launch(); let page = await app.firstWindow();
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
    await page.getByRole('button', { name: 'Open project' }).click(); await page.getByRole('button', { name: 'Trust and open' }).click();
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await page.getByLabel('Profile name').fill('Cloud fixture'); await page.getByRole('combobox', { name: /^Provider/ }).selectOption('openai-compatible');
    await page.getByLabel('Endpoint').fill('https://provider.example/v1'); await page.getByLabel('Model name').fill('fixture');
    await page.getByLabel('API key').fill('fixture-only-key'); await page.getByRole('button', { name: 'Save profile' }).click();
    await page.getByLabel('Message Monnzila').fill('Keep this draft');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await page.getByLabel('Message Monnzila').press('Control+Enter'); expect(calls).toBe(0);
    await page.getByRole('button', { name: 'Review cloud access' }).click();
    await expect(page.getByRole('dialog')).toContainText('provider.example'); await page.getByRole('button', { name: 'Keep local only' }).click();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await page.getByRole('button', { name: 'Review cloud access' }).click(); await page.getByRole('button', { name: 'Allow for this project' }).click();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled(); expect(calls).toBe(0);
    const retargetBlocked = await page.evaluate(async () => {
      const { profiles } = await window.moonaliza.invoke('profile.list') as { profiles: Array<{ id: string; revision: number }> };
      const profile = profiles[0]!;
      try { await window.moonaliza.invoke('profile.save', { id: profile.id, expectedRevision: profile.revision, name: 'Cloud fixture', kind: 'openai-compatible', endpoint: 'https://different.example/v1', model: 'fixture', contextTokens: 8192, outputTokens: 2048 }); return false; } catch { return true; }
    });
    expect(retargetBlocked).toBe(true);
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Cloud fixture' }).click(); await page.getByLabel('Context window (tokens)').fill('16384');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await page.getByLabel('Profile name').fill('Local fixture'); await page.getByLabel('Endpoint').fill(`http://127.0.0.1:${port}`); await page.getByLabel('Model name').fill('fixture');
    await page.getByRole('button', { name: 'Save profile' }).click(); await page.getByLabel('Model profile', { exact: true }).selectOption({ label: 'Local fixture' });
    await page.getByLabel('Message Monnzila').fill('Read the large file'); await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Retrieved the saved tail successfully.', { exact: true })).toBeVisible(); expect(calls).toBe(3);
    await page.locator('.context-notice summary').click(); await expect(page.getByText('Last reported usage', { exact: false })).toContainText('712 input, 15 output');
    await page.screenshot({ path: 'test-results/context-recovery.png' });
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('button', { name: 'Read the large file', exact: true }).click();
    await page.locator('.context-notice summary').click(); await expect(page.getByText('Last reported usage', { exact: false })).toContainText('712 input, 15 output');
    await page.getByLabel('Model profile', { exact: true }).selectOption({ label: 'Local fixture' });
    await page.getByLabel('Message Monnzila').fill('Trigger provider context limit'); await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('button', { name: 'Review context settings' })).toBeVisible();
    await expect(page.getByRole('alert')).not.toContainText('PRIVATE_PROVIDER_TEXT'); expect(calls).toBe(4);
    await page.getByRole('button', { name: 'Start fresh with this request' }).click();
    await expect(page.getByLabel('Message Monnzila')).toHaveValue('Trigger provider context limit');
    await expect(page.getByText('What are we working on?')).toBeVisible(); expect(calls).toBe(4);
  } finally {
    await app?.close(); await new Promise<void>(done => server.close(() => done()));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
