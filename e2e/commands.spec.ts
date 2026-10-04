import { _electron as electron, expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('Build reviews real command execution, receives failure evidence, and stops an owned process tree', async () => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), 'moonzila-commands-e2e-'));
  const project = join(root, 'Code project'); const data = join(root, 'data');
  await mkdir(project); await mkdir(data);
  execFileSync('git', ['init'], { cwd: project, windowsHide: true, stdio: 'pipe' });
  await writeFile(join(project, 'check.cjs'), 'require("fs").writeFileSync("check-ran.txt","yes"); console.log("CHECK FAILED: deliberate fixture failure"); process.exitCode=7;');
  await writeFile(join(project, 'tree.mjs'), await readFile(resolve('tests/fixtures/processes/tree.mjs')));
  const evidence: Array<{ status: string; code: number | null; output: string }> = [];
  const server = createServer((request, response) => {
    let bytes = ''; request.on('data', chunk => { bytes += String(chunk); });
    request.on('end', () => {
      const body = JSON.parse(bytes) as { messages: Array<{ role: string; content: string; tool_name?: string }> };
      const last = body.messages.at(-1)!;
      const tree = body.messages.filter(message => message.role === 'user').at(-1)?.content.includes('process tree');
      let message: unknown;
      if (last.role !== 'tool' && !tree) message = { content: '', tool_calls: [{ id: 'git-1', function: { name: 'git_status', arguments: {} } }] };
      else if (last.role !== 'tool' || last.tool_name === 'git_status') {
        if (last.tool_name === 'git_status') evidence.push(JSON.parse(last.content));
        message = { content: '', tool_calls: [{ id: 'cmd-1', function: { name: 'run_command', arguments: { program: 'node', args: tree ? ['tree.mjs', 'pids.json'] : ['check.cjs'], timeoutSeconds: 30 } } }] };
      } else { evidence.push(JSON.parse(last.content)); message = { content: 'The project check failed with exit code 7.' }; }
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
    await page.getByRole('button', { name: 'Open project' }).click(); await page.getByRole('button', { name: 'Trust and open' }).click();
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await page.getByLabel('Profile name').fill('Command model fixture'); await page.getByLabel('Endpoint').fill(`http://127.0.0.1:${port}`); await page.getByLabel('Model name').fill('fixture-commands');
    await page.getByRole('button', { name: 'Save profile' }).click(); await page.getByLabel('Mode', { exact: true }).selectOption('build');
    await page.getByLabel('Message Moonzila').fill('Inspect Git and run the project check'); await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('button', { name: 'Approve command' })).toBeVisible({ timeout: 30000 });
    await expect(readFile(join(project, 'check-ran.txt'))).rejects.toThrow();
    await expect(page.getByLabel('Command arguments')).toContainText('check.cjs');
    await page.screenshot({ path: 'test-results/moonzila-command-review.png' });
    await page.getByRole('button', { name: 'Approve command' }).click();
    await expect(page.getByText('The project check failed with exit code 7.', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Command · Exit code 7', { exact: true })).toBeVisible();
    expect(evidence[0]?.code).toBe(0); expect(evidence[0]?.output).toContain('check.cjs');
    expect(evidence[1]?.code).toBe(7); expect(evidence[1]?.output).toContain('CHECK FAILED');
    expect(await readFile(join(project, 'check-ran.txt'), 'utf8')).toBe('yes');
    await page.getByLabel('Message Moonzila').fill('Start the process tree'); await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByRole('button', { name: 'Approve command' }).click();
    await expect.poll(async () => readFile(join(project, 'pids.json'), 'utf8').catch(() => ''), { timeout: 30000 }).not.toBe('');
    const pids = JSON.parse(await readFile(join(project, 'pids.json'), 'utf8')) as number[];
    await page.getByRole('button', { name: 'Stop run' }).click();
    await expect(page.getByRole('button', { name: 'Stop run' })).toHaveCount(0);
    await expect(page.getByText('Command · Stopped', { exact: true })).toBeVisible();
    for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow();
    await page.getByLabel('Message Moonzila').fill('Start the process tree again'); await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByRole('button', { name: 'Decline command' }).click();
    await expect(page.getByText('The proposed action was declined. No further actions were taken.', { exact: true })).toBeVisible();
  } finally { await app.close(); await new Promise<void>(done => server.close(() => done())); await rm(root, { recursive: true, force: true }); }
});
