import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('Local model readiness reads real Windows hardware and leaves model profiles available', async () => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'monnzila-hardware-e2e-'));
  const packaged = process.env.MOONALIZA_TEST_EXECUTABLE;
  const app = await electron.launch({ ...(packaged ? { executablePath: packaged } : {}), args: [...(packaged ? [] : [resolve('.')]), `--user-data-dir=${directory}`] });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Local models', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Local model readiness' });
    await expect(panel.getByText('Total RAM', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(panel.getByText('Available now', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/monnzila-hardware.png' });
    await panel.getByRole('button', { name: 'Check Ollama' }).click();
    await expect(panel.getByTestId('runtime-status')).toBeVisible({ timeout: 15000 });
    await expect(panel.getByTestId('runtime-status')).toContainText(/No Ollama runtime|Connected|service responded/);
    await page.screenshot({ path: 'test-results/moonaliza-local-models.png' });
    await panel.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Model profiles', exact: true }).click();
    await expect(page.getByLabel('Profile name')).toBeVisible();
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
