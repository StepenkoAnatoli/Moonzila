# Research collection process

This is the behaviour contract of the collection process that MoonAliza owns (plan Task 3). It describes what the code does. Where the code and the design differ, the code is described and the difference is listed at the end.

## Purpose and scope

A research job collects a corpus on GitHub. MoonAliza does not dispatch or download through its own GitHub calls: it runs the pinned Research Kit collector (`bin/collect-remote.mjs`) as a child process, once to dispatch a workflow run and then repeatedly to watch that run and download its package. Its only GitHub request is the verified import's read of the run (below). The pinned kit and its trust model are described in [Offline Research Kit consumer](research-kit-offline.md).

The work is split this way:

- [`src/adapters/research-kit/collector.ts`](../../src/adapters/research-kit/collector.ts) is pure. It builds argv and the environment, reads the kit's last `--json` line (`parseKitLine`) and classifies a finished child (`classifyDispatch`, table A; `classifyWatch`, table B).
- [`src/main/collector-plan.ts`](../../src/main/collector-plan.ts) is pure. `planStep` is the only place that turns a collector fact into a job transition.
- [`src/main/collector-settings.ts`](../../src/main/collector-settings.ts) owns the collector target and the token reference (`CollectorSettings`).
- [`src/main/collector.ts`](../../src/main/collector.ts) owns every collector child (`CollectorSupervisor`). It is wired into main by `src/main/index.ts`; this document states its invariants as the code and its tests implement them.
- [`src/adapters/research-kit/adapter.ts`](../../src/adapters/research-kit/adapter.ts) stages the kit and launches it (`prepareCollector`).
- [`src/main/research-import.ts`](../../src/main/research-import.ts) verifies a downloaded package (`packageImporter`); see [Verified import](#verified-import).
- [`src/engine/research-state.ts`](../../src/engine/research-state.ts) owns the job states and the allowed edges (`RESEARCH_EDGES`).

The engine owns job state. Main owns the children, the token and the collector settings. The kit's free text never leaves the classifier.

## Process and bounds

### Launch

`prepareCollector` stages the hash-checked kit inventory once, serialized with validation. Each launch then gets its own folder `storage/collect/<uuid>` with private `temp` and `out` subfolders. The child's working directory is that folder, never a project folder. The child itself is not serialized, so a watch never blocks a validation. `dispose()` removes the folder.

Every launch goes through the guarded run that the validator also uses. The native helper takes read locks on the Node executable and every staged file. While the helper holds the locks, main rehashes Node and every staged file, then runs the supervisor's `admit()` check. Only then does the child start. A refusal at any of these steps means no child ran. For collectors `stopOnOutputLimit` is false: output past the cap is dropped and marked truncated, but the child is not killed.

`admit()` refuses (and no child starts) when:

- the attempt was stopped, the supervisor is closing, or the project is held (`HELD`);
- the job's status or revision changed since it was read, or the job's admission is no longer null (`ADMISSION_REFUSED`);
- for a dispatch: the job already has a run id, or its recorded repository, workflow or ref differs from the saved settings (`COLLECTOR_CHANGED`);
- for a watch: the run id or repository changed (`COLLECTOR_CHANGED`);
- the saved settings changed repository or token reference (and, for a dispatch, workflow or ref) (`COLLECTOR_CHANGED`);
- the vault no longer has the token (`CREDENTIAL_DENIED`).

The check is raced against `admissionMs` (60 s); if it does not finish in time it fails with `ADMISSION_REFUSED`. The whole pre-start step (taking the locks, the rehash and `admit()`) is also bounded by `admissionMs`: the launch passes it as `admissionTimeoutMs`, and the helper's admission timer uses it (never more than the owned timeout) instead of the owned timeout. On expiry main closes the helper's input before sending the go byte; the helper ends with `ADMISSION_CANCELLED` and no child, which classifies as `notLaunched` (`LAUNCH_FAILED`, counted). So stalled admission never holds the kit's read locks for a watch's owned timeout of up to an hour.

`sweep()` runs at start, before any launch, and removes `runtime`, `work` and `collect` left by a crash. It throws `KIT_BUSY` if a runtime is staged or a launch is live. `close()` waits for every launched child before it deletes the staged runtime.

### Bounds

All limits are in `COLLECTOR_LIMITS`, except the start input budget, which is `RESEARCH_INPUT_BUDGET` in [`src/shared/params.ts`](../../src/shared/params.ts) because the `research.start` contract applies it.

| Limit | Value |
| --- | --- |
| Dispatch owned timeout | 120 s (`dispatchTimeoutMs`) |
| Dispatch output cap | 64 KiB (`dispatchOutputBytes`) |
| Watch kit `--timeout` | `min(1500, whole seconds left before the deadline)`, at least 1 (`watchBounds`) |
| Watch owned timeout | kit seconds × 1000 + 300 s, at most 3,600 s |
| Watch output cap | 4 MiB (`watchOutputBytes`) |
| Admission check, and the whole pre-start step | 60 s each (`admissionMs`) |
| Command line | at most 32,766 characters (`maxCommandLine`; `commandLineFits`) |
| Start input budget | 12,000 characters of topic, queries, URLs and joined preferred domains (`RESEARCH_INPUT_BUDGET`). An early refusal only: at the budget, with every topic and query character escaped and the longest targets, the dispatch command line still fits; `commandLineFits` stays authoritative |
| Not-started launches before giving up | 3 (`preStartAttempts`) |
| Transient backoff | 30 s, doubling, capped at 15 min, no count cap |
| Still-running re-watch | 5 s (`stillRunningDelayMs`) |
| Watch deadline | `dispatchedAt` + 7 days (`watchDeadlineMs`); `createdAt` + 7 days if `dispatchedAt` does not read; passed if neither reads |
| Vault grant lifetime | 30 s (`grantMs`) |
| Quit drain | 15 s (`quitDrainMs`) |

Node always runs with `--max-old-space-size=256`.

### Environment

`collectorEnvironment` returns exactly the validator's minimal environment plus the token: `SystemRoot` (when the parent has it), `TEMP`, `TMP`, `TMPDIR`, `HOME` and `USERPROFILE` pointing at the launch's private `temp` folder, and `RESEARCH_KIT_GITHUB_TOKEN`. Nothing else is inherited: no `PATH`, no proxy or CA variables, no `GITHUB_TOKEN`. The token must match `^[\x21-\x7E]{1,16384}$`, or the function throws `COLLECTOR_TOKEN_INVALID`.

### Argv rules

Every value is one `--name=value` element. The kit splits at the first `=`, so a value can never be read as a flag. No argument ever carries the token.

Dispatch (`dispatchArgs`):

```
--max-old-space-size=256 <script> --repository=<r> --workflow=<w> --ref=<ref>
--runner=ubuntu-latest --search-transport=auto --depth=<d> --max-pages=<n>
--client-ref=<clientRef> --topic=<topic> {--query=<q>}* {--url=<u>}* [--prefer=<d1,d2,...>] --no-wait --json
```

`--runner` and `--search-transport` are explicit so the dispatch body never follows a kit default that a re-pin could change. Values come from the job context and the target frozen on the job, never from the renderer.

Watch (`watchArgs`):

```
--max-old-space-size=256 <script> --repository=<r> --run-id=<id> --client-ref=<clientRef> --out=<out> --timeout=<s> --json
```

`watchArgs` has no topic parameter, so a watch cannot dispatch another run. It throws `COLLECTOR_LIMIT_INVALID` if the kit seconds are not a positive safe integer.

### Reading the kit's output

`parseKitLine` takes the last non-empty line and matches it against strict shapes: `dispatched`, `error` (a code from `KIT_CODES`, or `OTHER`), `noToken`, `concluded`, `report`, plain `text`, `empty` or `invalid`. For an `HTTP` error it reads the status from kit-authored prefixes for four calls: dispatch, read run, list artifacts and download. Free-text fields (error, remedy, URLs, file names, findings) are checked for size and then dropped. Under `--json` the kit does not redact them. Only codes, numbers, an allowlisted run conclusion, a known state and a run id leave the function. The kit's own `file` and run id are never used.

## Dispatch outcomes

`classifyDispatch` (table A). Rows are checked in order. "Started" means the helper reported the child before it ran.

| Condition | Outcome |
| --- | --- |
| No result, not started; or helper status `failed`, not started | `notLaunched` with the launch refusal (default `LAUNCH_FAILED`) |
| No result, started | ambiguous, `HELPER_FAILED` |
| Helper status `unknown` | ambiguous, `HELPER_UNKNOWN` |
| Helper status `failed`, started | ambiguous, `HELPER_FAILED` |
| Exited but never reported started | ambiguous, `HELPER_UNKNOWN` |
| Exit 0, not truncated, last line is the strict `dispatched` shape | `dispatched` with the run id |
| Exit 0 otherwise | ambiguous, `KIT_OUTPUT_LIMIT` (truncated) or `KIT_OUTPUT_INVALID` |
| Non-zero exit, truncated | ambiguous, `KIT_OUTPUT_LIMIT` |
| Exit 1 with owned timeout or stop | ambiguous, `OWNED_TIMEOUT` or `OWNED_STOPPED` |
| Any exit other than 3 | ambiguous, `KIT_EXIT_<n>` (`KIT_EXIT_NEG<n>` for a negative code, `KIT_EXIT_NONE` without one) |
| Exit 3, no-token payload | `COLLECTOR_TOKEN_MISSING` / `KIT_NO_TOKEN` |
| Exit 3, plain text (help, refusals, old Node) | `COLLECTOR_REFUSED` / `KIT_REFUSED` |
| Exit 3, empty output | ambiguous, `KIT_EXIT_3` |
| Exit 3, JSON that is not an error | ambiguous, `KIT_OUTPUT_INVALID` |
| Exit 3, `REPOSITORY` | `COLLECTOR_REFUSED` / `KIT_REPOSITORY` |
| Exit 3, `TOKEN` | `COLLECTOR_TOKEN_MISSING` / `KIT_TOKEN` |
| Exit 3, `NOT_FOUND` | `COLLECTOR_NOT_FOUND` / `KIT_NOT_FOUND` |
| Exit 3, `FORBIDDEN` | `COLLECTOR_FORBIDDEN` / `KIT_FORBIDDEN` |
| Exit 3, `HTTP` on dispatch with 401 | `COLLECTOR_TOKEN_REJECTED` / `KIT_HTTP_401` |
| Exit 3, `HTTP` on dispatch with another 4xx except 408 and 429 | `COLLECTOR_REJECTED` / `KIT_HTTP_<n>` |
| Exit 3, `HTTP` otherwise (408, 429, 5xx, other call, no status) | ambiguous, `KIT_HTTP_<n>` or `KIT_HTTP` |
| Exit 3, any other code (`NETWORK`, `NO_RUN_ID`, `UNKNOWN`, `OTHER`, ...) | ambiguous, `KIT_<CODE>` |

A `notDispatched` row (failure / cause) fails the job with that failure. Every ambiguous row fails the job as `REMOTE_STATE_UNKNOWN` with the given cause, because a remote run might exist. Only `notLaunched` can lead to another launch, and it is returned only when no child ran.

The supervisor handles `notLaunched` this way: `HELD`, `ENGINE_UNAVAILABLE` and `STOPPED` wait 1 s and try again without counting. Other refusals count. After 3, the job fails with cause `NOT_STARTED` and failure `RESEARCH_KIT_UNAVAILABLE` (for `INSTALLATION_INVALID`), `COLLECTOR_CHANGED` (for `COLLECTOR_CHANGED`) or `DISPATCH_NOT_STARTED`.

## Watch outcomes

`classifyWatch` (table B). The package check is done by main after exit: `present` means the `out` folder holds exactly one entry, a regular file that is not a link, has one hard link and is named `packageFileName(clientRef)` (`research-kit-corpus-v1-<clientRef>.zip`). An empty folder is `absent`; anything else is `unexpected`.

An attempt that the supervisor itself stopped (cancel, hold, new credentials, quit) is not classified; the driver re-reads the job instead.

| Condition | Outcome |
| --- | --- |
| No result; or helper status `failed`, not started | `notLaunched` with the refusal |
| Helper status `unknown` | transient, `HELPER_UNKNOWN` |
| Helper status `failed`, started | transient, `HELPER_FAILED` |
| Truncated | transient, `KIT_OUTPUT_LIMIT` |
| Owned timeout | transient, `OWNED_TIMEOUT` |
| Owned stop | transient, `OWNED_STOPPED` |
| Report whose exit code is not the expected one (PASS 0, FAIL 1, INCOMPLETE 2, BLOCKED 2) | transient, `KIT_OUTPUT_INVALID` |
| Report FAIL | `ARTIFACT_INVALID` / `KIT_<first error code, '-' as '_'>`, or `KIT_FAIL` |
| Report INCOMPLETE or BLOCKED | `ARTIFACT_INCOMPLETE` / `KIT_INCOMPLETE` or `KIT_BLOCKED` |
| PASS, but build authorized or state `APPROVED_BRIEF` | `ARTIFACT_INVALID` / `KIT_UNEXPECTED_APPROVAL` |
| PASS, client ref differs from the job's | `ARTIFACT_INVALID` / `IDENTITY_MISMATCH` |
| PASS, state `COLLECTION_FAILED` | `COLLECTION_FAILED` / `KIT_COLLECTION_FAILED` |
| PASS, state unknown or not reviewable | `ARTIFACT_INVALID` / `KIT_STATE_UNKNOWN` |
| PASS, package not `present` | `ARTIFACT_INVALID` / `PACKAGE_NAME_UNEXPECTED` |
| PASS, state `REVIEW_REQUIRED`, `REVIEW_IN_PROGRESS` or `PREFLIGHT_BLOCKED` | `package` (handed to import) |
| Exit 4 with `TIMEOUT` | `stillRunning` |
| Exit 4 otherwise | transient, `KIT_OUTPUT_INVALID` |
| Exit 2, run concluded | `RUN_FAILED` / `RUN_<CONCLUSION>`, or `RUN_CONCLUDED` for an unlisted conclusion |
| Exit 2, not an error | transient, `KIT_OUTPUT_INVALID` |
| Exit 2, `NO_ARTIFACT` | `ARTIFACT_EXPIRED` past retention, else `ARTIFACT_MISSING`; cause `KIT_NO_ARTIFACT` |
| Exit 2, `EXPIRED` | `ARTIFACT_EXPIRED` / `KIT_EXPIRED` |
| Exit 2, `ARTIFACT_NAME` | `ARTIFACT_INVALID` / `KIT_ARTIFACT_NAME` |
| Exit 2, `HTTP` with a 4xx other than 408 and 429 | park `credentials`, `KIT_HTTP_<n>` |
| Exit 2, `HTTP` otherwise | transient, `KIT_HTTP_<n>` or `KIT_HTTP` |
| Exit 2, any other code (`NETWORK`, `BAD_BODY`, `UNKNOWN`, `OUT_DIR`, ...) | transient, `KIT_<CODE>` |
| Exit 3, no-token payload or `TOKEN` | park `credentials`, `KIT_NO_TOKEN` or `KIT_TOKEN` |
| Exit 3 otherwise | park `kit`, `KIT_<CODE>`, `KIT_REFUSED` or `KIT_EXIT_3` |
| Any other exit | transient, `KIT_EXIT_<n>` (`KIT_EXIT_NEG<n>`, `KIT_EXIT_NONE` as in table A) |

"Past retention" means the artifact's 7-day retention has passed. Since 2026-09-24 GitHub no longer lists an expired artifact, so a late watch sees `NO_ARTIFACT` rather than `EXPIRED`. A 404 on reading the run can mean "no access" or "the run was deleted by the repository's retention setting"; both park as `credentials`. A secondary rate-limit 403 cannot be told apart from "no access" and also parks.

The supervisor handles each outcome this way:

- `runFailed` fails the job (collecting → failed).
- `package` calls the import seam with a `PackageHandoff`. The run id, revisions and target come from the engine and the file path is recomputed by main. `verified` and `rejected` are committed through `planStep`. If there is no import seam, it throws, or it answers `deferred`, the job parks as `import`, unless the supervisor's own wake (cancel, hold, engine restart, quit) stopped it: then the driver re-reads, and a still-`collecting` job is watched again.
- `stillRunning` waits 5 s and resets the transient count.
- `transient` waits with the backoff above.
- `park` stops launching until re-armed. `credentials` is re-armed by a collector save (`configChanged`) or the next app start. `kit` and `import` are re-armed at the next app start. A parked job stays `collecting` and owned.
- `notLaunched`: `INSTALLATION_INVALID` parks `kit`; `HELD`, `ENGINE_UNAVAILABLE` and `STOPPED` wait; other refusals count, and after 3 in a row the job parks `kit`. `CREDENTIAL_DENIED` parks `credentials` at once when the saved settings have no token reference or the vault no longer has it. With the reference still saved (for example a grant issued under an epoch that an engine-only restart has just replaced, or encryption briefly unavailable) it counts like any refusal and, after 3 in a row, parks `credentials`. The watch count is its own: the dispatch's refusals do not carry into it, a watch that started restarts it, and so does a park, so a re-armed job again has 3 tries.

A watch never fails a job on a transient result. When the deadline passes, the job fails `COLLECTION_EXPIRED` / `WATCH_DEADLINE`. The store always sets `dispatchedAt` with the run's target, so a `collecting` job without a readable one is a damaged row. It is still watched, against `createdAt` + 7 days: creation precedes dispatch, so that deadline is never later than the real one and the watch still never runs past the artifact's retention. Expiring such a job on sight (the earlier behaviour) would give up a run that may have succeeded; watching it from "now" would never end.

## Job planning

`planStep(ctx, outcome, learnedRunId)` is pure. Main always re-reads the context first, so a fact learned before a cancel or a policy change is recorded on the edge the current state allows. A run id is offered only when the job has none.

| Job status | Outcome | Plan |
| --- | --- | --- |
| collected, failed, cancelled, approved, not_ready, reviewing | any | release |
| cancelling | any | cancelling → cancelled, cause `COLLECTOR_STOPPED`; the learned run id if the job has none; failure `REMOTE_STATE_UNKNOWN` if the outcome is ambiguous |
| queued | refuse (f, c) | queued → failed, failure f, cause c |
| queued | admit, admission not null | queued → failed, failure = admission, cause `ADMISSION_REFUSED` |
| queued | admit | queued → dispatching with the target, cause `DISPATCH` |
| queued | other | continue |
| dispatching | dispatched, admission not null | dispatching → failed, failure = admission, cause `ADMISSION_CHANGED`, with the run id |
| dispatching | dispatched | dispatching → collecting with the run id, cause `KIT_DISPATCHED` |
| dispatching | notDispatched (f, c) | dispatching → failed, failure f, cause c |
| dispatching | ambiguous (c) | dispatching → failed, failure `REMOTE_STATE_UNKNOWN`, cause c, with a learned run id |
| dispatching | other | continue |
| collecting | admission not null | collecting → failed, failure = admission, cause `ADMISSION_CHANGED` |
| collecting | runFailed (f, c) or rejected (f, c) | collecting → failed, failure f, cause c |
| collecting | verified, bound to the job's current revision | collecting → collected with the verification, cause `PACKAGE_VERIFIED` |
| collecting | verified, bound to another revision | continue (nothing recorded; the next watch verifies again) |
| collecting | expired | collecting → failed, failure `COLLECTION_EXPIRED`, cause `WATCH_DEADLINE` |
| collecting | other | continue |

Before admitting a queued job, the supervisor refuses what cannot work: no settings (`COLLECTOR_NOT_CONFIGURED` / `NO_COLLECTOR`), no token in the vault (`COLLECTOR_TOKEN_MISSING` / `NO_TOKEN`), no kit (`RESEARCH_KIT_UNAVAILABLE` / `NO_INSTALLATION`), a kit that fails to stage (`RESEARCH_KIT_UNAVAILABLE` / `INSTALLATION_INVALID`), or a dispatch command line that does not fit (`COLLECTOR_INPUT_TOO_LONG` / `COMMAND_LINE`). Otherwise it admits with the target `{collectorRevision, repository, workflow, ref}` from the saved settings, which the engine freezes on the job.

The engine allows only the edges in `RESEARCH_EDGES`. `queued` is the only source of `dispatching`, nothing returns to `queued`, and a run id can be written once. `cancelling → cancelled` accepts a run id and a failure, because a cancel can race the collector printing its run id.

Commits use one random request id per planned command, kept until the engine answers, so a reply lost to an engine restart replays instead of applying twice. Every command is checked with `ControlSchema` before it is sent. `STALE_REVISION` or `RESEARCH_TRANSITION_INVALID` drops the command and re-plans from a fresh read, at most 5 times. `ENGINE_UNAVAILABLE` waits for the engine's ready signal or backs off (1 s doubling, at most 60 s) and resends the same command. Any other error holds the job: its driver stops, but the job stays in `ownedIds()` (and `busy()`) until the next app start, so no recovery in this process acts on it, nothing relaunches it and a notice cannot re-admit it. The next app start recovers it, and replays its spooled run id if it has one.

## Credentials

### Where the token lives

- The token is stored only in the vault, encrypted, under an opaque UUID reference.
- The settings file (the design places it at `<userData>/research-kit/collector.json`; `CollectorSettings` takes its path from the caller) holds the target and the reference: `version`, `revision`, `repository`, `workflow`, `ref`, `secretRef`, `retiredSecretRef`, `lastRequest {clientRequestId, inputHash}` and `updatedAt`. It is strict, at most 64 KiB, written atomically, and owned by main. A missing or invalid file reads as "not configured". The engine never reads it.
- The run-id spool (`<id>.json` in the spool folder) holds `{version, researchId, clientRef, workflowRunId}`, at most 4 KiB.

### Where the token appears

Only in main's memory during one launch, in the helper's input protocol, and in the child's environment as `RESEARCH_KIT_GITHUB_TOKEN`. Each launch gets a vault grant bound to the engine epoch, purpose `research` and a context id `collector:<researchId>:<uuid>`, valid for 30 s. The token is decrypted inside `withSecret`, placed in the environment block, and the context is revoked once the launch is handed over.

### Where it never appears

Argv, engine controls, the database, research events, causes or failures, notices, the settings file, the spool, logs, thrown errors and the renderer. `research.collector.read` returns `{revision, repository, workflow, ref, tokenConfigured}` only; `tokenConfigured` is true when a reference is saved and the vault still has it.

### Save, rotation and clear

`save` runs serialized on the file:

1. The replay hash covers repository, workflow, ref, expected revision, `clearToken` and whether a token was supplied. It never covers the token.
2. The same request id with the same hash returns the current value; with a different hash it fails `REQUEST_CONFLICT`.
3. Compare-and-set: the current revision (0 when unset) must equal `expectedRevision`, or `REQUEST_CONFLICT`.
4. Changing the repository while a token is saved, with neither a new token nor `clearToken`: `COLLECTOR_TOKEN_REQUIRED`.
5. Changing repository, workflow or ref while any job is owned: `RUN_ACTIVE`. Token rotation and clearing are always allowed.
6. A new token is staged in the vault.
7. The file is written with revision + 1, the new reference, and the replaced reference as `retiredSecretRef`. If the write fails, the staged token is tombstoned and removed.
8. The staged token is committed.
9. If a reference was retired: the supervisor stops its watches (`credentialsChanged`), the old reference is tombstoned (revoking any outstanding grant) and removed, and the file is rewritten without `retiredSecretRef`.
10. `configChanged` re-arms jobs parked as `credentials`.

A started dispatcher keeps the token copy in its environment. Watches restart with a new grant, or park as `credentials` if no token is saved.

### Crash windows

`open()` tombstones a `retiredSecretRef` left by an interrupted save. `references()` gives the startup reconcile the reference to keep. `finishStartup()` then clears `retiredSecretRef`. A crash after staging leaves an unreferenced staged token for the reconcile to delete; after the write, the staged token is referenced and the reconcile commits it; after the commit, the retired token is removed at the next start.

## Verified import

`packageImporter` (`src/main/research-import.ts`) turns a `PackageHandoff` into `verified`, `rejected` or `deferred`. It never writes job state; the supervisor commits its answer through `planStep`, which re-checks admission and the bound revision.

1. Without a kit, a saved token reference, or settings for the job's repository, it defers.
2. It reads the run once: `GET https://api.github.com/repos/<owner>/<repo>/actions/runs/<run id>`. The token comes from a 30-second vault grant (purpose `research`, context `import:<researchId>:<uuid>`, revoked afterwards) and travels only in that request's `Authorization` header. A redirect is refused rather than followed, the response is bounded to 1 MiB and 20 s, and only `id`, `run_attempt`, `head_sha`, `head_branch`, `path`, `event`, `status` and `repository.full_name` are read. Any failure defers; nothing from the response is kept as text.
3. The run must be the one the job dispatched: the same id, the repository (case-insensitive), `path` = `.github/workflows/<job workflow>`, `head_branch` = the job's ref without `refs/heads/` or `refs/tags/`, and event `workflow_dispatch`. Otherwise `RUN_IDENTITY_MISMATCH` / `IMPORT_RUN_MISMATCH`, before any validation. A run whose status is not `completed` (a re-run in progress) defers.
4. The binding: project id; project revision = the job's admitted policy revision; job id and its current revision (the `collecting` revision, so a receipt is bound to the revision the job leaves); client ref; repository = `repository.full_name`; ref = `head_branch` (the short `GITHUB_REF_NAME` the package records); workflow = the literal `collect.yml`, which the kit's workflow always records whatever its file is called; commit = `head_sha`; run id; run attempt = `run_attempt`. Commit and attempt come only from the run, never from the package.
5. `ResearchKit.validate` checks the package under that binding and retains the exact bytes. PASS in `REVIEW_REQUIRED`, `REVIEW_IN_PROGRESS` or `PREFLIGHT_BLOCKED` is `verified`; an approval is `ARTIFACT_INVALID` / `IMPORT_UNEXPECTED_APPROVAL`; `COLLECTION_FAILED` is `COLLECTION_FAILED` / `IMPORT_COLLECTION_FAILED`. FAIL is `ARTIFACT_INVALID` / `IMPORT_FAIL`, INCOMPLETE is `ARTIFACT_INCOMPLETE` / `IMPORT_INCOMPLETE`. A binding mismatch (a package from another run, attempt or commit) is `PACKAGE_IDENTITY_MISMATCH` / `IMPORT_IDENTITY_MISMATCH`; `ARTIFACT_INVALID` and `INPUT_LIMIT` are `ARTIFACT_INVALID` with `IMPORT_ARTIFACT_INVALID` / `IMPORT_INPUT_LIMIT`. Every other validator error (installation, validator output or bounds, storage limit, a stop) defers. Inside `validate`, only a failure while reading the package's own content (the ZIP, the manifest's shape) is `ARTIFACT_INVALID`; any other unclassified failure (the native helper unavailable or answering badly, a spawn failure, the downloaded file gone, the store) is `INSTALLATION_INVALID`, so a good package is never failed for this machine's fault. Retained bytes are written in full and synced under `storage/work` (swept at start), then replaced by rename to `storage/artifacts/<sha256>.zip`. On Windows Node's rename is `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`, which Microsoft does not document as crash-atomic and which fails while the destination is open ([Windows file semantics](../research/2026-10-03-windows-file-semantics/research/BRIEF.md), U-04, U-07, U-10); the guarantee is the recovery below, not the rename. A file already under that name whose bytes do not hash to it (torn by a crash, or altered) is replaced by the verified bytes instead of blocking every later validation, and a store entry that is not a regular file is `INSTALLATION_INVALID`.

