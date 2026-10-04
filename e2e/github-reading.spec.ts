import { _electron as electron, expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('General chat reads a supplied GitHub URL through main and saves cited results across restart', async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), 'moon-github-e2e-'));
  const sha = 'a'.repeat(40); let modelCalls = 0; let observedSource = '';
  const server = createServer((request, response) => {
    let body = ''; request.on('data', chunk => { body += String(chunk); }); request.on('end', () => {
      const input = JSON.parse(body); modelCalls++;
      const last = input.messages.at(-1);
      let message;
      if (last.role === 'tool') {
        const result = JSON.parse(last.content); observedSource = result.url ?? '';
        message = { content: result.text === 'Moonzila repository evidence' ? `I read the README: [source](${result.url}).` : 'Reader did not return evidence.' };
      } else message = { content: '', tool_calls: [{ id: 'github-readme', function: { name: 'read_github', arguments: { url: 'https://github.com/example/project', path: 'README.md' } } }] };
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ message, done: true, done_reason: 'stop' }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const packaged = process.env.MOONALIZA_TEST_EXECUTABLE;
  const launch = () => electron.launch({ ...(packaged ? { executablePath: packaged } : {}), args: [...(packaged ? [] : [resolve('.')]), `--user-data-dir=${join(root, 'data')}`] });
  let app = await launch();
  try {
    await app.evaluate((_electron, sha) => {
      const original = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (!url.startsWith('https://api.github.com/')) return original(input, init);
        if (new Headers(init?.headers).has('Authorization')) throw new Error('UNEXPECTED_AUTH');
        const content = 'Moonzila repository evidence';
        if (url === 'https://api.github.com/repos/example/project/commits/HEAD') return new Response(JSON.stringify({ sha }));
        if (url === `https://api.github.com/repos/example/project/contents/README.md?ref=${sha}`) {
          // Exercise a valid read slower than Playwright's default five-second assertion.
          await new Promise(resolve => setTimeout(resolve, 6000));
          return new Response(JSON.stringify({ type: 'file', path: 'README.md', size: Buffer.byteLength(content), encoding: 'base64', content: Buffer.from(content).toString('base64') }));
        }
        throw new Error('UNEXPECTED_GITHUB_ROUTE');
      };
    }, sha);
    let page = await app.firstWindow();
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await page.getByLabel('Profile name').fill('GitHub fixture'); await page.getByLabel('Endpoint').fill(`http://127.0.0.1:${port}`);
    await page.getByLabel('Model name').fill('fixture'); await page.getByRole('button', { name: 'Save profile' }).click();
    await page.getByLabel('Message Moonzila').fill('Read https://github.com/example/project'); await page.getByRole('button', { name: 'Send message' }).click();
    // Wait for the durable outcome, not a five-second end-to-end timing assumption.
    // A failed/cancelled run ends the wait too, and must fail the assertion below.
    let outcome = '';
    await expect.poll(async () => {
      outcome = await page.evaluate(async () => {
        const { sessions } = await window.moonaliza.invoke('session.list', { projectId: null }) as { sessions: { id: string }[] };
        if (!sessions[0]) return 'queued';
        const { runs } = await window.moonaliza.invoke('session.read', { sessionId: sessions[0].id }) as { runs: { status: string }[] };
        return runs[0]?.status ?? 'queued';
      });
      return outcome;
    }, { timeout: 30_000, message: 'GitHub read must reach a terminal run state' }).toMatch(/^(completed|failed|cancelled)$/);
    expect(outcome).toBe('completed');
    await expect(page.getByText('I read the README:', { exact: false })).toBeVisible();
    expect(observedSource).toBe(`https://github.com/example/project/blob/${sha}/README.md`); expect(modelCalls).toBe(2);
    await expect(page.getByRole('heading', { name: 'General chat' })).toBeVisible();
    await page.screenshot({ path: 'test-results/moonzila-github-reading.png' });
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('button', { name: 'Read https://github.com/example/project', exact: true }).click();
    await expect(page.getByText('I read the README:', { exact: false })).toBeVisible(); expect(modelCalls).toBe(2);
  } finally { await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
