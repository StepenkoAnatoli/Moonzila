import { afterEach, expect, test } from 'vitest';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../src/main/vault';
import { CollectorSettings } from '../src/main/collector-settings';
import { canonicalHash } from '../src/engine/policy';
import { atomicJson } from '../src/models/artifact-files';

const TOKEN = 'github_pat_test-only-settings-0123456789';
const NEW_TOKEN = 'github_pat_test-only-rotated-9876543210';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'moonzila-collector-settings-')); roots.push(root);
  const key = randomBytes(32);
  const cryptor = {
    isEncryptionAvailable: () => true,
    encryptString(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
    decryptString(value: Buffer) { const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); decipher.setAuthTag(value.subarray(12, 28)); return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8'); },
  };
  const vaultDir = join(root, 'vault'); const file = join(root, 'research-kit', 'collector.json');
  const openVault = async () => { const vault = new Vault(vaultDir, cryptor); await vault.initialize('epoch-1'); return vault; };
  const vault = await openVault();
  const events: string[] = []; let busy = false;
  const openSettings = async (v: Vault = vault) => {
    const settings = new CollectorSettings(file, v, () => '2026-10-02T00:00:00.000Z');
    settings.attach({ busy: () => busy, credentialsChanged: () => events.push('credentialsChanged'), configChanged: () => events.push('configChanged') });
    await settings.open(); return settings;
  };
  const tracked = (v: Vault) => { const tombstone = v.tombstone.bind(v); v.tombstone = (ref: string) => { events.push(`tombstone:${ref}`); return tombstone(ref); }; return v; };
  const bins = async () => (await readdir(vaultDir)).filter(name => name.endsWith('.bin'));
  return { root, file, vault: tracked(vault), openVault, openSettings, events, bins, setBusy: (value: boolean) => { busy = value; } };
}
const target = { repository: 'owner/collector', workflow: 'collect.yml', ref: 'main' };
async function scanFor(root: string, needle: string): Promise<string[]> {
  const hits: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path); else if ((await readFile(path)).includes(Buffer.from(needle))) hits.push(path);
    }
  }
  await walk(root); return hits;
}