`collecting → collected` requires the verification, and the engine re-checks admission in the same transaction, as it does for the dispatch: after a trust, policy or research-off change the step is refused and journaled as `collecting → failed` with the admission code and cause `ADMISSION_CHANGED`, so a package is never accepted under a withdrawn admission even when the change lands between the supervisor's re-read and its commit. The engine refuses one whose `jobRevision` is not the job's revision, whose `projectRevision` is not its policy revision, whose `workflowRunId` or `clientRef` is not the job's, whose `repository` differs from the frozen target's (ignoring case), or whose `ref` is not the short name of the target's ref. `workflow` is not compared, because it is the kit's literal `collect.yml`, not the target's workflow file. It holds `artifactSha256`, `artifactBytes`, `validatorRevision`, `nodeSha256`, `state`, `jobRevision`, `projectRevision`, `repository`, `ref`, `workflow`, `commit`, `runAttempt`, `workflowRunId`, `clientRef` and `downloadDigest: 'unverified'` (the pinned kit does not check the artifact's digest). It is stored only in that step's journal detail; no column holds it. The receipt itself stays process-local; with the journaled binding, a later stage can validate the retained bytes again after a restart.

## Lifecycle

### App start

`attach()` runs once and resolves `attached`. `observe()` waits for it, so nothing is admitted before recovery has run.

