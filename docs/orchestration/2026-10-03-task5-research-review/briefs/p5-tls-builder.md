# P4-40: generate the test TLS fixtures at test time

Worktree `/home/user/task5-handoff/wt/p5-tls`, branch `build/p5-tls`, base `7e1f4d9`. Read `p5-common.md` first. Requirements F-8, D-1.

Owns: `tests/fixtures/github-tls/**` (remove `leaf.key`, `leaf.pem`, `ca.pem`; keep a README), a new generator (for example `tests/fixtures/github-tls.ts`), `tests/fixtures/fake-github.ts`, `e2e/fixtures/collector-network.cjs`, `e2e/research-journeys.spec.ts` (only where it loads the CA), the tests that load these files, `package.json`/`package-lock.json` (pkijs as an explicit devDependency at exactly 3.4.1, the version already in the lockfile), `docs/specification/research-journeys.md`.

Must hold: each test process generates a fresh P-256 CA and a leaf for `api.github.com` and `artifacts.invalid` with Node's WebCrypto plus pkijs, writes them under its own mkdtemp, and passes the CA path where `ca.pem` was used (`NODE_EXTRA_CA_CERTS` for the collector child, the e2e preload). No private key is written into the repository. The CA's private key is never written to disk at all. Every existing test that used the fixture stays green with unchanged assertions.

Pre-mortem: the e2e preload runs in Electron's main before the generator exists (pass the generated paths through the harness environment the journeys already use); a certificate missing SAN or EKU makes Node's TLS reject it only on Windows; the generated files left behind in tmp; the lockfile changes more than the one devDependency.

Verification: the collector protocol, network and journeys-network tests; `npx playwright test --list`; the kit's `doctor` in the repo root no longer reports `private-key-block` (run `node /root/.agents/research-kit/bin/doctor.mjs` and quote only the secret line; never print environment values); Windows CI is the lead's.
