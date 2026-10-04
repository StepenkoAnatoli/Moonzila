import { afterEach, expect, test } from 'vitest';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import https from 'node:https';
import tls from 'node:tls';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { generateTestTls, type TestTls } from './fixtures/github-tls';
import { startFakeGitHub, type FakeGitHub } from './fixtures/fake-github';

// P4-40 / F-8: the fake GitHub's CA and leaf are generated at test time; no private key is committed.
const opened: Array<TestTls | FakeGitHub> = [];
afterEach(async () => { for (const item of opened.splice(0)) await ('dispose' in item ? item.dispose() : item.close()); });
const generate = async () => { const made = await generateTestTls(); opened.push(made); return made; };

/** A TLS handshake to a server holding the leaf, trusting only the generated CA (`ca` replaces the root store). */
async function handshake(material: TestTls, servername: string): Promise<string> {
  const server = https.createServer({ key: material.leafKeyPem, cert: material.leafPem }, (_request, response) => response.end('ok'));
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    return await new Promise<string>((done, fail) => {
      const socket = tls.connect({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, servername, ca: material.caPem }, () => { socket.end(); done('trusted'); });
      socket.once('error', fail);
    });
  } finally { await new Promise<void>(done => server.close(() => done())); }
}

test('the generated leaf is signed by the generated CA, names both hosts, and is accepted by Node TLS for each', async () => {
  const material = await generate();
  const ca = new X509Certificate(material.caPem); const leaf = new X509Certificate(material.leafPem);
  expect(ca.ca).toBe(true); expect(leaf.ca).toBe(false);
  expect(ca.publicKey.asymmetricKeyDetails).toEqual({ namedCurve: 'prime256v1' });
  expect(leaf.verify(ca.publicKey)).toBe(true); expect(leaf.checkIssued(ca)).toBe(true);
  expect(leaf.subjectAltName).toBe('DNS:api.github.com, DNS:artifacts.invalid');
  expect(leaf.keyUsage).toEqual(['1.3.6.1.5.5.7.3.1']);
  expect(new Date(leaf.validFrom).getTime()).toBeLessThan(Date.now());
  for (const host of ['api.github.com', 'artifacts.invalid']) expect(await handshake(material, host), host).toBe('trusted');
  await expect(handshake(material, 'example.com')).rejects.toThrow(/altnames/i);
  // Another generation is another CA: the first one's leaf does not verify against it.
  expect(leaf.verify(new X509Certificate((await generate()).caPem).publicKey)).toBe(false);
});

test('only the two certificates are written, under the call\'s own temporary folder, and dispose removes it', async () => {
  const material = await generateTestTls();
  try {
    expect((await readdir(material.dir)).sort()).toEqual(['ca.pem', 'leaf.pem']);
    expect(material.caPath).toBe(join(material.dir, 'ca.pem'));
    expect(await readFile(material.caPath, 'utf8')).toBe(material.caPem);
    for (const file of await readdir(material.dir)) expect(await readFile(join(material.dir, file), 'utf8'), file).not.toContain('PRIVATE KEY');
    expect(createPrivateKey(material.leafKeyPem).asymmetricKeyDetails).toEqual({ namedCurve: 'prime256v1' });
  } finally { await material.dispose(); }
  expect(existsSync(material.dir)).toBe(false);
});

test('the repository holds no TLS private key: the fixture folder is only its README', async () => {
  const folder = resolve('tests/fixtures/github-tls');
  expect(await readdir(folder)).toEqual(['README.md']);
  expect(await readFile(join(folder, 'README.md'), 'utf8')).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
});

test('each fake GitHub has its own CA file while open, and close removes it', async () => {
  const first = await startFakeGitHub('t'); opened.push(first);
  const second = await startFakeGitHub('t'); opened.push(second);
  expect(first.caPath).not.toBe(second.caPath);
  expect(await readFile(first.caPath, 'utf8')).not.toBe(await readFile(second.caPath, 'utf8'));
  await first.close(); opened.splice(opened.indexOf(first), 1);
  expect(existsSync(first.caPath)).toBe(false); expect(existsSync(second.caPath)).toBe(true);
});