1. Spool replay. Each spool file is parsed; an invalid one is deleted. If the job is gone, finished, or already has that run id, the file is deleted. Otherwise the fact is re-planned against the current state: a `dispatching` job commits `dispatched`, which gives `collecting` (or failed with the admission); a `cancelling` job records the run id on `cancelling → cancelled`. The file is deleted once a commit that carried the run id, or that finished the job, is acknowledged.
2. `research.recover` with an owned list that is empty unless a replay commit in step 1 failed: such a job is held, kept out of recovery, and replayed again at the following start. The engine fails every `dispatching` job as `REMOTE_STATE_UNKNOWN` (cause `RECOVERED`) and cancels every `cancelling` job (cause `NO_OWNED_WORK`). It never re-queues.
3. Adopt: each `dispatchable` (queued) and `resume` (collecting) entry is owned and driven. `reviewing` and `unreadable` are left alone.

### Cancel

`observe()` with status `cancelling` for an owned job stops a watch and an unstarted dispatcher. A started dispatcher is not stopped; the driver waits for it to finish, then commits `cancelling → cancelled` with any learned run id and, if the dispatch was ambiguous, failure `REMOTE_STATE_UNKNOWN`. A `cancelling` job this process does not own is ignored. MoonAliza does not cancel the remote GitHub run.

