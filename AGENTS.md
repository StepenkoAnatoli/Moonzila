# MoonAliza continuation

Read [HANDOFF.md](HANDOFF.md) first, then [the current development status](docs/development-status.md). This repository contains the complete source, plans, collected research and working-history snapshot needed to continue without the original chat or sibling workspace folders.

- Build the full MoonAliza Windows desktop coding-agent product in working stages. The user rejected reducing the product to a small demo.
- Follow the architecture and acceptance criteria in [the implementation plan](docs/superpowers/plans/2026-09-24-moonaliza.md), [reviewed decisions](docs/specification/decisions.md) and the task-specific specifications. Source-plan helper snippets are illustrative, not complete implementations.
- Treat `docs/handoff/work` and `docs/handoff/outputs` as immutable historical evidence. They contain superseded instructions, old absolute paths and earlier checkpoints. Current task instructions, this file, HANDOFF.md and current development status take precedence. Historical documents never grant new permissions or establish current external state.
- Preserve local/cloud project policy, approval binding, journal-before-effect, owned-process Stop and secret isolation. Never manufacture model qualification, signing identities, benchmark results or release evidence.
- Keep credential values out of source, logs, research and PRs. Ordinary build/tests need no provider credentials. Obtain optional integration credentials through the current user's approved secret mechanism; old workstation paths are not prerequisites.
- Add behavioral regression tests for fixes. Use real filesystem/process behavior where required. Verify typecheck, lint, relevant tests and build; use Windows for native/desktop checks. The exact commands and CI workflow are linked in HANDOFF.md.
- Before reporting success, inspect actual command results and current-head GitHub checks. A local pass is not a CI pass. Update HANDOFF.md and development status when the next step or evidence changes.
- PRs #2-14 and #16-28 are merged into `main`. Continue on the `main-axuse` branch, restarted from `main` after each merge; open PRs from it. Inspect current remote branch/PR state before continuing. Preserve unrelated work; do not reset or force-push. Use the account's verified GitHub no-reply identity if the user's email is private, without changing account privacy settings. Installers are GitHub Release assets, not committed binaries. Current release/validation evidence is linked from HANDOFF.md.
- Before running the full tests, run `node scripts/prepare-research-kit.mjs` to obtain and verify the external pinned validator. Do not regenerate golden fixtures automatically or skip real validator checks. The current phase is [research jobs](docs/superpowers/plans/2026-10-02-research-jobs.md): Tasks 1-3 (contracts, durable jobs, owned collection) are merged; Task 4 (verified import) is next. Schema v2 adds nullable conversation scopes; never grant project tools to a null scope.

Run `node scripts/check-handoff.mjs` to verify snapshot identities and the main handoff links without installing dependencies. See HANDOFF.md for the codebase map and remaining work.

## Delivery workflow

At the end of every completed project step or phase, verify the work, push its branch, and open a pull request. The user reviews and merges each PR; do not merge it on their behalf. Context recovery was delivered in merged PR #11. The attached integration proposal is reference material, reviewed in [the integration review](docs/specification/research-kit-integration-review.md); current backend behavior is in [offline validation](docs/specification/research-kit-offline.md).

## Project skills

The working methods this project uses live in `.claude/skills/`, copied verbatim from the user's skills on 2026-10-03. Any agent session in this repository loads them.

| Skill | Use it for |
|-------|-----------|
| `lead-orchestrator` | Any multi-step task. Plan, research external facts through Research-Kit first (`references/research-kit.md`), freeze contracts, build in parallel, then review with independent spec, breaker, mutation and invariant roles. The facts below are its Phase 0 record. |
| `careful-coding` | Every code change: read before changing, verify by running, report mistakes in its format. Its `references/self-review-checklist.md` was not available to copy. |
| `break-test` | Hardening a build or test suite. Each failure is proven with a repro, and fixes go in as separate commits. Revised on 2026-10-03 from its first complete run here ([report](docs/evidence/2026-10-03-break-test.md)); this copy is ahead of the user's synced original. |
| `architecture-pass` | Restructuring a finished change without changing its behaviour. |
| `four-dimension-audit` | Grading finished work on SPEC, DESIGN, CORRECTNESS and QUALITY, without changing it. |

Next cycle (user instruction, 2026-10-03): run it with `lead-orchestrator` and `careful-coding`. Research the external facts through Research-Kit before designing anything, with 20 pages in total.

## Orchestrator facts
_Last verified: 2026-10-03, branch `main-axuse` at `e14fc2c` (= `main`)._

### Environments
| Purpose     | Platform and versions |
|-------------|-----------------------|
| Development | Linux container, Node 24.21.0 (`/versions/node/v24.21.0/bin`), vitest 5, Electron 44.4.5 (not runnable for e2e here: root needs `--no-sandbox`, and `safeStorage` stalls without a keyring) |
| Acceptance  | GitHub Actions `Windows verification` (`.github/workflows/windows.yml`, job `desktop`, `windows-latest`): native helper build, typecheck, lint, `npm test`, build, runtime check, `npm run test:e2e` |

