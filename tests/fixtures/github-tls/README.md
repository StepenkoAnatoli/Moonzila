# Test-only TLS for the fake GitHub: generated at test time

The real Research Kit collector is run against `tests/fixtures/fake-github.ts`. That fake answers on loopback, behind a CONNECT proxy that tunnels only `api.github.com:443` and `artifacts.invalid:443`, and it needs a certificate for those names. This folder used to hold that certificate, its key and a test CA. It now holds only this README: no certificate or private key is committed (requirement F-8, task P4-40).

Each `startFakeGitHub()` calls `generateTestTls()` in `tests/fixtures/github-tls.ts`, which makes, with Node's WebCrypto and `pkijs`:

- a fresh P-256 test CA (`CA:TRUE`, `keyCertSign`, `cRLSign`). Its private key is generated non-extractable, signs the leaf in memory and is never written anywhere;
- a leaf for `api.github.com` and `artifacts.invalid` (subjectAltName for both, extendedKeyUsage `serverAuth`, `CA:FALSE`), valid for a week. Its private key stays in memory and goes straight to the fake's HTTPS server.

Only `ca.pem` and `leaf.pem` are written, under the fake's own `mkdtemp` folder, and `close()` removes it. The fake exposes the CA path as `fake.caPath`. Tests trust it only by giving the collector child `NODE_EXTRA_CA_CERTS=fake.caPath`, which no production code path sets. The desktop journeys pass the same path to the test-only preload `e2e/fixtures/collector-network.cjs` through `MOONALIZA_E2E_COLLECTOR_NETWORK` ([research journeys](../../../docs/specification/research-journeys.md)).

Node and Electron read `NODE_EXTRA_CA_CERTS` lazily, at a process's first TLS use, not when the child starts. So the CA file has to outlive each child's first handshake: close the fake (which deletes the file) only after every child that was given `fake.caPath` is done.

Nothing under `src/` may reference this folder or the generator. `tests/github-tls.test.ts` checks the generated chain, that only the two certificates reach disk, and that this folder holds nothing but this README.