### Hold on trust or policy change

`hold(projectId)` returns a release function. While held, the project's watches and unstarted dispatchers are stopped, `admit()` refuses with `HELD`, and no new child starts. Started dispatchers continue. On release each job re-reads its context: if admission is now non-null, the job fails with the admission code (`ADMISSION_CHANGED`, or `ADMISSION_REFUSED` from queued); otherwise the watch resumes or the unstarted dispatch launches again. Holds nest.

### Engine-only restart

Collector children belong to main's helper, so they keep running. Controls in flight fail with `ENGINE_UNAVAILABLE` and wait. On `engineReady` after attach, the supervisor closes a gate so no transition is sent, calls `research.recover` with `ownedIds()` (computed in the same tick it is posted, so an owned job is never failed by recovery), adopts unowned entries, opens the gate and wakes every owned job. Pending commands are resent with the same request id. Grants are issued again per attempt under the new epoch.

### Quit

`close()` refuses new admissions and stops watches, waits and unstarted dispatchers. Started dispatchers get up to 15 s to finish, write the spool and commit. Then every remaining child is stopped, with a further 1 s grace. If main dies outright, the helper's input closes and the Windows Job Object ends the process tree.

## Never dispatch twice

1. `queued` is the only source of `dispatching`, and the engine allows one dispatch per job.
2. A dispatcher is launched only after this process received `applied` for `queued → dispatching` (`mayDispatch`).
3. `started` is sticky: once a dispatcher ran, no dispatcher is launched again for that job. Only `notLaunched`, returned when no child ran, can lead to another launch. A row decided from kit text never relaunches, so a misread can give a wrong failure label but not a second run.
4. A job found in `dispatching` that this process did not launch is never launched. The driver commits it as ambiguous (`NOT_OWNED_DISPATCH`), and recovery fails unowned ones as `REMOTE_STATE_UNKNOWN`.
5. A watch cannot carry `--topic`.
6. Recovery never re-queues.
7. A learned run id is written to the spool before it is committed, so a crash in between cannot lose a paid run.

