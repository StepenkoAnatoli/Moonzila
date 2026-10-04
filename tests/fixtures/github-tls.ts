// Test-only. Generates the TLS material for the loopback fake GitHub (tests/fixtures/fake-github.ts) at test time, so no
// private key lives in the repository (tests/fixtures/github-tls/README.md). Each call makes a fresh P-256 CA and a leaf
// for api.github.com and artifacts.invalid with Node's WebCrypto and pkijs. The CA key is generated non-extractable: it
// signs the leaf in memory and can never be written anywhere. The leaf key is returned as PEM text in memory only.
// Only the two certificates are written, under this call's own mkdtemp, which dispose() removes.
import { createHash, webcrypto } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

export const TEST_TLS_HOSTS = ['api.github.com', 'artifacts.invalid'] as const;

export interface TestTls {
  /** This call's own temporary folder; holds only ca.pem and leaf.pem. */
  readonly dir: string;
  /** Absolute path of the CA certificate: what NODE_EXTRA_CA_CERTS and the e2e preload are given. */
  readonly caPath: string;
  readonly leafPath: string;
  readonly caPem: string;
  readonly leafPem: string;
  /** The leaf's PKCS#8 private key, in memory only; never written to disk. */
  readonly leafKeyPem: string;
  dispose(): Promise<void>;
}

const subtle = webcrypto.subtle;
const engine = new pkijs.CryptoEngine({ name: 'node-webcrypto', crypto: webcrypto as unknown as Crypto });
const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const DAY = 86_400_000;

const pem = (label: string, der: ArrayBuffer) => `-----BEGIN ${label}-----\n${Buffer.from(der).toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`;
const name = (commonName: string) => new pkijs.RelativeDistinguishedNames({ typesAndValues: [new pkijs.AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: commonName }) })] });
const extension = (extnID: string, critical: boolean, value: { toSchema(): { toBER(sizeOnly?: boolean): ArrayBuffer } } | asn1js.BaseBlock) =>
  new pkijs.Extension({ extnID, critical, extnValue: ('toSchema' in value ? value.toSchema() : value).toBER(false) });
/** KeyUsage is a BIT STRING: bit 0 is the high bit of the first byte. */
const keyUsage = (bits: number[]) => {
  const byte = bits.reduce((sum, bit) => sum | (0x80 >> bit), 0);
  return new asn1js.BitString({ valueHex: new Uint8Array([byte]).buffer, unusedBits: 7 - Math.max(...bits) });
};
const keyId = (certificate: pkijs.Certificate) => createHash('sha1').update(new Uint8Array(certificate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView)).digest();

async function certificate(options: { subject: string; issuer: string; publicKey: webcrypto.CryptoKey; signingKey: webcrypto.CryptoKey; extensions(self: pkijs.Certificate): pkijs.Extension[] }): Promise<pkijs.Certificate> {
  const now = Date.now();
  const serial = webcrypto.getRandomValues(new Uint8Array(16)); serial[0] = (serial[0]! & 0x7f) | 0x01;
  const result = new pkijs.Certificate({ version: 2, serialNumber: new asn1js.Integer({ valueHex: serial.buffer }), subject: name(options.subject), issuer: name(options.issuer) });
  // An hour back for clock skew; a week ahead outlasts any test run.
  result.notBefore.value = new Date(now - 3_600_000);
  result.notAfter.value = new Date(now + 7 * DAY);
  await result.subjectPublicKeyInfo.importKey(options.publicKey as unknown as CryptoKey, engine);
  result.extensions = options.extensions(result);
  await result.sign(options.signingKey as unknown as CryptoKey, 'SHA-256', engine);
  return result;
}

export async function generateTestTls(): Promise<TestTls> {
  // Not extractable: subtle.exportKey refuses it, so the CA's private key cannot reach a file.
  const ca = await subtle.generateKey(ALGORITHM, false, ['sign', 'verify']);
  const leaf = await subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const caName = 'Moonzila test CA (generated per test run, not trusted outside tests)';
  const caCertificate = await certificate({
    subject: caName, issuer: caName, publicKey: ca.publicKey, signingKey: ca.privateKey,
    extensions: self => [
      extension('2.5.29.19', true, new pkijs.BasicConstraints({ cA: true })),
      extension('2.5.29.15', true, keyUsage([5, 6])), // keyCertSign, cRLSign
      extension('2.5.29.14', false, new asn1js.OctetString({ valueHex: keyId(self) })),
    ],
  });
  const caKeyId = keyId(caCertificate);
  const leafCertificate = await certificate({
    subject: TEST_TLS_HOSTS[0], issuer: caName, publicKey: leaf.publicKey, signingKey: ca.privateKey,
    extensions: self => [
      extension('2.5.29.19', true, new pkijs.BasicConstraints({ cA: false })),
      extension('2.5.29.15', true, keyUsage([0])), // digitalSignature
      // SAN is the guard that matters: without it Node's TLS refuses the leaf for these names. A leaf without EKU is
      // accepted by both OpenSSL and BoringSSL; serverAuth is kept so the leaf matches a real server certificate.
      extension('2.5.29.37', false, new pkijs.ExtKeyUsage({ keyPurposes: ['1.3.6.1.5.5.7.3.1'] })),
      extension('2.5.29.17', false, new pkijs.AltName({ altNames: TEST_TLS_HOSTS.map(host => new pkijs.GeneralName({ type: 2, value: host })) })),
      extension('2.5.29.14', false, new asn1js.OctetString({ valueHex: keyId(self) })),
      extension('2.5.29.35', false, new pkijs.AuthorityKeyIdentifier({ keyIdentifier: new asn1js.OctetString({ valueHex: caKeyId }) })),
    ],
  });
  const caPem = pem('CERTIFICATE', caCertificate.toSchema(true).toBER(false));
  const leafPem = pem('CERTIFICATE', leafCertificate.toSchema(true).toBER(false));
  const leafKeyPem = pem('PRIVATE KEY', await subtle.exportKey('pkcs8', leaf.privateKey));
  const dir = await mkdtemp(join(tmpdir(), 'moonzila-github-tls-'));
  const caPath = join(dir, 'ca.pem'); const leafPath = join(dir, 'leaf.pem');
  try {
    await writeFile(caPath, caPem); await writeFile(leafPath, leafPem);
  } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
  return { dir, caPath, leafPath, caPem, leafPem, leafKeyPem, dispose: () => rm(dir, { recursive: true, force: true }) };
}