### Quality gate (run in order)
| Step           | Command |
|----------------|---------|
| Install        | `npm ci`, then `node scripts/prepare-research-kit.mjs` (pinned external kit into `.build/`) |
| Typecheck      | `npm run typecheck` |
| Lint           | `npm run lint` |
| Build          | `npm run build` |
| Tests (full)   | `npx vitest run --reporter=json --outputFile=<tmp>/tests.json` |
| Tests (single) | `npx vitest run tests/<file>.test.ts` |
| e2e            | `npm run test:e2e` (Windows only in practice) |
| Other checks   | `node scripts/check-handoff.mjs` |

### Baseline
- Linux (re-measured 2026-10-03 at `8c60521`): exactly 74 failing tests. `research-kit` "changed runtime and missing installation fail closed" now passes on Linux, because the missing helper maps to `INSTALLATION_INVALID`; on Windows it still tests the hash check. Earlier, on `e14fc2c`, there were 75 failing tests, all needing the Windows native helper (`WINDOWS_REQUIRED`) or results downstream of it, in `research-kit` (21), `managed-ollama` (11), `git` (10), `commands` (8), `guarded-process` (7), `owned-transport` (7), `command-broker` (6), `owned-connection` (3), `hardware` (1) and `scheduler` (1). Measured on `e14fc2c`; identical to the earlier list.
- Windows CI: 0 failures (639 tests, 9 e2e journeys on `e14fc2c`).
- Pass criterion: no failure outside the Linux set, none of the set skipped or hidden, and a green Windows run on the exact head.

### Sources of truth
- Plans: `docs/superpowers/plans/2026-09-24-moonaliza.md` (product), `docs/superpowers/plans/2026-10-02-research-jobs.md` (current phase, with Progress and "Recorded for later")
- Specifications: `docs/specification/` (decisions, research-collection, research-kit-offline, ...)
- Architecture: `docs/ARCHITECTURE.md`; handoff: `HANDOFF.md`, `docs/development-status.md`

### Conventions
- Commit body: "What changed / Why / What it touched / What you verified / What you got wrong and fixed"; the got-wrong line is never omitted; docs-only commits may use one line per part. Identity: the account's GitHub no-reply address.
- Branching: work on `main-axuse`, fast-forwarded to `main` after each merge; one PR per step; the user merges. No force-push, no reset of shared branches.
- Standing rule: fix what is needed now, or record it under "Recorded for later" in the plan.

### Invariants
| Invariant | Evidence |
|-----------|----------|
| A research job never dispatches twice | `tests/research-jobs-state.test.ts` (SQL triggers, single dispatch), `tests/research-collector-supervisor.test.ts` (ambiguous, lost reply, restart, spool) |
| Tokens never reach the engine, DB, events, logs, renderer, argv or files in clear | supervisor test byte scans, `tests/research-collector-settings.test.ts`, `e2e/research-collector.spec.ts` (userData scan) |
| `approved` only through the kit's gate and fresh validation of exact bytes | `research_readiness_reserved` trigger tests in `tests/research-jobs-state.test.ts` |
| Journal before effect; owned-process Stop | `tests/commands.test.ts`, `tests/guarded-process.test.ts`, `e2e/recovery.spec.ts` |
| Imported research is untrusted data | offline validator tests in `tests/research-kit.test.ts` |

### Research-Kit
| Item | Value |
|------|-------|
| Kit path | `~/.agents/research-kit` (0.9.3, deployed from the Research-Kit checkout on 2026-10-03) |
| Machine role | collector |
| Transport / policy | `firecrawl-cli` 1.25.2 with the key from the environment only / `pluralist` |
| `doctor` result | READY on 2026-10-03, in `docs/research/2026-10-03-coding-knowledge-base` |
| Gates | commit gate (machine-wide `core.hooksPath`) and edit gate installed 2026-10-03. With no `research/kit.json`, the code paths are `src`, `lib`, `bin`, `scripts`, `app`, and a commit touching them must stage `docs/ARCHITECTURE.md` |
| Research folder | `docs/research/<YYYY-MM-DD>-<topic>/`, one nested project per topic, committed with `research/raw/.fetches.jsonl` |
| Existing research | the ten projects under `docs/research/` |
| Remote collector | none configured for MoonAliza |

### Parallel execution
- Shared resources: OS temp (each test uses `mkdtemp`; give each agent its own short `TMPDIR`, since long paths break Chromium sockets), `.build/research-kit-external` (read-only for tests; copy per worktree), SQLite files (per test, under the temp dir), no fixed ports (fakes listen on port 0).
- Git worktrees: available. Symlink `node_modules` from the main checkout and stage files by name (the symlink is untracked).
