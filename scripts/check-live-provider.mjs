import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import assert from 'node:assert/strict';

// Explicit, billable opt-in smoke check. Only a generated fixture project is sent.
// The credential is read in memory, saved through the real encrypted vault and
// removed with this verifier's isolated app data. No traces or request logs.
const [executable, credentialFile, model = 'Qwen/Qwen3-4B-Instruct-2507:nscale'] = process.argv.slice(2);
if (!executable || !credentialFile) throw new Error('Usage: check-live-provider.mjs <installed-executable> <HF-token-file> [model:provider]');
const secret = (await readFile(credentialFile, 'utf8')).match(/hf_[A-Za-z0-9]+/)?.[0];
if (!secret) throw new Error('No recognized Hugging Face credential');
const parent = resolve('.build/provider-check'); await mkdir(parent, { recursive: true });
const root = await mkdtemp(join(parent, 'run-'));
const project = join(root, 'Synthetic project'); const data = join(root, 'data');
await mkdir(project); await mkdir(data);
const file = join(project, 'hello.txt'); await writeFile(file, 'before\r\n');
const report = { checkedAt: new Date().toISOString(), model, syntheticOnly: true, outcome: 'pending', stages: {} };
let app;
try {
  report.step = 'launch';
  app = await electron.launch({ executablePath: executable, args: [`--user-data-dir=${data}`] });
  const page = await app.firstWindow(); page.setDefaultTimeout(45000);
  report.version = await app.evaluate(({ app }) => app.getVersion());
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, project);
  report.step = 'open-project';
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await page.getByRole('button', { name: 'Trust and open' }).click();
  report.step = 'cloud-policy';
  await page.getByRole('button', { name: 'Allow cloud inference' }).click();
  await page.getByRole('button', { name: 'Allow for this project' }).click();
  await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
  report.step = 'profile-fields';
  await page.getByLabel('Profile name').fill('Hugging Face live smoke');
  await page.getByLabel('Provider').selectOption('openai-compatible');
  await page.getByLabel('Endpoint').fill('https://router.huggingface.co/v1');
  await page.getByLabel('Model name').fill(model);
  await page.getByLabel('Context window (tokens)').fill('16384');
  await page.getByLabel('Maximum response (tokens)').fill('512');
  await page.getByLabel('API key').fill(secret);
  report.step = 'save-profile';
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  report.stages.profileSaved = true;
  report.step = 'test-connection';
  await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Hugging Face live smoke: connection succeeded', { exact: true })).toBeVisible({ timeout: 35000 });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  report.stages.profileConnection = true;
  report.step = 'configure-budget';
  await page.evaluate(async () => {
    const { settings } = await globalThis.window.moonaliza.invoke('settings.read', {});
    const { revision, ...values } = settings;
    await globalThis.window.moonaliza.invoke('settings.save', { expectedRevision: revision, settings: { ...values, modelStepBudget: 5, runDurationMinutes: 2 } });
  });
  await page.getByLabel('Mode', { exact: true }).selectOption('build');
  report.step = 'run-and-review';
  await page.getByLabel('Message Monnzila').fill('Read hello.txt with read_file, then use edit_file to replace the word before with after. Preserve the line ending. Only change hello.txt, do not run commands. After the approved edit succeeds, briefly confirm the result.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Approve edit' })).toBeVisible({ timeout: 60000 });
  assert.equal(await readFile(file, 'utf8'), 'before\r\n');
  const pending = await page.evaluate(async () => {
    const { projects } = await globalThis.window.moonaliza.invoke('project.list', {});
    const { sessions } = await globalThis.window.moonaliza.invoke('session.list', { projectId: projects[0].id });
    const saved = await globalThis.window.moonaliza.invoke('session.read', { sessionId: sessions[0].id });
    const { operations } = await globalThis.window.moonaliza.invoke('approval.list', { runId: saved.runs[0].id });
    const preview = await globalThis.window.moonaliza.invoke('approval.read', { projectId: projects[0].id, operationId: operations[0].id });
    return { preview, readFirst: saved.messages.some(message => message.role === 'tool' && message.toolName === 'read_file'), sessionId: sessions[0].id };
  });
  assert.equal(pending.readFirst, true);
  assert.equal(pending.preview.kind, 'write');
  assert.equal(pending.preview.path, 'hello.txt');
  assert.equal(pending.preview.before, 'before\r\n');
  assert.equal(pending.preview.after, 'after\r\n');
  report.stages.readAndExactReview = true;
  report.step = 'approve-and-complete';
  await page.screenshot({ path: join(parent, 'live-review.png') });
  await page.getByRole('button', { name: 'Approve edit' }).click();
  await expect.poll(() => readFile(file, 'utf8'), { timeout: 15000 }).toBe('after\r\n');
  report.stages.approvedEditApplied = true;
  await expect.poll(async () => {
    const saved = await page.evaluate(id => globalThis.window.moonaliza.invoke('session.read', { sessionId: id }), pending.sessionId);
    return saved.runs[0].status;
  }, { timeout: 60000 }).toBe('completed');
  report.stages.runCompleted = true;
  report.step = 'undo';
  await page.screenshot({ path: join(parent, 'live-completed.png') });
  await page.getByText('Project changes', { exact: true }).click();
  await page.getByRole('button', { name: 'Undo hello.txt' }).click();
  await expect(page.getByText('Undone', { exact: true })).toBeVisible();
  assert.equal(await readFile(file, 'utf8'), 'before\r\n');
  report.stages.undoRestoredOriginal = true;
  await app.close(); app = undefined;
  for (const name of await readdir(join(data, 'vault'))) {
    assert.equal((await readFile(join(data, 'vault', name))).includes(Buffer.from(secret)), false);
  }
  report.stages.credentialAbsentFromVaultPlaintext = true;
  report.outcome = 'passed';
} catch (error) {
  // Redact the exact token before retaining bounded verifier diagnostics.
  report.outcome = 'failed'; process.exitCode = 1;
  report.error = (error instanceof Error ? error.message : 'Unknown verification failure').split(secret).join('[REDACTED]').replace(/hf_[A-Za-z0-9]+/g, '[REDACTED]').slice(0, 1200);
} finally {
  await app?.close();
  const child = relative(parent, root);
  assert(child && !child.startsWith('..') && !isAbsolute(child));
  await rm(root, { recursive: true, force: true });
  report.temporaryDataRemoved = true;
  await writeFile(join(parent, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