## Failure and cause vocabulary

Every value matches `^[A-Z][A-Z0-9_]{1,63}$`. Names written with `<...>`, the `RUN_` conclusions, `KIT_OTHER`, `KIT_EXIT_NONE` and the `KIT_` forms of kit and report codes are composed at run time from a prefix and a code, so they do not appear literally in the source.

### Job failures (stored as `failure`)

- Admission: `PROJECT_NOT_FOUND`, `PROJECT_UNTRUSTED`, `RESEARCH_NOT_ALLOWED`, `POLICY_CHANGED`, `TRUST_CHANGED`.
- Before dispatch: `COLLECTOR_NOT_CONFIGURED`, `COLLECTOR_TOKEN_MISSING`, `RESEARCH_KIT_UNAVAILABLE`, `COLLECTOR_INPUT_TOO_LONG`, `COLLECTOR_CHANGED`, `DISPATCH_NOT_STARTED`.
- Dispatch refused: `COLLECTOR_REFUSED`, `COLLECTOR_NOT_FOUND`, `COLLECTOR_FORBIDDEN`, `COLLECTOR_TOKEN_REJECTED`, `COLLECTOR_REJECTED`.
- Ambiguous dispatch: `REMOTE_STATE_UNKNOWN`.
- Watch: `RUN_FAILED`, `ARTIFACT_MISSING`, `ARTIFACT_EXPIRED`, `ARTIFACT_INVALID`, `ARTIFACT_INCOMPLETE`, `COLLECTION_FAILED`, `COLLECTION_EXPIRED`.
- Import: `RUN_IDENTITY_MISMATCH`, `PACKAGE_IDENTITY_MISMATCH`, and `ARTIFACT_INVALID`, `ARTIFACT_INCOMPLETE`, `COLLECTION_FAILED` as above.

