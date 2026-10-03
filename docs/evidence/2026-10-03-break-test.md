# Break test, 2026-10-03

A run of the repository's `break-test` skill against `main` at `df7862e`, on a Linux container, by an agent session. It probed the build and test suite for realistic failures, proved each one with a command, and applied four small fixes as separate commits on `claude/beautiful-meitner-sgve0p`. Every statement below is backed by a command that was run and output that was read; where something was not run, the *Not probed* section says so.

## Overview

| Item | Value |
|------|-------|
| Stack | Electron 44.4.5 desktop app; TypeScript 5.9; esbuild bundle; vitest 5 (706 tests in 48 files); Playwright e2e; Windows-only native helper (Zig) |
| CI | one GitHub Actions workflow, `windows-latest` only (`.github/workflows/windows.yml`) |
| Gate used here | `npm ci` · `node scripts/prepare-research-kit.mjs` · `node scripts/check-handoff.mjs` · `npm run typecheck` · `npm run lint` · `npm run build` · `npx vitest run --reporter=json` |
| Gate duration | about 2 minutes; the test step 91 to 99 seconds |
| Environment | Linux 6.18 container, 4 CPUs, running as root. The container's default Node was 22.22.0; Node 24.21.0 (the `.node-version` pin) was installed into a session-local nvm directory for the run. npm 11.19.0. HTTPS through the session proxy. |
| Baseline | 3 full gate runs on an untouched clone: 706 tests, 632 passed, **74 failed, identical set all three times**, 0 intermittent. The 74 are the documented Linux set (every one needs the Windows native helper: `WINDOWS_REQUIRED`, `COMMAND_UNAVAILABLE`, `RUNTIME_STOP_UNCONFIRMED` and results downstream of them, in `research-kit` 20, `managed-ollama` 11, `git` 10, `commands` 8, `guarded-process` 7, `owned-transport` 7, `command-broker` 6, `owned-connection` 3, `hardware` 1, `scheduler` 1). |
| Isolation | pinned-branch setup: all probes in throwaway clones under the session scratch directory; fixes committed on `claude/beautiful-meitner-sgve0p`; the full gate re-run in the real checkout on the final state (identical to baseline) |
| Fix commits | `4324a79` F1 · `bcb121b` F2 · `c5791a2` F3 · `9fb5dce` F4 |
| External facts | Research-Kit project [`docs/research/2026-10-03-break-test-external-facts/`](../research/2026-10-03-break-test-external-facts/research/BRIEF.md): four unknowns closed from the owner's pages, gate `PASS` (keyless transport, 19 warnings, 0 blocking); the kit ran from the user's checkout because the container had no deployed copy |

Every retain-or-revert decision compared the **set of failing test names** (from the JSON reporter) with the baseline set, not the count.

## Findings

> **[F1] An unsupported Node version installs and passes the whole gate silently** (Low, Likely)
> Repro: with Node 22.22.0 and npm 10.9.4 on PATH, `npm ci && node scripts/prepare-research-kit.mjs && npm run typecheck && npm run lint && npm run build && npx vitest run`
> Observed: `npm warn EBADENGINE Unsupported engine { package: 'moonaliza@0.8.1', required: { node: '>=24.20.0 <25' }, current: { node: 'v22.22.0', npm: '10.9.4' } }`, then `added 477 packages` and a test result identical to the Node 24 baseline (706 tests, 74 failures, same set).
> Cause: `engines` in package.json is advisory unless `engine-strict` is set (E-10: with it, npm "will stubbornly refuse to install (or even consider installing) any package that claims to not be compatible with the current Node.js version", dependencies included; `--force` overrides); nothing else in the repository checks the Node version. A contributor on the wrong Node gets a green local run that says nothing about the pinned runtime, and under npm 10 the `allowScripts` policy in package.json does not exist (E-12: it shipped in npm 11.16.0). A committed project `.npmrc` is npm's own documented way to make a setting apply to every `npm ci` (E-11).
> Action: fixed, commit `4324a79` (`.npmrc` with `engine-strict=true`).
> Verification: repro now fails at install with `npm error code EBADENGINE ... Required: {"node":">=24.20.0 <25"}`; under Node 24.21.0 `npm ci` succeeds twice in a row; full gate in the real checkout identical to baseline.