test('read is empty before a save; a saved token is reported only as configured, and survives a reopen', async () => {
  const f = await fixture(); const settings = await f.openSettings();
  expect(await settings.read()).toEqual({ collector: null });
  const saved = await settings.save({ ...target, token: TOKEN }, 'req-1');
  expect(saved).toEqual({ collector: { revision: 1, ...target, tokenConfigured: true } });
  expect(settings.current()).toMatchObject({ revision: 1, ...target, secretRef: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  const reopened = await f.openSettings(await f.openVault());
  expect(await reopened.read()).toEqual(saved);
  expect(f.events).toEqual(['configChanged']);
});

test('saves are compare-and-set, replay by request id without a second vault entry, and serialize', async () => {
  const f = await fixture(); const settings = await f.openSettings();
  await settings.save({ ...target, token: TOKEN }, 'req-1');
  await expect(settings.save({ ...target, ref: 'dev' }, 'req-2')).rejects.toThrow('REQUEST_CONFLICT');
  await expect(settings.save({ ...target, ref: 'dev', expectedRevision: 7 }, 'req-2')).rejects.toThrow('REQUEST_CONFLICT');
  expect(await f.bins()).toHaveLength(1);
  expect(await settings.save({ ...target, token: TOKEN }, 'req-1')).toEqual({ collector: { revision: 1, ...target, tokenConfigured: true } });
  expect(await f.bins()).toHaveLength(1);
  await expect(settings.save({ ...target, ref: 'other' }, 'req-1')).rejects.toThrow('REQUEST_CONFLICT');
  const both = await Promise.allSettled([settings.save({ ...target, ref: 'a', expectedRevision: 1 }, 'req-3'), settings.save({ ...target, ref: 'b', expectedRevision: 1 }, 'req-4')]);
  expect(both.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(settings.current()?.revision).toBe(2);
});

test('retargeting needs the token again, and is refused while a collection runs; rotation is always allowed', async () => {
  const f = await fixture(); const settings = await f.openSettings();
  await settings.save({ ...target, token: TOKEN }, 'r1');
  const first = settings.current()!.secretRef!;
  await expect(settings.save({ ...target, repository: 'owner/other', expectedRevision: 1 }, 'r2')).rejects.toThrow('COLLECTOR_TOKEN_REQUIRED');
  f.setBusy(true);
  await expect(settings.save({ ...target, ref: 'dev', expectedRevision: 1 }, 'r3')).rejects.toThrow('RUN_ACTIVE');
  f.events.length = 0;
  expect(await settings.save({ ...target, token: NEW_TOKEN, expectedRevision: 1 }, 'r4')).toEqual({ collector: { revision: 2, ...target, tokenConfigured: true } });
  // Watches stop before the old token is revoked, and the old ciphertext is gone.
  expect(f.events).toEqual(['credentialsChanged', `tombstone:${first}`, 'configChanged']);
  expect(await f.bins()).toEqual([`${settings.current()!.secretRef}.bin`]);
  f.setBusy(false);
  expect(await settings.save({ ...target, repository: 'owner/other', token: TOKEN, expectedRevision: 2 }, 'r5')).toMatchObject({ collector: { revision: 3, repository: 'owner/other', tokenConfigured: true } });
});

test('clearing the token revokes an outstanding research grant', async () => {
  const f = await fixture(); const settings = await f.openSettings();
  await settings.save({ ...target, token: TOKEN }, 'r1');
  const binding = { epoch: 'epoch-1', purpose: 'research' as const, contextId: 'collector:j:1', secretRef: settings.current()!.secretRef! };
  const grant = f.vault.grant({ ...binding, expiresAt: Date.now() + 30_000 });
  expect(await settings.save({ ...target, clearToken: true, expectedRevision: 1 }, 'r2')).toEqual({ collector: { revision: 2, ...target, tokenConfigured: false } });
  await expect(f.vault.withSecret(grant, binding, value => value)).rejects.toThrow('CREDENTIAL_CAPABILITY_DENIED');
  expect(await f.bins()).toEqual([]);
});

test('crash windows recover from the file and the vault reconcile', async () => {
  // A token staged but never written into collector.json is unreferenced and deleted.
  const a = await fixture();
  await a.vault.saveStaged(TOKEN);
  const afterStage = await a.openVault(); const sa = await a.openSettings(afterStage);
  await afterStage.reconcile(new Set(sa.references()));
  expect(await a.bins()).toEqual([]);

  // Written but not committed: the file's reference commits it.
  const b = await fixture();
  const staged = await b.vault.saveStaged(TOKEN);
  await atomicJson(b.file, { version: 1, revision: 1, ...target, secretRef: staged, retiredSecretRef: null, lastRequest: null, updatedAt: 'x' });
  const afterWrite = await b.openVault(); const sb = await b.openSettings(afterWrite);
  await afterWrite.reconcile(new Set(sb.references()));
  expect(await afterWrite.has(staged)).toBe(true);
  expect(await sb.read()).toMatchObject({ collector: { tokenConfigured: true } });

  // Retired but not yet removed: open tombstones it, reconcile deletes it, finishStartup forgets it.
  const c = await fixture(); const sc = await c.openSettings();
  await sc.save({ ...target, token: TOKEN }, 'r1'); const old = sc.current()!.secretRef!;
  const next = await c.vault.saveStaged(NEW_TOKEN); await c.vault.commit(next);
  await atomicJson(c.file, { version: 1, revision: 2, ...target, secretRef: next, retiredSecretRef: old, lastRequest: null, updatedAt: 'x' });
  const afterRetire = await c.openVault(); const reopened = await c.openSettings(afterRetire);
  await afterRetire.reconcile(new Set(reopened.references())); await reopened.finishStartup();
  expect(await c.bins()).toEqual([`${next}.bin`]);
  expect(JSON.parse(await readFile(c.file, 'utf8')).retiredSecretRef).toBeNull();
  // A later save tolerates a retired reference the reconcile already removed.
  await atomicJson(c.file, { version: 1, revision: 2, ...target, secretRef: next, retiredSecretRef: randomUUID(), lastRequest: null, updatedAt: 'x' });
  const again = await c.openSettings(afterRetire);
  await expect(again.save({ ...target, ref: 'dev', expectedRevision: 2 }, 'r9')).resolves.toMatchObject({ collector: { revision: 3 } });
});

test('no file holds the plaintext token, and the replay hash does not cover it', async () => {
  const f = await fixture(); const settings = await f.openSettings();
  await settings.save({ ...target, token: TOKEN }, 'req-1');
  expect(await scanFor(f.root, TOKEN)).toEqual([]);
  const stored = JSON.parse(await readFile(f.file, 'utf8'));
  expect(stored.lastRequest.inputHash).not.toBe(canonicalHash({ ...target, expectedRevision: null, clearToken: false, token: TOKEN }));
  // Behaviourally: the same request with another token value is a replay, so the value cannot be in the hash.
  expect(await settings.save({ ...target, token: NEW_TOKEN }, 'req-1')).toEqual({ collector: { revision: 1, ...target, tokenConfigured: true } });
  expect(await f.bins()).toHaveLength(1);
  expect(JSON.stringify(stored)).not.toContain('token":');
  expect(Object.keys(stored).sort()).toEqual(['lastRequest', 'ref', 'repository', 'retiredSecretRef', 'revision', 'secretRef', 'updatedAt', 'version', 'workflow']);
  await writeFile(f.file, '{"version":1,"broken"');
  const reopened = await f.openSettings();
  expect(await reopened.read()).toEqual({ collector: null });
  expect(reopened.references()).toEqual([]);
});