### Causes (stored on the transition)

- Planning: `DISPATCH`, `KIT_DISPATCHED`, `COLLECTOR_STOPPED`, `ADMISSION_REFUSED`, `ADMISSION_CHANGED`, `WATCH_DEADLINE`.
- Supervisor: `NO_COLLECTOR`, `NO_TOKEN`, `NO_INSTALLATION`, `INSTALLATION_INVALID`, `COMMAND_LINE`, `NOT_STARTED`, `NOT_OWNED_DISPATCH`.
- Engine recovery: `RECOVERED`, `NO_OWNED_WORK`.
- Helper and owned bounds: `HELPER_FAILED`, `HELPER_UNKNOWN`, `OWNED_TIMEOUT`, `OWNED_STOPPED`.
- Kit output: `KIT_OUTPUT_LIMIT`, `KIT_OUTPUT_INVALID`, `KIT_EXIT_<n>`, `KIT_EXIT_NEG<n>`, `KIT_EXIT_NONE`, `KIT_REFUSED`, `KIT_NO_TOKEN`.
- Kit codes: `KIT_<CODE>` for each of `KIT_CODES` (`REPOSITORY`, `TOKEN`, `NETWORK`, `NO_RUN_ID`, `NOT_FOUND`, `FORBIDDEN`, `HTTP`, `UNKNOWN`, `TIMEOUT`, `BAD_BODY`, `NO_ARTIFACT`, `EXPIRED`, `ARTIFACT_NAME`, `OUT_DIR`), plus `KIT_OTHER` for an unlisted code, and `KIT_HTTP_<status>`.
- Package report: `KIT_<first error code>` (for example `KIT_CLIENT_REF_MISMATCH`), `KIT_FAIL`, `KIT_INCOMPLETE`, `KIT_BLOCKED`, `KIT_UNEXPECTED_APPROVAL`, `IDENTITY_MISMATCH`, `KIT_COLLECTION_FAILED`, `KIT_STATE_UNKNOWN`, `PACKAGE_NAME_UNEXPECTED`.
- Import: `PACKAGE_VERIFIED`, `IMPORT_RUN_MISMATCH`, `IMPORT_IDENTITY_MISMATCH`, `IMPORT_FAIL`, `IMPORT_INCOMPLETE`, `IMPORT_ARTIFACT_INVALID`, `IMPORT_INPUT_LIMIT`, `IMPORT_UNEXPECTED_APPROVAL`, `IMPORT_COLLECTION_FAILED`.
- Run conclusion: `RUN_FAILURE`, `RUN_CANCELLED`, `RUN_TIMED_OUT`, `RUN_ACTION_REQUIRED`, `RUN_NEUTRAL`, `RUN_SKIPPED`, `RUN_STALE`, `RUN_STARTUP_FAILURE`, `RUN_CONCLUDED`.