> **[F2] README's Verify list omits a check CI enforces** (Low, Likely)
> Repro: compare `README.md` "Verify" with `.github/workflows/windows.yml` and HANDOFF.md.
> Observed: CI and HANDOFF run `node scripts/check-handoff.mjs`; the README list did not.
> Cause: documentation drift.
> Action: fixed, commit `bcb121b` (one line added to the README block).
> Verification: `node scripts/check-handoff.mjs` → `{"sourceFiles":81,"included":76,"metadataOnly":5,"linksChecked":103}`; `npx vitest run tests/handoff.test.ts` → 3 passed.

> **[F3] First-run kit preparation without network dies with a raw stack** (Low, Possible)
> Repro: in a clone with no `.build/`, `unshare -rn node scripts/prepare-research-kit.mjs` (no network)
> Observed: git's `fatal: unable to access 'https://github.com/StepenkoAnatoli/Research-Kit.git/'`, followed by `Error: Command failed: git -c core.longpaths=true clone ...` with a Node internal stack, `status: 128, ... stdout: null, stderr: null`.
> Cause: the clone's `execFileSync` was not caught; the script explained neither that the first run needs github.com nor that later runs reuse the clone.
> Action: fixed, commit `c5791a2` (one try/catch, one sentence).
> Verification: repro now ends with `Error: Could not clone the external Research Kit into .build/research-kit-pin. The first run needs access to github.com; later runs reuse the clone.` (exit 1). With a pin present and no network: `Prepared external Research Kit fcde0e6…; 100 runtime files verified` (exit 0). Online, real checkout: same success line.

> **[F4] A leftover empty pin directory makes every later preparation fail** (Low, Unlikely)
> Repro: `mkdir -p .build/research-kit-pin && node scripts/prepare-research-kit.mjs`
> Observed: `fatal: not a git repository: '.../.build/research-kit-pin/.git'` then `Error: Command failed: git --git-dir ... fetch --quiet origin fcde0e6…` with a raw stack; the only recovery was knowing to delete the directory.
> Cause: the script treated the directory's existence as proof of a clone.
> Action: fixed, commit `9fb5dce` (test for `.build/research-kit-pin/.git` instead).
> Verification: repro now clones and prints `100 runtime files verified` (exit 0); a second run reuses the clone; offline with a real pin still succeeds; eslint clean.

## Applied fixes

| Commit | Finding | Files |
|--------|---------|-------|
| `4324a79` | F1 | `.npmrc` (new) |
| `bcb121b` | F2 | `README.md` |
| `c5791a2` | F3 | `scripts/prepare-research-kit.mjs` |
| `9fb5dce` | F4 | `scripts/prepare-research-kit.mjs` |

Final gate on the real checkout with all four: install, prepare, handoff, typecheck, lint, build pass; tests 706 / 632 passed / 74 failed, failure set identical to baseline.

## Rejected fixes

None attempted and reverted.

## Remaining risks

Ranked. None of these was fixed because each needs a decision the project owner should make.

