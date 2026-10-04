import { afterEach, describe, expect, test } from 'vitest';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../src/main/vault';

const roots: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'moonzila-vault-'));
  roots.push(directory);
  const key = randomBytes(32);
  const cryptor = {
    isEncryptionAvailable: () => true,
    encryptString(value: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    decryptString(value: Buffer) {
      const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    }
  };
  const vault = new Vault(directory, cryptor);
  await vault.initialize('epoch-1');
  return { directory, vault, cryptor };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('credential lifecycle', () => {
  test('a research grant lives at most 30 seconds, as a provider test does', async () => {
    const { vault } = await fixture();
    const ref = await vault.saveStaged('collector-token'); await vault.commit(ref);
    const binding = { epoch: 'epoch-1', purpose: 'research' as const, contextId: 'collector:j:1', secretRef: ref };
    expect(() => vault.grant({ ...binding, expiresAt: Date.now() + 60_000 })).toThrow('CREDENTIAL_CAPABILITY_DENIED');
    const capability = vault.grant({ ...binding, expiresAt: Date.now() + 30_000 });
    expect(await vault.withSecret(capability, binding, value => value)).toBe('collector-token');
  });

  test('stores encrypted bytes and grants access only to its live bound purpose', async () => {
    const { vault, directory } = await fixture();
    const ref = await vault.saveStaged('fixture-secret-123');
    await vault.commit(ref);
    const binding = { epoch: 'epoch-1', purpose: 'provider-test' as const, contextId: 'test-1', secretRef: ref };
    const capability = vault.grant({ ...binding, expiresAt: Date.now() + 30_000 });
    expect(await vault.withSecret(capability, binding, value => value.length)).toBe(18);
    await expect(vault.withSecret(capability, { ...binding, contextId: 'run-2' }, () => 'leaked'))
      .rejects.toThrow('CREDENTIAL_CAPABILITY_DENIED');
    for (const file of await readdir(directory)) {
      expect((await readFile(join(directory, file))).includes(Buffer.from('fixture-secret-123'))).toBe(false);
    }
  });

  test('reconciles staged committed references without deleting them after a crash', async () => {
    const { directory, vault, cryptor } = await fixture();
    const committedInStore = await vault.saveStaged('survive');
    const orphan = await vault.saveStaged('orphan');
    const reopened = new Vault(directory, cryptor);
    await reopened.initialize('epoch-2');
    await reopened.reconcile(new Set([committedInStore]));
    expect(await reopened.has(committedInStore)).toBe(true);
    expect(await reopened.has(orphan)).toBe(false);
  });

  test('tombstone invalidates previously issued capabilities before ciphertext is removed', async () => {
    const { vault } = await fixture();
    const ref = await vault.saveStaged('delete-me');
    await vault.commit(ref);
    const binding = { epoch: 'epoch-1', purpose: 'inference' as const, contextId: 'run-1', secretRef: ref };
    const capability = vault.grant({ ...binding, expiresAt: Date.now() + 30_000 });
    await vault.tombstone(ref);
    await expect(vault.withSecret(capability, binding, () => 'leaked')).rejects.toThrow('CREDENTIAL_CAPABILITY_DENIED');
    await vault.remove(ref);
    expect(await vault.has(ref)).toBe(false);
  });

  test('new engine epoch and revoked context invalidate old grants', async () => {
    const { vault } = await fixture();
    const ref = await vault.saveStaged('test');
    await vault.commit(ref);
    const binding = { epoch: 'epoch-1', purpose: 'inference' as const, contextId: 'run-1', secretRef: ref };
    const cap = vault.grant({ ...binding, expiresAt: Date.now() + 30_000 });
    vault.revokeContext('run-1');
    await expect(vault.withSecret(cap, binding, () => 'bad')).rejects.toThrow('CREDENTIAL_CAPABILITY_DENIED');
    const cap2 = vault.grant({ ...binding, expiresAt: Date.now() + 30_000 });
    vault.setEpoch('epoch-2');
    await expect(vault.withSecret(cap2, binding, () => 'bad')).rejects.toThrow('CREDENTIAL_CAPABILITY_DENIED');
  });

  test('does not accept secrets when OS encryption is unavailable', async () => {
    const { directory, cryptor } = await fixture();
    const vault = new Vault(directory, { ...cryptor, isEncryptionAvailable: () => false });
    await vault.initialize('epoch');
    await expect(vault.saveStaged('cannot-store')).rejects.toThrow('ENCRYPTION_UNAVAILABLE');
  });

  test('redacts known overlapping secrets inside the vault boundary', async () => {
    const { vault } = await fixture();
    for (const secret of ['secret-short', 'secret-short-long']) {
      const ref = await vault.saveStaged(secret);
      await vault.commit(ref);
    }
    expect(await vault.redact('value=secret-short-long or secret-short')).toBe('value=[redacted] or [redacted]');
  });
});