Transient and park causes use the same names but are not recorded; the job stays `collecting`.

### Launch refusals (internal, never stored)

`INSTALLATION_INVALID`, `ADMISSION_REFUSED`, `COLLECTOR_CHANGED`, `CREDENTIAL_DENIED`, `HELD`, `STOPPED`, `ENGINE_UNAVAILABLE`, `LAUNCH_FAILED`.

### Errors thrown by the code

`COLLECTOR_TOKEN_INVALID`, `COLLECTOR_LIMIT_INVALID`, `KIT_BUSY`, and from settings `REQUEST_CONFLICT`, `COLLECTOR_TOKEN_REQUIRED` and `RUN_ACTIVE`.

## Rejected alternatives

1. Collector config in the engine settings row: the schema is strict, single-row and overwritten whole by a renderer-callable method.
2. Collector config in a new engine table: needs a migration and new controls, and puts the token reference in the database. The engine never needs the config.
3. Running a watch inside the storage lock: it would block validation for up to 30 minutes.
4. Reusing the validator's report parser: it parses the whole output strictly, while collector output is a merged stream with extra keys.
5. Aborting a started dispatcher on cancel, hold, token rotation or early quit: it turns a known outcome into `REMOTE_STATE_UNKNOWN`.
6. Telling a `NETWORK` error before or after the request was sent from its text: the kit does not distinguish them.
7. Acting on the kit's "safe to repeat" remedy: rejected outright.
8. Passing the user's proxy or extra CA variables: nothing is inherited; direct egress only.
9. A stub collector script for the plan scenarios: the real kit stays at the network boundary.
10. Disabling TLS verification in the test fake: a test CA is used instead.
11. Re-pinning with mutations only or full regeneration of fixtures: the first gives identity mismatches, the second needs a fixture review.
12. Folding the re-pin into the Task 3 commit: it is a separately revertable unit.
13. An engine-side readiness check, or a contract-only fix for oversized jobs: main's exact command-line check stays authoritative.

