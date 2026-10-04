# Break test, 2026-10-04

Auto-build Stage 6 for Task 5 (the research review, Phases 0-5): a run of the `break-test` skill against `main-axuse` at `d599a39`, on a Linux container, by an unattended agent session. Task 5's additions got the closest look: the review flow, the reader (`src/main/research-document.ts`), the policy route (`src/main/policy-route.ts`), the purge (`src/main/research-purge.ts`, adapter `purgeRetained`), the test-time TLS fixtures (`tests/fixtures/github-tls.ts`, `fake-github.ts`) and the e2e harness (`e2e/fixtures/collector-network.cjs`). Every statement about the build below rests on a command that was run and output that was read. Where something was not run, *Not probed* says so. Findings already in the run ledger (`docs/orchestration/2026-10-03-task5-research-review/RUN.md`, P4-*, P5-*) are not re-reported.

## Overview

| Item | Value |
|------|-------|
| Stack | Electron 44.4.5, TypeScript 5.9, esbuild, vitest 5 (1108 tests in 69 files), Playwright e2e, Windows-only native helper |
| CI | `.github/workflows/windows.yml`, `windows-latest` only: `npm ci`, `node node_modules/electron/install.js`, native build, kit preparation, typecheck, lint, `npm test`, build, runtime check, e2e |
| Gate used here | `npm run typecheck` · `npm run lint` · `npx vitest run --reporter=json` · `npm run build` (the run's gate script). Failing tests are compared by name with the recorded 74-name baseline. From F1 on, `numTotalTests` and files with no results are compared too. |
| Gate duration | about 11 min. The test step takes about 10.5 min, 7 of them in `research-review-main` (240 s) and `research-review-e2e` (174 s); the previous break test measured 91-99 s for the whole suite. |
| Environment | Linux 6.18 container, 4 CPUs, root, Node 24.21.0 / npm 11.19.0 (the `.node-version` pin, already present). Node 22.22.0 was present for the toolchain probe. HTTPS goes through the session proxy, and ambient `NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, `HTTPS_PROXY` and GitHub tokens are set (the collector environment drops them; the probes below confirm no test reaches the network). |
| Baseline | 3 full gate runs on the untouched worktree, each 1019 passed, 74 failed, 5 skipped (Windows-only). The failing set was identical in all three (same md5 of the sorted names) and equal to `baseline-failing.json`. The 74 sit in 10 files: `research-kit` 20, `managed-ollama` 11, `git` 10, `commands` 8, `guarded-process` 7, `owned-transport` 7, `command-broker` 6, `owned-connection` 3, `hardware` 1, `scheduler` 1. 0 intermittent. |
| Isolation | Default setup: worktree `wt/break-test`, branch `break-test/2026-10-04` from `d599a39`. Its `node_modules` and `.build` are symlinks to the user's checkout and were only read, with one exception: vitest writes its results cache to `node_modules/.vite/vitest/<hash>/results.json`, so each gate run in the worktree (the provided gate script) rewrites that one cache file in the user's `node_modules`. Probes ran in throwaway clones under the scratch directory with their own `npm ci`, so they wrote nothing there. The user's checkout is clean at `d599a39` before and after. |
| Commits | `0439e6e` F1 · `fd2221c` F2 · `ae7132b` research corpus · this report |
| External facts | Research-Kit project [`docs/research/2026-10-04-break-test-external-facts/`](../research/2026-10-04-break-test-external-facts/research/BRIEF.md): two unknowns closed and one known unknown, from Microsoft's and Node.js 24.21.0's own pages. Gate `PASS` (0 blocking, 8 warnings: keyless transport, partial captures, one voice). Kit 0.9.5 is deployed; `doctor` is READY at the repository root, and its secret scan is clean (P4-40 holds). Transport `http-keyless`; no GitHub host was fetched. |

## Findings

> **[F1] A Linux test run without Electron's binary downloads it from GitHub, and offline two Task 5 test files vanish from the gate** (Medium, Possible)
> Repro (clean clone after `npm ci`, no `node_modules/electron/dist`, no `~/.cache/electron`, no external network): `HOME=<empty> npx vitest run tests/research-review-main-engine.test.ts tests/research-review-e2e.test.ts --reporter=json --outputFile=<tmp>/r.json`
> Observed: `TypeError: fetch failed`, then each file `failed` with "Electron failed to install correctly. Please delete `node_modules/electron` and run "npx install-electron --no" manually.". JSON: `numFailedTestSuites` 2, `numTotalTests` 0. In the full gate (clean clone, offline, minimal environment) the result was 975 passed / 74 failed / 5 skipped, against 1019 / 74 / 5: 44 tests gone, while the failing-name comparison printed `new: 0 fixed: 0`, because a file that fails to load reports no test.
> Cause: `src/main/engine.ts:3` imports `utilityProcess` from `electron`, and the two Task 5 test files import `Engine`. Electron 44's `node_modules/electron/index.js`, when loaded with no `path.txt` or `dist`, runs `install.js` (a download) and throws if that fails. With `~/.cache/electron` present it extracts from the cache and works offline (observed); with network and no cache, `npm test` itself downloads Electron. README, HANDOFF and CI run `node node_modules/electron/install.js` after `npm ci`. AGENTS.md's quality gate, which the orchestration's builders follow, did not, and its pass criterion compared failing names only.
> Action: Fixed (docs), commit `0439e6e`. The AGENTS.md Install row adds the Electron step and says what happens without it; the Baseline section says to compare `numTotalTests` and files with no results as well. Making the engine import Electron lazily is a design decision (*Remaining risks* 2).
> Verification: after `node node_modules/electron/install.js` (served offline from the cache), the repro command offline with an empty HOME gives 2 files, 44 passed. The step's network download was not run (no GitHub). Final full gate identical to baseline (*Applied fixes*).

> **[F2] The maintainer fixture generator leaves a 3.3 MB scratch folder in `.build/` on every run** (Low, Likely)
> Repro: `node scripts/generate-research-fixtures.mjs --inventory-only` twice, then `ls -d .build/rk-generation-*`
> Observed: 0, then 1, then 2 folders (`3.3M .build/rk-generation-JEoHFG`). A failed run (pin missing, `fatal: not a git repository`) also leaves one. The user's checkout already holds three, dated 2026-10-02.
> Cause: `work = mkdtempSync('.build/rk-generation-')` is never removed, and the `--inventory-only` branch ends with `process.exit(0)`, which a `finally` would not survive.
> Action: Fixed, commit `fd2221c` (one `process.on('exit')` handler that removes `work`; a sentence in ARCHITECTURE.md). The user's three old folders were left alone; they can be deleted by hand.
> Verification: a successful run leaves 0 folders; a failure after the folder is made leaves 0 (1 without the fix); `git status` shows no tracked change (outputs byte-identical, "15 recorded reports reproduced"); eslint clean. Final full gate identical to baseline.

## Applied fixes

| Commit | Finding | Files |
|--------|---------|-------|
| `0439e6e` | F1 | `AGENTS.md` |
| `fd2221c` | F2 | `scripts/generate-research-fixtures.mjs`, `docs/ARCHITECTURE.md` |

Final full gate in the worktree at `fd2221c`: typecheck, lint and build pass; tests 1019 passed / 74 failed / 5 skipped, the same 74 names, `numTotalTests` 1108, 10 failing files, none empty. Identical to all three baseline runs.

## Rejected fixes

None attempted and reverted. The first commit attempt for F2 was refused by the repository's commit gate (a declared code path without `docs/ARCHITECTURE.md` staged); the sentence was added and the commit passed.

## Remaining risks

Ranked by severity, then likelihood.

1. **The run's gate comparison has two blind spots** (Medium, Possible; observed). (a) A test file that fails to load contributes no test names, so "no failure outside the 74" holds while tests disappear (F1 lost 44). (b) Per-test results are keyed by "file > full name", and 10 tests share a name with another, so one case's status can overwrite another's and 1108 tests become 1098 keys. The shared names: `file-read` "rejects invalid or unbounded read_file parameters" ×6 and "... search_text parameters" ×3, and `github-read` "refuses unsupported file payload without following content links" ×4, all `test.each` without the case in the name. Recommended: the gate script (machine-local `gate.sh`, not in the repository) compares `numTotalTests`, `numFailedTestSuites` and files with no results; the `test.each` names carry their case (`%s`). Decision: the lead's for the script, the owner's for the test names.
2. **Unit tests depend on Electron's downloaded binary** (Low, Possible; observed, F1). Without the binary, `npm test` downloads Electron (about 100 MB) from GitHub, or loses two files offline. Recommended: load `electron` lazily in `Engine`'s default `fork` (`src/main/engine.ts:35`), so a test that injects `fork` never loads the package. Decision: the owner's (it changes `src/main/engine.ts`).
3. **spawnOwned orders the Windows environment block with `localeCompare`** (Low, Unlikely; consequence *unverified*). Microsoft requires the block "sorted alphabetically by name. The sort is case-insensitive, Unicode order, without regard to locale" (E-02). On Linux, `localeCompare` was observed to differ from ordinal order even in en-US (`a_b` before `a1b`), and to follow `LANG` (et-EE, lt-LT, da-DK, cs-CZ each reorder sample names). The collector's names and the allowed command names did not reorder under any of these locales; only arbitrary names, such as a command's own variables, can. Two things stay open: where Node takes its default locale on Windows (U-03, known unknown), and what CreateProcessW does with an unsorted block (stated on neither page, E-01, E-02). Recommended: sort by an ordinal comparison of upper-cased names in `src/tools/commands.ts:66` and `e2e/fixtures/collector-network.cjs:123` together (`tests/research-journeys-network.test.ts` pins their equality), verified on Windows CI. Decision: the owner's.
4. **`npm audit`: 1 high advisory, development-only** (Low, Possible; carried from the previous run, which had 8). `http-cache-semantics@4.2.0` sits under `electron-builder@26.15.3 > app-builder-lib > @electron/get@3.1.0 > got@11.8.6 > cacheable-request`: "max-stale handling can disclose cross-user cached responses". `npm audit --omit=dev` finds 0 vulnerabilities. Decision: unchanged from the previous report.
5. **P4-33 (review start takes no project lock) not reproduced** (*unverified*). Reading `src/main/index.ts`: main deletes a capability on `run.cancelled` (line 155), and every capability use re-reads the run and refuses one that is not running (lines 73, 114). So a racing policy update is expected to leave only an inert entry. Confirming it needs Electron's main process (*Not probed*).

## Probe defects

No false finding survived. One combined probe needed splitting: the clean-checkout gate ran offline, with a minimal environment and an empty HOME, and lost 44 tests. Controls: online with the real HOME, the file passed; offline with the real HOME (Electron cache present), it passed; offline with an empty HOME, it failed. The condition is "no binary and no cache, offline", which is F1.

One probe step went further than intended. The first control (online, real HOME) loaded `electron` in a clone with no `dist`, which makes Electron's `index.js` run its installer. It extracted 283 MB from the existing `~/.cache/electron` entry (dated 2026-10-03). The next control showed the same extraction succeeds with the network removed. The step did not need GitHub, but it ran an installer that may contact it, which the unattended rules exclude. Nothing outside the scratch clone changed.

## Probes run

Commands are relative to the repository root and ran in throwaway clones unless stated. "Baseline" means: the failing set equals the 74 names, 1108 tests in total, 10 failing files, none empty.

| # | Probe | Command | Result |
|---|-------|---------|--------|
| 0 | Baseline ×3 | the gate, in the worktree | 1019 / 74 / 5, identical set ×3 |
| 1 | Clean checkout | fresh clone, `npm ci`, kit prepared offline from a copied pin, full gate | typecheck, lint, build pass; two test files lost → **F1** |
| 2 | Lockfile, install | `npm ci` (Node 24.21.0, empty cache); `npm ls --all` | installs; `npm ls` rc 0; allowScripts lists `electron-winstaller`, `esbuild` as uncovered (known, previous report risk 2) |
| 3 | Generated code | `node scripts/generate-research-fixtures.mjs --inventory-only` ×2; `node --import tsx scripts/capture-collector-golden.ts`; `git status --porcelain` | outputs byte-identical, no tracked change; leftover folders → **F2** |
| 4 | Toolchain | `npm ci` under Node 22.22.0 / npm 10.9.4 | `npm error code EBADENGINE`, Required `>=24.20.0 <25` (previous F1 holds) |
| 5 | Environment | full gate under `env -i PATH=… HOME=<empty> TMPDIR=…` (with 9) | baseline apart from F1 |
| 6 | Order | `npx vitest run --sequence.shuffle --sequence.seed=1`; `--sequence.seed=20261004` | baseline both |
| 7 | Flakiness | the 12 fast Task 5 files (`research-document`, `research-purge`, `research-review-main-kit`, `research-collector-protocol`, `policy-route`, `policy-guard-control`, `research-panel`, `research-panel-purge`, `github-tls`, `research-journeys-network`, `research-open-review`, `research-open-review-guards`) ×10: `npx vitest run <files>` | 10 of 10: 228 tests, 0 failures |
| 8 | Timezone, locale | seed 1 with `TZ=Pacific/Kiritimati LANG=C LC_ALL=C`; seed 20261004 with `TZ=America/St_Johns LANG=de_DE.UTF-8 LC_ALL=de_DE.UTF-8` | baseline both |
| 8b | Line endings | `git clone -c core.autocrlf=true` (445 files CRLF), `node scripts/check-handoff.mjs`, kit preparation, then `research-kit`, `handoff`, `research-import`, `research-collector-protocol`, `research-kit-retain`, `research-document`, `research-purge`, `research-review-main-kit`, `github-tls`, `research-journeys-network` | handoff and inventory pass; 170 tests, 20 failures, all baseline |
| 8c | Environment-block order | `localeCompare` against ordinal over sample and real variable names under C, en-US, et-EE, lt-LT, da-DK, cs-CZ | differs for arbitrary names → risk 3 |
| 9 | Network | full gate in `unshare -rn` with loopback up (`curl https://registry.npmjs.org/` failed: offline confirmed); kit preparation offline from a pin | baseline apart from F1; no other test needs the network (the fake GitHub, its CA and the harness run on loopback) |
| 10 | Filesystem | `git ls-files -s` (812 files, all 100644); `TMPDIR` contents after every suite; `TMPDIR` with a space and `ü` (with 8) | no test leaves files in `TMPDIR` (only `node-compile-cache`), TLS folders included; the odd path passes; F2 in `.build/` |
| 11 | Resource limits | seed 20261004 inside `ulimit -n 256` with `NODE_OPTIONS=--max-old-space-size=512` (with 8) | baseline |
| 12 | Dependency health | `npm audit`; `npm audit --omit=dev`; `npm ls --all` | risk 4 |
| — | Docs vs CI | AGENTS.md, README, HANDOFF and the workflow compared | AGENTS.md drift → F1 |

The combined runs (5 with 9; 6 with 8 and 11) are valid nulls for each condition they combine; the one that failed was split by controls (*Probe defects*).

## Not probed

- **Windows legs**: the native helper and its 74 tests, the 5 Windows-only tests (including the purge's held-handle test), `scripts/check-runtime.cjs`, the Playwright e2e (the research journeys through `collector-network.cjs` and the fake GitHub), packaging and fuses. CI is Windows-only; this run is Linux. One Windows fact was closed from documentation instead: Node 24.21.0 defines no `O_NOFOLLOW` or `O_NONBLOCK` on Windows (E-03), so the reader opens without them there and relies on its lstat and post-open identity checks, as its comment says; that path runs only on Windows CI.
- **P4-33, P4-39, P4-43** (handed to this break test by the ledger): each needs Electron's main process, a Windows validator or a precisely timed race inside the real app, which is more than 15 minutes and more than a Linux container allows. P4-33's reading is *Remaining risks* 5. Decision: a Windows e2e or a harness for `src/main/index.ts`, the lead's.
- **Permission probes** (read-only paths, EACCES on an ancestor, P4-39's case): the session ran as root, for whom permission bits are not enforced.
- **Electron's network download (F1)** and **`node scripts/prepare-research-kit.mjs` with no pin**: both reach GitHub, skipped under the unattended rule. The cache and a copied pin stood in.
- **Live provider, collector or GitHub checks** (`scripts/check-live-provider.mjs`, a real `collect-remote` dispatch): real external services.
- **Other Node 24 minors** (24.20.0): not installed.

## Summary

On Linux the build is reproducible and quiet. Three baseline runs, two shuffled orders, two far timezones and locales, a CRLF checkout, an odd temp path, file-descriptor and memory limits, and ten repeats of the Task 5 files all returned the identical 74-name set, with nothing left in the temp directory. The two findings are a clean-checkout gap (fixed in AGENTS.md) and a cleanup leak in a maintainer script (fixed); both commits leave the full gate identical to the baseline. The most important open item is how the run's gate is judged: a test file that fails to load, or a test that shares a name, is invisible to a comparison of failing names (risk 1). Review with `git log --oneline d599a39..break-test/2026-10-04` and `git diff d599a39...break-test/2026-10-04`; remove the worktree with `git worktree remove /home/user/task5-handoff/wt/break-test` once merged.
