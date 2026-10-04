import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('chat without a folder survives restart, creates a workspace and applies only a reviewed edit', async () => {
  test.setTimeout(150_000);
  const root = await mkdtemp(join(tmpdir(), 'moon-chat-e2e-')); const data = join(root, 'data'); await mkdir(data);
  const workspace = join(root, 'Idea workspace');
  const requests: Array<{ messages: Array<{ role: string; content: string }>; tools?: unknown[] }> = [];
  const server = createServer((request, response) => {
    let bytes = ''; request.on('data', chunk => { bytes += String(chunk); });
    request.on('end', () => {
      const body = JSON.parse(bytes); requests.push(body);
      const last = body.messages.at(-1);
      const message = !body.tools?.length ? { content: 'Let us explore your idea before choosing a folder.' }
        : last.role === 'tool' ? { content: 'Created the approved idea file.' }
          : { content: 'Here is the proposed file.', tool_calls: [{ id: 'create-idea', function: { name: 'write_file', arguments: { path: 'idea.txt', content: 'Reviewed idea\n' } } }] };
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ message, done: true, done_reason: 'stop' }));
    });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const port = (server.address() as { port: number }).port;
  const packaged = process.env.MOONALIZA_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(packaged ? { executablePath: packaged } : {}), args: [...(packaged ? [] : [resolve('.')]), `--user-data-dir=${data}`] });
  let app: ElectronApplication | undefined;
  try {
    app = await launch(); let page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'General chat' })).toBeVisible();
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await page.getByLabel('Profile name').fill('Chat fixture'); await page.getByLabel('Endpoint').fill(`http://127.0.0.1:${port}`);
    await page.getByLabel('Model name').fill('fixture'); await page.getByRole('button', { name: 'Save profile' }).click();
    await page.getByLabel('Message Moonzila').fill('Explore a garden idea'); await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Let us explore your idea before choosing a folder.', { exact: true })).toBeVisible();
    expect(requests[0]?.tools ?? []).toHaveLength(0);
    await page.screenshot({ path: 'test-results/moonzila-general-chat.png' });
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('button', { name: 'Explore a garden idea', exact: true }).click();
    await expect(page.getByText('Let us explore your idea before choosing a folder.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Attach workspace', exact: true }).click();
    await expect(page.getByLabel('Discussion to carry over')).toHaveValue(/garden idea/);
    await page.getByLabel('Discussion to carry over').fill('Only this reviewed idea crosses into the workspace.');
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, workspace);
    await page.getByRole('button', { name: 'Create new folder', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Trust this project?' })).toBeVisible();
    expect((await stat(workspace)).isDirectory()).toBe(true);
    await page.getByRole('button', { name: 'Trust and open' }).click();
    await expect(page.getByLabel('Destination workspace')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Create conversation', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Idea workspace', exact: true })).toBeVisible();
    await expect(page.getByText('Only this reviewed idea crosses into the workspace.', { exact: true })).toBeVisible();
    await expect(page.getByText('Let us explore your idea before choosing a folder.', { exact: true })).toHaveCount(0);
    await page.getByLabel('Mode', { exact: true }).selectOption('build');
    await page.getByLabel('Message Moonzila').fill('Create idea.txt'); await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('button', { name: 'Approve edit' })).toBeVisible();
    await expect(readFile(join(workspace, 'idea.txt'))).rejects.toThrow();
    expect(JSON.stringify(requests.at(-1))).not.toContain('Explore a garden idea');
    expect(JSON.stringify(requests.at(-1))).toContain('Only this reviewed idea');
    await page.getByRole('button', { name: 'Approve edit' }).click();
    await expect(page.getByText('Created the approved idea file.', { exact: true })).toBeVisible();
    expect(await readFile(join(workspace, 'idea.txt'), 'utf8')).toBe('Reviewed idea\n');
    await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
    await expect(page.getByLabel('Discussion to carry over')).toHaveValue('');
    await page.getByRole('button', { name: 'Create conversation', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'General chat', exact: true })).toBeVisible();
    await expect(page.getByText('Created the approved idea file.', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Explore a garden idea', exact: true }).click();
    await expect(page.getByText('Let us explore your idea before choosing a folder.', { exact: true })).toBeVisible();
  } finally {
    await app?.close(); await new Promise<void>(done => server.close(() => done())); await rm(root, { recursive: true, force: true });
  }
});