## Out of scope

- `research.purge` and deleting retained bytes (plan Task 4, second part). Rejected packages that passed the validator (an approval or a failed collection) are retained until then too.
- Retrying an import parked by a GitHub or validator failure before the next app start.
- Keeping `COLLECTION_FAILED` diagnostic packages.
- Task 5: review edges and review owners in the owned list.
- Task 6 (the panel and its failure messages exist; still open): a "needs attention" signal for parked jobs, which needs a park-reason field on the job's DTO. Its text for a `credentials` park must say both "no access" and "run deleted by retention".
- Task 7: desktop journeys, packaging, real-network smoke tests and Windows CI.
- Cancelling the remote GitHub run, and reconciling `REMOTE_STATE_UNKNOWN` jobs by client ref.
- Proxy and extra CA support.
- Research Kit changes: a status and retry-after field in `--json` errors, splitting `NETWORK`, printing the run id earlier, redacting `--json` output, a bounded and digest-checked download, and a find-run-by-client-ref command. Until the pin carries a digest check, an import must record "digest unverified".
- A cross-project collector cap and a memory limit for the process tree.
- A shared GitHub connection, fixing `profile.save` secret hashing, and checking that the collector repository is private.

## Differences from the design

- `classifyWatch` takes `job.pastRetention`, as the October 2 adjustment asks: `NO_ARTIFACT` past retention is `ARTIFACT_EXPIRED`. The supervisor passes `false`. The watch deadline is 7 days from dispatch, and the artifact's retention is 7 days from its upload, which comes after dispatch. So a watch can never see an expired artifact, and in the driver `NO_ARTIFACT` gives `ARTIFACT_MISSING`. A longer deadline would have to compute this.
- `start` on `CollectorLaunch` takes a built environment, not a token; main builds it with `collectorEnvironment`. The launch exposes `temp` and has no `cwd` field.
- In table A the supervisor also lets `STOPPED` wait without counting; the design lists only `HELD` and `ENGINE_UNAVAILABLE`. Kept deliberately (October 3): `STOPPED` arises only when this supervisor aborted an unstarted attempt itself (cancel, hold, quit), and the next pass always resolves that state (a cancel commits `cancelling → cancelled`, a hold refuses with `HELD`, quit returns), so it cannot loop. Counting it would let three holds of the project, which are user actions, fail a job as `DISPATCH_NOT_STARTED` although no launch ever failed.
- In table B, in the PASS branch the code checks approval and client ref before `COLLECTION_FAILED`; the design lists `COLLECTION_FAILED` first.
- The design does not list the supervisor's pre-admission refusals (`COLLECTOR_NOT_CONFIGURED`, `NO_COLLECTOR`, `NO_TOKEN`, `NO_INSTALLATION`, `COMMAND_LINE`) or the `NOT_OWNED_DISPATCH` cause.
- A negative exit code is named `KIT_EXIT_NEG<n>`, because a minus sign is not valid in a code. Fixed after review: it used to form `KIT_EXIT_-<n>`, which failed the control schema and held the job.
- Any failure while node and the staged runtime are rehashed before the child starts (wrong hash, a grown, swapped or linked file) is `INSTALLATION_INVALID`, for the validator as well as the collector.
- Wiring (`src/main/index.ts`, `src/main/engine.ts`): settings, installation, sweep, reconcile with the collector reference, `attach`, `observe` on notices and on start/cancel replies, `engineReady` on each engine `ready`, `hold` around trust and policy changes, `research.collector.read/save`, and the quit order supervisor → kit → engine. `importPackage` is `packageImporter` over the vault, the collector settings and the kit.
