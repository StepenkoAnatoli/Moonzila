import { _electron as electron, expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('Build reads, reviews an edit, applies, undoes and stops before an unapproved write', async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), 'moonaliza-build-e2e-'));
  const project = join(root, 'Code project'); const data = join(root, 'data');
  await mkdir(project); await mkdir(data); await writeFile(join(project, 'hello.txt'), 'before\r\n');
  const server = createServer((request, response) => {
    let bytes = '';
    request.on('data', chunk => { bytes += String(chunk); });
    request.on('end', () => {
      const body = JSON.parse(bytes) as { messages: Array<{ role: string; content: string; tool_name?: string }>; tools?: Array<{ function: { name: string } }> };
      const last = body.messages.at(-1)!;
      let message: unknown;
      if (last.role !== 'tool') message = { content: '', tool_calls: [{ id: 'read-1', function: { name: 'read_file', arguments: { path: 'hello.txt' } } }] };
      else if (last.tool_name === 'read_file' && last.content.includes('before')) message = { content: 'I propose updating hello.txt.', tool_calls: [{ id: 'edit-1', function: { name: 'edit_file', arguments: { path: 'hello.txt', search: 'before', replacement: 'after' } } }] };
      else message = { content: last.content.includes('"applied":true') ? 'Applied the approved edit.' : 'No change applied.' };
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ message, done: true, done_reason: 'stop' }));
    });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  const packaged = process.env.MOONALIZA_TEST_EXECUTABLE;
  const app = await electron.launch({ ...(packaged ? { executablePath: packaged } : {}), args: [...(packaged ? [] : [resolve('.')]), `--user-data-dir=${data}`] });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, project);
    await page.getByRole('button', { name: 'Open project' }).click();
    await page.getByRole('button', { name: 'Trust and open' }).click();
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await page.getByLabel('Profile name').fill('Tool model fixture');
    await page.getByLabel('Endpoint').fill(`http://127.0.0.1:${port}`);
    await page.getByLabel('Model name').fill('fixture-tools');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await page.getByLabel('Mode', { exact: true }).selectOption('build');
    await page.getByLabel('Message Moonzila').fill('Change before to after in hello.txt');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('button', { name: 'Approve edit' })).toBeVisible();
    expect(await readFile(join(project, 'hello.txt'), 'utf8')).toBe('before\r\n');
    await expect(page.getByLabel('Proposed content')).toContainText('after');
    await page.screenshot({ path: 'test-results/moonzila-edit-review.png' });
    await page.getByRole('button', { name: 'Approve edit' }).click();
    await expect(page.getByText('Applied the approved edit.', { exact: true })).toBeVisible();
    expect(await readFile(join(project, 'hello.txt'), 'utf8')).toBe('after\r\n');
    await page.getByText('Project changes', { exact: true }).click();
    await page.getByRole('button', { name: 'Undo hello.txt' }).click();
    await expect(page.getByText('Undone', { exact: true })).toBeVisible();
    expect(await readFile(join(project, 'hello.txt'), 'utf8')).toBe('before\r\n');
    await page.getByLabel('Message Moonzila').fill('Make the change again');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('button', { name: 'Approve edit' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop run' }).click();
    await expect(page.getByRole('button', { name: 'Approve edit' })).toHaveCount(0);
    expect(await readFile(join(project, 'hello.txt'), 'utf8')).toBe('before\r\n');
  } finally {
    await app.close(); await new Promise<void>(done => server.close(() => done())); await rm(root, { recursive: true, force: true });
  }
});