1. **`npm audit`: 8 high-severity advisories, all in development dependencies** (Low, Possible). Repro: `npm audit`. Observed: all eight sit under `electron-builder@26.15.3` (`@electron/get <=4.0.3` via `got`, `cacheable-request`, `http-cache-semantics`, `app-builder-lib`, `dmg-builder`, `electron-builder-squirrel-windows`). `npm audit --omit=dev` → `found 0 vulnerabilities`. npm's proposed fix is `electron-builder@26.5.0`, which is a downgrade flagged as breaking. Decision: whether to pin a different electron-builder or accept the advisories for a packaging tool that runs only on `workflow_dispatch`.
2. **`allowScripts` names only `better-sqlite3`; npm 11 lists two skipped scripts on every install** (Low, Likely). Repro: `npm ci` or `npm install-scripts ls`. Observed: `2 packages have install scripts not yet covered by allowScripts: electron-winstaller@5.4.0 (install: node ./script/select-7z-arch.js), esbuild@0.28.2 (postinstall: node install.js)`. What that means, from the owner's pages: with the field present, npm 11.16.0 and later silently skip the install scripts of every dependency the field does not name and list them at the end (E-08), so the two scripts did not run. esbuild's binary comes from an optional dependency; its postinstall only checks the binary's version and, outside Windows, replaces the `.bin` shim with the binary (E-05), and that optimisation is skipped on Windows anyway (E-06), so the Windows build loses nothing but the version check. electron-winstaller's script selects a 7-Zip binary for Squirrel installers, which this project does not build (`electron-builder --win nsis`). Decision: record `approve` or `deny` entries (`npm install-scripts approve|deny <pkg>`) so the list stops appearing, or leave it. Nothing here is a defect.
3. **No Linux CI, so a Linux contributor's green run is partial by design** (context, not a defect). 74 tests need the Windows helper and fail here; the project documents this set and checks it in Windows CI. Nothing to fix; recorded so nobody reads a Linux pass as a release signal.

## Probe defects

One probe manufactured failures that were not the project's. The first offline run (`unshare -rn npx vitest run`) reported 77 failures, three new, all in `tests/research-collector-protocol.test.ts` (`expected [] to have a length of 1`, `expected [] to include 'api.github.com:443'`). A fresh network namespace has its loopback interface down, and those tests talk to a loopback fake GitHub. With loopback brought up inside the namespace and external network still unreachable (`curl https://registry.npmjs.org/` failed), the three tests passed and the full suite returned the exact baseline set (706 / 74). The three are therefore not findings. The corrected recipe is in the skill's `references/probe-recipes.md`.

## Kit findings

Running Research-Kit's `doctor` at the repository root raised one *critical* unrelated to the research: `tests/fixtures/github-tls/leaf.key:1 matches private-key-block - the key never belongs in this repository (Rule 6)`. The file is the TLS leaf key of the loopback fake GitHub used by the collector tests (`tests/fixtures/github-tls/`), not a credential to any service, but the kit's rule flags every private-key block and will keep doing so for every agent that runs `doctor` here. Decision for the owner: generate the fixture key at test time, or accept the standing blocker. Not changed in this PR.

The kit itself behaved as documented. Two things cost time and are now in the skill's `references/research-kit.md`: docs.npmjs.com renders client-side, so keyless captures hold only a title and the documentation's source files at the npm 11.19.0 tag were used instead; and a quote must sit on one line of the capture. The `prior.mjs` expectation was not registered before the first collection, so the corpus carries no prior.

## Probes run

Commands are relative to the repository root and were run in throwaway clones unless stated. "Baseline" means the failure set equalled the baseline set.

