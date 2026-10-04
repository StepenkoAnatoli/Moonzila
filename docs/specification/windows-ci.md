# Windows CI evidence and path-alias repair

Initial source revision `6fbb3c5c5d079efbbb81025cb8d31318ffd290d9` passed 364 local tests but failed both GitHub Windows runs:

- [Initial PR run 36407097176](https://github.com/StepenkoAnatoli/MoonAliza/actions/runs/36407097176)
- [Initial push run 36407091191](https://github.com/StepenkoAnatoli/MoonAliza/actions/runs/36407091191)

Each reached the test step. The PR run reported seven failed tests across command-broker, paths and project-tickets, plus an unhandled rejection. Setup, native compilation, typecheck and lint had passed. A local pass did not establish runner portability.

## Cause and repair

The runner's temporary directory uses the Windows 8.3 alias `C:\Users\RUNNER~1\...`; `realpath` returns `C:\Users\runneradmin\...`. `CommandBroker` canonicalized executable/working-directory paths but compared them with uncanonicalized project and protected roots. This both rejected a legitimate approved working directory and failed to exclude a project-local executable found through an alias. These are production comparison defects, not merely runner configuration differences.

The repair canonicalizes exclusion roots and protected working-directory boundaries, and derives the execution-relative path from the canonical project root. Missing/unreadable excluded roots fail closed. Three new tests use real junction aliases to reproduce valid execution, project/protected executable exclusion and protected-directory enforcement independently of whether a local volume creates 8.3 aliases. All three failed against the previous implementation and passed with the fix.

Two existing tests assumed the returned canonical path equalled the raw temporary path. Their expected values now use the filesystem's canonical root. The command Stop test now observes early rejection while waiting for dispatch, so a failed admission reports its actual error rather than an unhandled rejection plus timeout. No test was skipped or containment guard removed.

## Local verification

### Follow-up desktop failure at smaller window widths

Revision `d93fd20db3028b76f6ace417f6239f42ffb4217c` passed all 370 tests, native/build and Electron runtime checks on both GitHub runners. It reached desktop verification, where four journeys failed because the Project details pane intercepted pointer events over Send. See [the follow-up PR run](https://github.com/StepenkoAnatoli/MoonAliza/actions/runs/36411259612) and [push run](https://github.com/StepenkoAnatoli/MoonAliza/actions/runs/36411255793). The hardware journey passed.

The responsive CSS positioned details as an overlay below 1180px while leaving it open by default. That made Send unusable on smaller desktops. The fix retains details in a dedicated grid column with narrower sidebars and wrapping composer controls. The workbench desktop journey now exercises actual pointer hit testing at window widths 960, 1180, 1440 and 1024, with details open and closed, before sending through the real IPC/model fixture. This regression reproduced the same interception locally before the CSS repair. Tests do not force clicks or hide the details pane to bypass the defect. After the repair, typecheck, lint, build and all five desktop journeys passed again (about 1.1 minutes). The compact-window screenshot was visually checked; Send and details occupy separate areas. Handoff integrity and credential scans remained clean.

### Temporary executable lock during fixture disposal

Revision `1c5abda81793380deeab8b6fa9ede957f7eabc61` passed the complete [push workflow](https://github.com/StepenkoAnatoli/MoonAliza/actions/runs/36413207567), including 370 tests and all five desktop journeys. The separate [PR workflow](https://github.com/StepenkoAnatoli/MoonAliza/actions/runs/36413212928) failed one managed-runtime test during temporary-directory removal: Windows returned `EBUSY` for the copied `ollama.exe`.

The native helper already waits for the root process, zero active Job Object processes, closed process/job handles and drained output before reporting exit; the TypeScript adapter then waits for helper closure. Fixture cleanup now additionally asserts that every observed runtime PID returns `ESRCH` before removing files. Only filesystem removal gets five bounded retries with a 100ms linear delay (1.5 seconds of total retry delay); test execution and lifecycle assertions are not retried. A real PowerShell process holding a temporary read handle reproduced the exact `EBUSY` after the owned runtime had exited. This checks transient file-handle release without accepting a live runtime or silently retaining fixture directories.

The final local run passes **371 tests across 31 files**, with no failed or pending tests, in **152.26 seconds**; retained report `.build/handoff-verified-tests.json`. Typecheck and lint pass. An earlier local full run hit the existing 30-second limit in the wrong-digest rejection case. No test runtime remained running afterward; the unchanged case passed in isolation in 5.67 seconds and in the final full run in 4.56 seconds. Its timeout was not increased and automatic test retries were not added. The timeout's precise environmental cause was not established; both attempts are recorded rather than treating the first as a pass. Application source is unchanged from the complete successful push workflow at `1c5abda`.

### Earlier complete local verification

The initial focused verification passed **33 tests across three files**. The complete repaired source then passed:

- **370 tests across 31 files**, no failed or pending tests, in **159.72 seconds**; report `.build/handoff-ci-tests.json`.
- TypeScript checking, lint, native compilation and application build.
- Actual Electron 44.4.5 / Node 24.21.0 utility-engine and SQLite loading.
- **All five original desktop journeys**, about **1.4 minutes**, at the local default window size: reviewed edits/Undo/Stop; real Git and commands/process-tree Stop/denial; Windows hardware/local-model readiness; restart recovery without command replay; encrypted profiles, IPC inference and durable history. This original local pass did not cover the smaller runner viewport; the follow-up regression above adds that coverage.
- Independent checkout of the staged Git tree: all 76 included snapshot hashes and main handoff links, without dependencies, the old chat or original sibling folders.
- All 219 publishable files scanned against the five supplied credential files, with zero matches; seven archived screenshots visually checked.

The dependency-free handoff verification also runs before dependency installation in Windows CI. The ordinary pipeline does not build/install a new installer or perform real-model coding qualification.

## Remote verification

Use [PR #2's current-head checks](https://github.com/StepenkoAnatoli/MoonAliza/pull/2/checks) for live status. Its description records exact validated revisions and successful run links after publication; this avoids describing a queued run as passed or confusing the original failed revision with its repair. A new push requires checking its own head. The initial failed runs above remain useful diagnostic history.

## Continuation commands

```powershell
gh pr checks 2 --repo StepenkoAnatoli/MoonAliza
gh run list --repo StepenkoAnatoli/MoonAliza --branch feat/moonzila-desktop
gh run view <run-id> --repo StepenkoAnatoli/MoonAliza --log-failed
```

Use the run's exact head SHA when recording a result. Current local verification commands and platform requirements are in [HANDOFF.md](../../HANDOFF.md); the historical workspace snapshot remains unchanged.

## Offline consumer test runner — October 1

Two complete local runs of the Research Kit stage reached 449 and 453 passed tests respectively, then failed to start the workbench UI worker. Vitest reported `Timeout waiting for worker to respond` and an unexpected worker exit; these runs are failures, not full-suite passes. Both UI files passed together (7 tests), and a small mixed Node/UI run passed 11 tests. No application assertion explained the full-run worker failure.

The runner configuration now separates Node and DOM tests into named projects. Node/native tests reuse one thread; UI files use isolated forked processes. Global file parallelism stays disabled for the first supported PC. All existing file patterns and assertions remain enabled; no timeout was raised and no test is retried or skipped. Typecheck and lint pass with that configuration. The final complete-suite result is recorded in development status; current-head GitHub Windows checks remain separate required evidence.