| # | Probe | Command | Result |
|---|-------|---------|--------|
| 1 | Clean checkout | fresh `git clone`, then the gate | passes through build; tests = baseline |
| 2 | Lockfile integrity | `npm ci` (Node 24.21.0, npm 11.19.0) | `added 477 packages`, no lockfile drift |
| 3 | Generated code | `node scripts/generate-research-fixtures.mjs --inventory-only`; `node --import tsx scripts/capture-collector-golden.ts`; then `git status --porcelain` | `15 recorded reports reproduced`; 15 collector goldens re-captured; **no tracked file changed** |
| 4 | Toolchain | full gate under Node 22.22.0 / npm 10.9.4 | passes identically → **F1** |
| 5 | Environment variables | `env -i PATH="$PATH" HOME=/nonexistent npx vitest run` | baseline. The only variables the code reads are Windows (`SystemRoot`, `USERPROFILE`), e2e (`MOONALIZA_TEST_EXECUTABLE`, `MOONALIZA_E2E_*`) or fixture-internal (`OLLAMA_*`, `OPENAI_API_KEY` as a leak canary); none can select a real service |
| 6 | Test order | `npx vitest run --sequence.shuffle --sequence.seed=1`; same with `--sequence.seed=20261003` | baseline both times (the `node` project runs with `isolate: false`) |
| 7 | Flakiness | the six timing-sensitive files (`research-collector-supervisor`, `research-import`, `scheduler`, `research-jobs-state`, `download`, `provider-stream`) 10 times: `npx vitest run <files>` | 10 of 10 runs: 114 tests, the same single baseline failure (`scheduler`), 0 intermittent |
| 8 | Timezone and locale | `TZ=Pacific/Kiritimati LANG=C LC_ALL=C npx vitest run`; `TZ=America/St_Johns LANG=de_DE.UTF-8 LC_ALL=de_DE.UTF-8 npx vitest run` | baseline both |
| 8b | Line endings | `git clone -c core.autocrlf=true`, then `node scripts/check-handoff.mjs`, `node scripts/prepare-research-kit.mjs`, and the hash-sensitive tests (`research-kit`, `handoff`, `research-import`, `research-collector-protocol`, `research-kit-retain`) | 313 files checked out CRLF; handoff and inventory checks pass; tests = baseline (`.gitattributes` protects every hashed file) |
| 9 | Network | `unshare -rn npm ci --cache <empty>` → `EAI_AGAIN registry.npmjs.org` (install needs the registry, as any project); `unshare -rn node scripts/prepare-research-kit.mjs` with no pin → **F3**, with a pin → passes; full suite with no external network and loopback up | **no test needs the network** once installed and prepared (baseline) |
| 10 | Filesystem | `git ls-files -s` for executable bits (all 100644; scripts run through `node`); empty pin directory → **F4** | — |
| 11 | Resource limits | `(ulimit -n 256; NODE_OPTIONS=--max-old-space-size=512 npx vitest run)` | baseline |
| 12 | Dependency health | `npm audit`, `npm audit --omit=dev`, `npm ls --all` | risks 1 and 2 above; `npm ls` reports no invalid or missing entries |
| — | Documented commands vs CI | README, HANDOFF, workflow compared by hand | **F2** |

## Not probed

- **Native helper build, Electron runtime check (`scripts/check-runtime.cjs`), Playwright e2e, `npm run package:win`**: Windows only. The 74 baseline failures are the visible edge of this gap.
- **Read-only or permission-denied paths**: the session ran as root, for whom permission bits are not enforced; the result would have been meaningless.
- **Very long temporary paths**: the project's known case (Chromium socket paths) is e2e-only.
- **Other supported Node minors** (for example 24.20.0): only 24.21.0 and 22.22.0 were available; 24.20.0 was not installed.
- **Parallel test files or concurrent tests** (`--maxWorkers`, `--sequence.concurrent`): the config pins `maxWorkers: 1` and `fileParallelism: false` with a stated reason; probing a mode the project rules out would not describe a realistic failure.
- **Probes that reach real services**: none exist in this suite; no provider or GitHub credential is read by the build or tests.

## Summary

On Linux the build is reproducible and quiet: three baseline runs and every probe (order, timezone, locale, bare environment, file-descriptor and memory limits, no network, CRLF checkout, regenerated goldens) returned the identical 74-member failure set, all of it the documented Windows-helper gap, and ten repeats of the timing-sensitive files showed no flake. The four fixes are small (an `.npmrc`, a README line, two lines in a provisioning script) and each was shown to remove the failure it names without changing the gate. The most important open items are decisions, not defects: the eight development-only audit advisories under electron-builder, and the test fixture private key that Research-Kit's `doctor` refuses. The two facts the probes could not settle were closed through Research-Kit and are cited above by evidence row. Review with `git log --oneline df7862e..` and `git diff df7862e...HEAD`.
