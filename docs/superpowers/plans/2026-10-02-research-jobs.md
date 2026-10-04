# Research jobs and review implementation plan

**Status:** in progress. The user said "start" on October 2; Task 1 follows the D2 and D3 recommendations. D1 and D4 are not needed until Tasks 3 and 4. This is Stage 2 of the [integration review](../../specification/research-kit-integration-review.md), building on the [offline consumer](../../specification/research-kit-offline.md). Decisions D1–D4 below were answered on October 2 (see "Decisions recorded October 2").

**Goal:** a project can start a Research Kit collection, follow it durably through restarts, read its evidence and brief, have the corpus reviewed, and end with a verified package whose readiness Moonzila can show. Ordinary chat and existing projects behave exactly as today when research is off.

**Out of scope here:** Build admission that depends on research (Stage 3), bundled kit provisioning and release qualification (Stage 4), private-repository GitHub reading, and live text display.

## Current state, inspected on `main` at `b439ac4`

- `src/adapters/research-kit` validates real pinned packages through an owned, bounded process and retains verified bytes. Nothing in `src/engine`, `src/main` or the renderer calls it yet.
- Schema v2 already has a `research` table (`id`, `project_id`, nullable `run_id`, `status`, JSON `state`) and store methods `putResearch/getResearch/listResearch`. Project policy already carries `research: 'off' | 'public-technical' | 'private-connected'`, and `assertToolPolicy` refuses research tools when it is `off`.
- `src/shared/params.ts` declares `research.provision/start/read/cancel/review/purge`, and `src/shared/events.ts` declares `research.status`. These come from the original source plan, are only listed by `tests/contracts.test.ts`, and have no handler. Three of them conflict with the later integration review and must be revised, not implemented as declared:
  - `research.provision` accepts `provisioningSecret` and `runtimeSecret` as renderer strings. Credentials must enter through main-owned secret handling, never as general IPC payload.
  - `research.review` records a user `sufficient/insufficient` decision. Readiness is the kit's `APPROVED_BRIEF` with `buildAuthorized: true`, produced by its own gate. A Moonzila-side switch is the "mutable Authorize" control the review rejects (correction 8).
  - `research.start` takes a free-text `brief`. The collector takes a topic, queries, known URLs and preferred domains, all of which become readable by anyone who can read the collector repository.

## Research Kit facts this plan depends on

Read directly from Research-Kit `main` at `fcde0e6` on October 2.

- `lib/artifact-validator.mjs`, `lib/artifact-zip.mjs`, `bin/artifact.mjs`, every schema, `test/artifact-fixtures.mjs` and `.github/workflows/collect.yml` are byte-identical to the earlier pin `5588ce3`. The producer `lib/artifact.mjs` changed (+24/-2: it now refuses FIFOs and folder cycles). The offline consumer's fixtures stay valid: all 15 recorded reports reproduce at `fcde0e6`. Corrected October 2; this line first said `artifact.mjs` was identical without naming which.
- `bin/collect-remote.mjs` (present at the pin) dispatches `collect.yml` on GitHub Actions, downloads and validates the package. In text mode it prints the run id before waiting; under `--json` it prints one payload at exit, so Task 3 dispatches with `--no-wait --json` and then watches with `--run-id`. Exit codes: 0 valid, 1 invalid, 2 run failed/incomplete, 3 could not start, 4 still running. `--json` gives a machine-readable result, `--run-id` resumes an existing run, `--no-wait` dispatches only. `--client-ref` is public: it names the run and artifact.
- The token comes only from `RESEARCH_KIT_GITHUB_TOKEN` or `GITHUB_TOKEN`; there is no token flag. It needs one permission, Actions read and write, on the collector repository. Firecrawl and SerpApi keys are repository secrets of the collector, so Moonzila never holds them.
- Since the pin, collection gained `--run-id` pickup of an already-dispatched run (`bf60e21`) and survives transient polling failures (`49d3b6e`), plus several dispatch error fixes. `--run-id` is absent at the pin, and restart-safe resume depends on it, so Stage 2 must re-pin to a revision that has these changes.
- A freshly collected package is never `buildAuthorized`. Approval comes only from `artifact.mjs create --root <project>` after the kit's gate passes on a reviewed project: map classified, findings rewritten, brief TODOs answered and `Reviewed by: agent` declared.
- Research-Kit still has no LICENSE file, so redistribution rights remain unestablished.

## Decisions for the user

- **D1 Collector repository.** Recommended: a private repository the user owns that carries Research-Kit's `collect.yml` and the Firecrawl/SerpApi secrets. Topics and queries are readable by anyone who can read that repository, so a public collector only suits `public-technical` research.
- **D2 Collector token.** Recommended: a fine-grained token with only Actions read/write on that one repository, entered once through a dedicated main-owned field and stored in the existing encrypted vault. It must never be typed into chat, a model profile or a general IPC payload.
- **D3 Review mechanism.** Recommended: (a) unpack the collected corpus into a private research workspace outside project folders. The agent performs the three review steps there with Moonzila's existing reviewed edit tools and exact approvals, then the owned process runs the kit's own `preflight.mjs` and `artifact.mjs create`. This needs no Research-Kit change. Alternative (b): first add machine-readable review operations to Research-Kit in a separate PR, as the integration review allows. (b) gives a narrower interface, but the kit would need new design and tests first.
- **D4 Kit pin and licence.** Recommended: re-pin to Research-Kit `fcde0e6` or later with deliberate fixture review, and add a LICENSE to Research-Kit now. Its owner is the same user, so this is a decision rather than research. Without a licence, Stage 4 must keep the kit as a user-provided external installation.

## Constraints

- Research stays optional. `policy.research === 'off'` keeps every current flow unchanged, and folder-free chat never starts research.
- Dispatch is network egress of user text to GitHub. Admit it only for projects whose policy allows it, show exactly which fields become visible, and revalidate policy and trust revisions before dispatch and before each later effect.
- Main owns the token, the process and the network. The engine owns durable job state. The renderer only calls strict IPC and never supplies paths, executables, tokens or dispatch identities.
- The token reaches the collector process as one explicitly set environment variable inside the existing minimal environment; nothing else is inherited. Output stays bounded and redacted, and Stop or timeout ends only the owned process tree.
- Idempotent dispatch: persist the job and a generated `clientRef` before dispatching, and persist the run id as soon as the collector prints it. After restart, resume by run id; never dispatch a second run for the same job.
- Readiness comes only from a fresh validation of the exact retained bytes against the recorded dispatch identity. Receipts stay process-local as in Stage 1, and restart re-validates.
- Imported AGENTS, skills and hooks are never activated, and corpus pages are untrusted data, not instructions.

## Tasks

1. [x] **Revise contracts.** Removed `research.provision` and `research.review`. `research.start` now takes the collector's public inputs and requires `acknowledgedPublic: true`; it enforces single-line inputs that cannot look like flags, comma-free preferred domains, the 1–25 page budget and URLs counting against it. Collector repository and ref must start with a letter or digit. Added `research.list`, `research.review.start` (job and profile only, no decision field), and main-owned `research.collector.read/save`, whose results carry `tokenConfigured` and never the token. Job state and the `research.status` event share one `ResearchStatusSchema`. No handler exists yet, so every research method still answers `NOT_IMPLEMENTED`.
2. [x] **Durable job state.** Schema v3 replaces `research` with run-less jobs: constrained columns (status CHECK, unique `client_ref` and `workflow_run_id`, one active job per project) and an append-only `research_events` journal keyed by revision. SQL triggers refuse any state change without its journal row, any stale step, identity changes, a second dispatch and `approved`. v2 rows move verbatim to `research_legacy`. `src/engine/research-state.ts` holds the only edge table; `src/engine/research.ts` holds admission (strict policy and trust revision binding), `research.start/list/read/cancel`, and the main-facing controls `research.context/transition/recover`. A dispatch whose binding is stale is journaled as `failed` and returned as `refused`. Recovery never re-queues an ambiguous dispatch; it fails it as `REMOTE_STATE_UNKNOWN`. Job notices travel as a separate `research` engine message and `moonaliza:research` channel; `EventSchema` is unchanged.
3. [x] **Owned collection process.** Main runs the pinned `collect-remote.mjs` with fixed arguments, every value passed as `--name=value` (the kit's parser reads a separate value starting with `--` as a new flag), the token as its only credential and bounded output. **Correction:** under `--json` the kit does not print the run id before waiting, so dispatch with `--no-wait --json --client-ref=<clientRef>`, commit `dispatching -> collecting {workflowRunId}`, then watch with `--run-id=<id> --json`, which is safe to repeat. Commit `queued -> dispatching` through `research.transition` and spawn only on an `applied` reply. Exit 3 is not always "nothing dispatched": `NO_RUN_ID` and a network failure after sending are ambiguous and must fail as `REMOTE_STATE_UNKNOWN`, never re-dispatch. Exit 0 under `--no-wait` means dispatched, and a valid package can still be a `COLLECTION_FAILED` diagnostic; store the kit's `code`, not just the exit code. Call `research.recover` at app start and after an engine-only restart. Use `--run-id` for resume after restart or timeout (workflow artifacts expire after 7 days). Test dispatch, resume, Stop mid-wait, timeout, invalid package, failed run, missing token and redaction of tokens in output. Tests use a local fake GitHub API at the network boundary, not a fake collector.
4. [ ] **Verified import.** Pass downloaded packages through the existing adapter with the recorded binding (clientRef, repository, ref, commit, workflow, run id, attempt). Record the digest, validator identity and bound revisions with the job (decided: in the `collecting → collected` journal detail, not a column; the DTO's `packageDigest` stays unset until Task 5's v4 migration), and reject packages from a different run. Part 1 (the import) is done, see Progress; `research.purge` is open.
5. [ ] **Review (per D3).** Under (a): materialise the verified corpus into a private research workspace and run an agent review with exact edit approvals. Then run the kit's preflight and `artifact.mjs create`, and validate the new package as above. Readiness is shown only from that validation. Test a passing review, a failing gate, tampering between review and packaging, and restart mid-review. Specified in [research review](../../specification/research-review.md) (design only; its open questions Q1-Q9 need answers first).
6. [ ] **Renderer.** (Collection part done October 3, see Progress; evidence and brief reading and review progress wait for Tasks 4-5.) A research panel per project: start form showing what becomes public, live status, evidence and brief reader (bounded, rendered as untrusted text), review progress and actionable failures (missing kit, missing token, collection failed, review required, invalid evidence, stale, ready). No "authorize" control.
7. [ ] **Delivery.** Typecheck, lint, full tests, build/runtime and desktop journeys (start, restart mid-collection, cancel, review to ready). Package the Windows app, update the handoff, development status and release record, scan for secrets, push and open the phase PR, and verify exact-head Windows CI. The user merges.

## Acceptance

- With research off, all existing tests and desktop journeys pass unchanged.
- A job survives restart at every state and never dispatches twice.
- No token appears in the database, events, logs, renderer state or PR artifacts.
- `approved` is reachable only through the kit's own gate and a fresh validation of exact bytes. No Moonzila control can produce it.

## Progress

October 2, Task 1: `tests/research-contracts.test.ts` failed first because the new methods did not exist, then passed (7 tests). The credential test starts from a valid input for each research method, so only the added field can cause a rejection. A deliberate mutation that let `research.read` accept extra fields made it fail. Typecheck, lint and `check-handoff` pass. Review of the diff found that the kit's flag parser would read a query such as `--runner=windows-latest` as a flag; the contract now refuses such values and comma-bearing domains, and Task 3 must pass `--name=value`. On Linux the full suite runs 518 tests in 38 files: 442 pass, and the same 76 native/validator tests fail with and without this change (identical failure lists). They need the Windows helper and the prepared kit, so exact-head Windows CI is the acceptance check.

October 2, Task 2: `tests/research-jobs-state.test.ts` (29 tests) failed first because `src/engine/research` did not exist, then passed after implementation. The design came from a judged panel of three alternatives (explicit columns, a typed state document, a transition journal), synthesized into this one; it was rechecked against the files before coding. The v2 fixture `tests/fixtures/schema-v2.sql` was dumped from the unmodified code at `950479f` and reproduces all 48 schema objects. Eight deliberate mutations were each caught: dropping the v1->v2 version chain, the single-dispatch index, admission on dispatch or the research-off refusal; allowing `approved` through the control; publishing on replay; re-queueing an ambiguous dispatch; and removing the explicit stale-revision check. Under the last, a racing second dispatch is still refused by the edge check and nothing is written; only the error code differs. That check exposed that the store derived the next revision from the current row; it now derives it from the caller's expected revision, so the database refuses a stale writer too. Mistakes caught during the work: two test bugs (a duplicate client ref hit the one-active-job index first; a reused run id hit the run-id uniqueness) and one code bug (the DTO carried `undefined` optional keys). Typecheck, lint and `check-handoff` pass; cwd `/home/user/moonzila`. On Linux the full suite runs 547 tests in 39 files: 471 pass, and the same 76 native/validator tests fail as before (identical failure lists). Exact-head Windows CI is the acceptance check.

October 2, D4 re-pin (Task 3's first commit): the validator pin moved from `5588ce3` to `fcde0e6`, which descends from it by 64 commits and adds the collector's `--run-id` (`bf60e21`) and poll retries (`49d3b6e`).
- Facts: 31 runtime files are modified and none added or removed. The fixture identity (`identity.commit = 5588ce3`) and every ZIP are unchanged.
- Generator: `scripts/generate-research-fixtures.mjs` gained `--inventory-only`, parses its option before any write, and keeps the recorded identity in both partial modes. Without that, a re-pin wrote `identity.commit = fcde0e6` and failed the consumer-binds tests with IDENTITY_MISMATCH.
- Checks on Linux, Node 24.21.0, cwd `/home/user/moonzila`:
  - a mistyped option writes nothing;
  - a tampered expectation is refused, names `legacy-review` and writes nothing;
  - a control run at `5588ce3` leaves both files byte-identical;
  - the re-pin reproduces all 15 reports and changes only `validatorRevision` and the 31 inventory entries;
  - `tests/research-kit.test.ts` gives 22 passed and 21 failed, all 21 on the Windows baseline.
- Known unknown: the collect-remote and dispatch contract at `fcde0e6` has no captured evidence in `research/`. It was read from the kit's source, and Task 3's golden-payload freshness test is its day-one check.

October 2, Task 3 part 1, the collector protocol: `src/adapters/research-kit/collector.ts` holds:
- argv: one `--name=value` element per value, and a watch has no topic;
- the minimal environment plus the token;
- the CreateProcessW length check;
- tables A and B. Per the October 2 artifact-download brief, NO_ARTIFACT past the 7-day retention means ARTIFACT_EXPIRED.

How it was tested:
- The classifiers run on 33 real outputs of the pinned kit, captured against `tests/fixtures/fake-github.ts`, a loopback proxy and a test CA. A freshness test re-runs the kit and requires the same bytes.
- `tests/research-collector-protocol.test.ts` (44 tests) also checks:
  - the one authenticated POST and its body;
  - no token sent to the redirected artifact host;
  - no request without a token;
  - a TLS canary;
  - the pinned kit's `parseFlags` reading exotic values back exactly.
- The module was written before its tests, so five deliberate mutations stood in for a first red run; each turned the suite red:
  - NO_RUN_ID as not dispatched;
  - PATH and GITHUB_TOKEN inherited;
  - `--topic` on a watch;
  - kit text as a cause;
  - a fresh approval accepted.
- Full Linux gate, cwd `/home/user/moonzila`: 506 passed and 75 failed, all 75 on the Windows baseline, with no leftover temp directories.
- The October 2 briefs on run reconciliation and artifact download (PRs #22, #23) were checked against this design. Digest verification and a run search after a 204 are kit changes, recorded as Research-Kit work. A secondary-limit 403 parks the job as a credentials problem until a status field exists.

October 3, Task 3 part 2a, the supervisor and the guarded launch (committed; the main wiring followed in `3176fa7`, merged in PR #28). The behaviour is specified in [research collection](../../specification/research-collection.md).
- `src/main/collector.ts` (`CollectorSupervisor`), with `planStep` and `CollectorSettings` from the earlier commit. `ResearchKit.prepareCollector` shares the validator's `guardedRun`.
- Tests:
  - `tests/research-collector-supervisor.test.ts` (11): the real Store, ResearchJobs, ControlSchema and an AES vault, with a scripted kit replaying the real kit's goldens.
  - `tests/research-kit-collector-launch.test.ts` (3): the real pinned kit, with a runner standing in for the helper.
  - Ten mutations each turned a suite red.
- Bugs found by testing and review, all fixed:
  - `launch()` captured `started` before awaiting the child, so every dispatch read as HELPER_UNKNOWN.
  - A withdrawn admission never reached the planner.
  - A negative exit code formed an invalid cause (`KIT_EXIT_-n`).
  - A grown runtime file failed as INPUT_LIMIT rather than INSTALLATION_INVALID.
  - Two tests raced admission.
- Linux gate, cwd `/home/user/moonzila`: 554 passed, and the 75 failures are the Windows baseline.
- Script follow-ups from the break test, landed with this part:
  - the build empties `dist/` first;
  - the Research Kit scripts run from the repository root;
  - `exportSource` fetches a missing pin by SHA and uses `--git-dir`.

October 3, Task 4 part 1, verified import. The behaviour is specified in [research collection, Verified import](../../specification/research-collection.md#verified-import).
- `src/main/research-import.ts` (`packageImporter`) reads the GitHub run once, with the token in the `Authorization` header from a 30-second grant and no redirect followed. It checks the run is the dispatched one, binds the run's commit and attempt, never the package's, and validates with `ResearchKit.validate`. The supervisor commits the answer through `planStep`. `src/main/index.ts` wires it.
- Decisions on the "Recorded for later" items:
  - The binding's workflow is the literal `collect.yml` and its ref the run's `head_branch`, checked against the job's ref without `refs/heads/` or `refs/tags/`.
  - `projectRevision` is the job's admitted policy revision. The trust revision is covered by admission, which `planStep` re-checks at the commit.
  - The bound job revision is the `collecting` revision. The engine refuses a verification bound to any other job or policy revision.
  - The verification goes on `collecting → collected` in that step's journal detail. There is no column and no v4 migration: the edge requires it, the journal is append-only, and Task 5's v4 migration can add a column if a SQL rule needs one.
- Tests:
  - `tests/research-import.test.ts` (5): the real Store, ResearchJobs, ControlSchema, supervisor and ResearchKit staging the pinned kit, with a runner that runs the validator with node and replays the kit's goldens for the collector, plus a fake GitHub at the fetch boundary. It covers a verified package, packages from another attempt or commit, five run mismatches, four deferrals, and the importer's approval, failed-collection, tampered and deferral cases.
  - The supervisor (3), plan (4) and jobs-state (1 test and stricter control checks) suites gained cases.
  - Eleven mutations each turned a suite red. One first survived because the deferral test waited a fixed 150 ms; it now waits for the importer's answer.
- Linux gate, cwd the team worktree, Node 24.21.0: typecheck and lint clean. Full suite 652 tests: 577 pass, and the 75 failures are exactly the Windows baseline.
- Found in passing, not changed here: the supervisor never disposes a dispatch launch's folder (`storage/collect/<uuid>`), so it stays until the next start's sweep.

October 3, the six spec-review items: five fixed in `src/main/collector.ts` (with `src/tools/commands.ts` and the adapter for the admission bound, `src/shared/params.ts` for the budget), one kept and justified, each its own commit.
- Each fix has a test that failed first, except the budget refactor (no behaviour change), whose test was shown to fail under mutation instead. Every new test was also turned red by at least one deliberate mutation.
- The stale-epoch test reproduces a real gap: a watch launched between an engine-only restart and the vault's new epoch was refused although the token was saved, and waited for a user's save.
- Linux gate, cwd the team worktree: typecheck and lint clean; full suite 644 tests, 569 passed and the 75 failures are exactly the Windows baseline; `tests/research-collector-supervisor.test.ts` (15) passed 20 times in 20 runs.
- Not verifiable on Linux: the helper's admission timer itself (`spawnOwned`); exact-head Windows CI is its check.

October 3, Task 7 preparation, the research desktop journeys. The collector's minimal environment has no route to a fake GitHub, so the journeys load a test-only preload into main with Electron's `-r`; it adds the loopback proxy and the test CA to collector launches on their way into the native helper. No production code changed. Design, rejected alternatives and evidence: [research journeys](../../specification/research-journeys.md).
- `e2e/research-journeys.spec.ts`: a harness check on every OS; start, restart mid-collection and park at import (the import's GitHub run read is refused by the harness, so it defers; a journey ending `collected` needs the fake to serve the run, Task 7), and cancel mid-collection on Windows only (they need the helper). Unpackaged app only: a packaged executable ignores `-r`, so the file skips under `MOONALIZA_TEST_EXECUTABLE`, and every launch fails closed when the harness is missing.
- `tests/research-journeys-network.test.ts` (4) runs the preload against the real `spawnOwned` encoder, including its refusals and the collector outcomes journey 2 uses to tell the import park from a kit or credentials park.
- On Linux under xvfb the harness check passed and the two journeys were skipped; they have not run yet. Exact-head Windows CI is their first run.

October 3, Task 6, collection part: `src/renderer/ResearchPanel.tsx` with `src/renderer/research-text.ts`, opened per project.
- It has a start form that names exactly which fields become public on GitHub, with the acknowledgement bound to the collector repository.
- Collector settings have a write-only token field: `tokenConfigured` is shown, never the token, and the token can be cleared.
- Live status comes from `onResearch` notices; there is a cancel action, and every job failure in the collection spec has its own message.
- `tests/research-panel.test.tsx` (28 tests) runs in the `ui` project. The panel has not been run in Electron or on Windows; the desktop journeys cover the backend only.

October 3, integration of the five build teams (import, collector items, small fixes, renderer, e2e journeys) and three docs teams onto `main-axuse`, under the lead-orchestrator process.
- Twenty-seven team commits were cherry-picked in plan order. Each code commit gained an ARCHITECTURE.md sentence, now required by the Research-Kit commit gate.
- One integration defect: the panel had no message for the import's two new failures (`a781265`).
- Phase 4 review by four independent roles (spec, breaker, mutation, invariant):
  - fixed: the e2e test token reaching the real GitHub (S1), admission not re-checked on `collected`, a torn retained package, a store fault failing a good package (S2), and stale docs (S3);
  - the invariant auditor found all six invariants holding;
  - 60 mutations: 45 detected at first, 7 more after new tests, and the rest recorded below.
- Linux gate at `8c60521`, cwd `/home/user/moonzila`, Node 24.21.0: typecheck, lint and build clean. 696 tests: 622 passed and 74 failed, all in the Windows baseline. `research-kit.test.ts` "changed runtime and missing installation fail closed" now passes on Linux, because the missing helper maps to `INSTALLATION_INVALID`; it still tests the hash check on Windows.

## Recorded for later (not in Task 2)

- **Task 3:** stop owned collectors on `research.cancel`, `project.revokeTrust` and `project.policy.update` (Task 2 only refuses at the next effect); decide whether a collector survives an engine-only restart (done: it does, and recovery skips owned jobs); implement `research.collector.read/save` (done); re-pin Research-Kit to `bf60e21` or later for `--run-id` (done: `fcde0e6`). Because the binding uses strict revision equality, any project policy edit (including an inference-only one) fails a queued job at dispatch.
- **Task 4 (part 1 resolved October 3; purge open):** the package manifest's `workflow` is always the literal `collect.yml` and its `ref` is the short `GITHUB_REF_NAME`, so they will not equal a configured `refs/heads/main` or another workflow file name; commit and run attempt are not returned by dispatch or `--json` and must come from the GitHub run (never from the package being validated); choose which project revision feeds the adapter's single `projectRevision`; record the job revision a receipt was bound to, because every transition bumps it. Implement `research.purge` with retained-byte deletion. Required verification fields go on `collecting -> collected`.
- **Task 5:** add review edges (and retry edges such as `not_ready -> reviewing`), replace the `research_readiness_reserved` trigger with a digest-gated rule in a v4 migration, and stream `research.status` on the review run.
- **Task 3, from the spec review (October 3): decided.** None can dispatch twice. The [collection spec](../../specification/research-collection.md) describes each resolved behaviour, and its "Differences from the design" keeps the one kept item.
  - Resolved: a `collecting` job without a readable `dispatchedAt` is watched against `createdAt` + 7 days instead of expiring at once.
  - Resolved: a watch's `CREDENTIAL_DENIED` parks for credentials at once only when the reference is gone from the settings or the vault; with it still saved the refusal counts, and parks after three in a row (a watch that started, or a park, restarts the watch count; dispatch refusals do not carry into it).
  - Resolved: the start input budget is `RESEARCH_INPUT_BUDGET` in `src/shared/params.ts`; `COLLECTOR_LIMITS.startInputBudget` is removed.
  - Resolved: the helper's admission timer takes `admissionMs`, so the whole pre-start step is bounded at 60 s.
  - Resolved: a job held after a commit error stays in `ownedIds()` until the next app start, so recovery after an engine-only restart (or at attach, after a failed replay) cannot fail it and drop its spooled run id.
  - Kept: `STOPPED` waits without counting; it only follows the supervisor's own stop, and counting it would let user holds fail a job.
- **Decided by the user, October 3 (after PR #29):**
  - The next cycle is Task 5, the research review.
  - `research.purge` deletes only the retained ZIP. The job and its journal stay. It is allowed only for finished jobs whose digest no other verification references.
  - Research is turned on through a confirmation dialog, as "Allow cloud inference" is, offering only `public-technical`.
  - An inference-only policy edit no longer ends research jobs; only a change to the research setting or to trust does.
- **Task 5 work breakdown (lead-orchestrator, October 3).**
  - Prerequisites, all done:
    - research: three corpora, `1202d5a` `7f361bd` `4b682ec`;
    - decisions: `00daa0c`;
    - frozen contracts: `fb34691`, `src/engine/review-contract.ts`;
    - Q1 admission: `f582f16`.
  - Units: one commit each, disjoint files, in this order.
  - Wave 1, in parallel:
    - **B0 schema v4.** Files: `migrations.ts`, `store.ts`, `research-state.ts`, `research.ts` transition writes, the shared status list, `tests/research-jobs-state.test.ts` and a `schema-v3.sql` fixture.
      - Adds the `packaging` status, the `engine` actor and the review columns and checks.
      - Replaces the readiness trigger with the digest-gated one, against the collected digest in the journal.
      - Adds the reviewed-columns immutability trigger, the v4 review edges and per-edge review writes.
      - Changes `recoverInterrupted` to keep a named `awaiting_review` run.
      - Implements `research.review.context`.
    - **B5 fuses.** `electron-builder.yml` `electronFuses`, plus a check script that reads the fuses back on the packaged exe.
    - **B6 Windows guard tests.** A Windows-only test of the helper's guards (Q9 day-one check) and of replace-by-rename.
  - Wave 2, after B0:
    - **B2 engine review run.** Files: `src/engine/research-review.ts`, `application.ts`, `policy.ts`, `operations.ts`, `tools/files.ts`, `tools/reads.ts`.
      - `research.review.begin`, mode `research` and `rootFor(run)`.
      - The allowlist before prepare, the protected-root exemption, and `undoAuthority`.
      - The cancel branch, run-end transitions, and the kit-tool port.
    - **B3 main review supervisor.** Files: `src/main/review.ts`, `src/main/review-workspace.ts`, `adapter.ts` `prepareReview`, and the `index.ts` wiring.
      - review.start, materialisation, the kit tools, freeze, packaging, recovery and sweep.
    - **B4 renderer review UI** in `ResearchPanel.tsx`.
    - **B8 research enable dialog.**
  - Wave 3:
    - **B7 `research.purge`** (retained ZIPs only);
    - docs;
    - Phase 4 review (spec, breaker, mutation, invariant) on the integrated branch.
- **Resume here (October 4 handoff; the conversation was cleared).** The run ledger `docs/orchestration/2026-10-03-task5-research-review/RUN.md` is now the first thing to read; its Next action line says what to do. The rest of Task 5 ships in phases. Each phase is one draft PR from `main-axuse`; when the user marks it "Ready for review", the lead merges it once Windows CI is green on that head (user instruction, October 4), then `main-axuse` is fast-forwarded to `main`, and the lead asks before starting the next phase.
  - Skills, every phase:
    - `lead-orchestrator`, with each sub-agent on the model most likely to succeed at its role;
    - `careful-coding` in the lead's own work and in every brief;
    - `brainstorming` at the start of a phase whose shape or a decision is open: ask, compare, and get the user's approval before building;
    - `gap-audit` and `break-test` in the last phase, on the integrated feature.
  - **Phase 0, in review:** the research corpora, the decisions, the frozen contracts, the Q1 admission fix, the lead-orchestrator skill update and a merge of `main` (PR #30). Gate on the merged head: typecheck, lint and build pass; 74 tests fail, all of them the Linux baseline.
  - **Phase 1: schema v4 and the Windows guard tests (integrated October 4, in review as a PR).**
    - Units: B0 schema v4 and B6 Windows guard tests, cherry-picked from the wave-1 branches.
    - The lead's follow-ups (`4627d8d`):
      - `packaging` in the panel's label and lists;
      - one shared `FINISHED` set;
      - `research.recover` passes `reviewFolders`.
    - The four-role review on the integrated branch (spec, breaker, mutation, invariant, all on Opus). Dispositions:
      - **Fixed:**
        - breaker F1 (S1): SQL fixtures check out with LF (`59fca6e`); Windows run 149 failed on exactly this.
        - Fixed in `52353b1`:
          - F2 (S1): a cancelled review waits for its run;
          - F3 (S2): the readiness trigger compares the collected digest lowercased;
          - F4 (S2): `reviewDiscard` returns only plain folder names.
        - Five new tests stayed green with their own guard removed (S1 under the skill's rule), and four tests were missing (S2); all closed in `3c9e1d0`.
      - **Owned by Phase 3** (unreachable while `research.review.begin` is `NOT_IMPLEMENTED`):
        - `research.cancel` on `reviewing` must abort the review run in the same request;
        - `session.delete` must refuse a session a reviewing, packaging or not_ready job references;
        - main's commits must append `research.status` to the review run;
        - a retry must carry a new, live run of mode `research` (breaker F5);
        - a control-level test of `src/engine/index.ts` for `research.recover` with `reviewFolders` and for `research.review.context`, since the entry runs at import (spec review S2, mutation audit);
        - decision D1 below.
      - **Recorded, not fixed:**
        - Only raw SQL can reach these two: before approval a journaled `packaging → not_ready` step can rewrite the review columns; a journal row written outside a transaction can strand its job (invariant audit).
        - The U-08 day-one check (`sqlite_version() >= 3.26.0` and `legacy_alter_table = 0` under Electron) is not asserted; plain Node reports 3.53.4 and 0.
        - Equivalent mutations: the allowlist check, the freeze guard's status test, and the DROP order.
        - The spec's `changes` entry lists a `status` that the frozen `ReviewChangeSchema` does not carry.
      - **Rejected:** none.
    - B6's tests run only on Windows. Its directory-guard gap is recorded in the test file. If Windows CI shows a rename over a destination held open by a Node handle succeeding, revisit the brief's U-07/U-10 decision; do not weaken the test.
  - **Decision D1, made by the user on October 4: one public code `REVIEW_NOT_READY`** (contract committed at the start of Phase 3). Original question: how a review run ends when main's step leaves the review. The spec says `run.failed` carries a public error code, but `ErrorCodeSchema` has none for the review failures. Either map them onto existing codes or add codes to the contract, and name the unit that owns the change. Until this is settled, after a refused freeze or a failed gate the run stays `awaiting_review` until restart.
  - **Phase 2: Electron fuses and the test-only package (integrated October 4, in review as a PR).**
    - **Decision D2, made by the user on October 4:** a test-only package, after research the user asked for first. The corpus is `docs/research/2026-10-04-playwright-fused-electron` (8 pages, free transport, gate PASS, re-run by the lead). It is recorded as decision 13.
      - Playwright's launch waits for the `--inspect` debugger line (U-1).
      - No fuse controls `--remote-debugging-port` (U-2).
      - A CDP attach loses the main-process `evaluate` that 8 of the 10 specs use (U-3).
    - Units:
      - `343d6af`: the corpus.
      - `680a8c5`..`966c870`: B5 (fuses, `check-fuses.mjs`, tests).
      - `e3e55d5`: the test-only package (`package:win-e2e`, `--test-package`, the workflow steps, decision 13, the exe name `Moonzila.exe`).
      - `48c2a87`: review fixes.
    - Review on the integrated branch (spec+breaker combined, mutation; both on Opus). Dispositions:
      - **Fixed in `48c2a87`:**
        - the docs said the check refuses any other difference, but it reads 5 of 9 fuses and compares nothing else (S2);
        - `research-journeys.md` named `MoonAliza.exe` (S2);
        - five mutations went unnoticed: the unknown-byte label, the default path, the signing env, `asar: true`, `continue-on-error`.
      - **Recorded:**
        - `package:win-e2e` must run after `package:win`, whose `dist/` and native helper it reuses; decision 13 says so.
        - `@electron/fuses` is a transitive dependency of electron-builder, not a direct one.
        - The 35-minute job timeout now covers two packagings and two e2e runs; the first `workflow_dispatch` run measures it.
        - Defender may lock the synthetic `MZ` files the tests write to `%TEMP%`; no Windows run has shown it.
        - Embedded asar integrity is checked only on Windows and macOS, so only a `workflow_dispatch` run proves the e2e package loads under it.
        - No fuse removes `--remote-debugging-port` from the shipped exe; its reach is a day-one check (corpus U-4).
      - **Rejected:** none.
    - Still open from B5: pinning `eol=lf` for `electron-builder.yml` and the workflows (the tests normalise CRLF); `grantFileProtocolExtraPrivileges` stays at Electron's default because the renderer loads over `file://`.
  - **Phase 3: the review run, integrated October 4, in review as a PR.**
    - Commits:
      - D1 `255d6e3`;
      - contract amendments `d68eb57` (verification) and `364bc55` (change status);
      - B2 `df64924`; B3 `4eeab35`, `c24ff40`; B10 `b156c88`;
      - fix round: engine `8bef5cf`, `74fda0f`, `6335563`, `527bb55`; main ten commits `ba08b72`..`b87dad8` as integrated; `301177a`.
    - Review: spec, breaker, mutation, invariant (all Opus) and one cross-vendor reviewer (GPT).
    - Every S1 is fixed with a test that fails with its guard removed:
      - edits lost on retry;
      - a stuck start after an engine restart;
      - a kit child after cancel or trust change;
      - the untested approval guard;
      - the brief file locked on Windows (cross-vendor);
      - a junction at or above the workspace (cross-vendor).
    - S2 vocabulary and project-scoped `RUN_ACTIVE` are fixed. Every other disposition is in the spec's "Phase 3 as built".
    - Only Windows CI can verify: real NTFS junctions, the native helper's lock share mode, `rm` of a junction, short-name realpath.
    - **Reminder for the user (asked October 4):** when Phase 3 is integrated and its four-role review starts, remind the user to run one extra, cross-vendor reviewer (a GPT model). Hand them a self-contained breaker/spec brief to paste in:
      - the commit range and the spec sections;
      - the research briefs;
      - the focus list (concurrency, restart recovery, approved writes, the cancel paths);
      - the report format (location, reproduction, severity).
      - Settings: OpenAI's most capable reasoning model, at its highest reasoning effort. The user checks the current model list.
      - It is read-only, with no keys or tokens. Its findings are triaged like any reviewer's, and every S1 is reproduced before it is fixed.
      - The second use is Phase 5's gap-audit, as a second opinion.
  - **Phase 4: the review UI, reader and research switch, integrated October 4, in review as draft PR #36.**
    - Commits on `main-axuse` (cherry-picked from the unit branches):
      - frozen contracts `7bc04e6` (`research.document.read`, the `DOCUMENT_*` codes) and `c5fcd54` (internal controls `policy.guard`, `session.project`);
      - B4b card label `f8972f7`, fix `58bafd9`; lead wiring of `runMode` `792e68e`;
      - B4 panel `6019045`; B8e policy guard `805b97d` (engine), `5e5e35e` (main route);
      - B11 reader `1465f12`; B8 switch `62a3738`, with B4's fixes `fb96e40`, `f64bf4a`, `d4c44d6` and the lead's `onProjectChange` wiring `06448f1`;
      - P4-10 fix `8a98676`, `5e8eb63`; B12 e2e journey `9bd469f`, `e5d5385`, `b06bef8`;
      - B11 fixes `622c57d` (P4-14), `a111b29` (P4-16), `cd2f077` (P4-18).
    - Built:
      - `src/main/research-document.ts` (`readResearchDocument`): the brief and evidence reader, validated in each call, redacted before the cut;
      - `src/main/policy-route.ts` (`createPolicyRoute`): one per-project lock for `project.policy.update` and `run.start`; a research-only change refused `RUN_ACTIVE` before anything is stopped, re-checked by the engine;
      - `src/renderer/ResearchPanel.tsx`: Start review with a model picker, Open review, Cancel review, the live readiness check (`ApprovedCheck`), the reader (`DocumentReader`) and the research switch (`ResearchSwitch`); `src/renderer/ChangesPanel.tsx`: the "Research workspace" card label;
      - e2e journey 4 in `e2e/research-journeys.spec.ts`: allow research, collect, read the collected brief (Windows only).
    - Review: a unit reviewer per unit (Opus), then the integration spec review and invariant audit (Opus). The invariant audit found every Phase 4 invariant holding at `ab97386`. Every disposition, and every place the build differs from the design, is in the UI spec's [Phase 4 as built](../../specification/research-review-ui.md#phase-4-as-built-october-4).
    - **Fixed**, each red first or with the guard removal turning its test red:
      - P4-1 (S2): a stale approval card relabelled from the current run's mode;
      - P4-6 (S2): Open review switched conversation during an active run, and a late conversation list could overwrite a project switch;
      - P4-10 (S2): the route read sessions through `session.read`, capped at 10000 runs; it now uses `policy.guard` and `session.project`;
      - P4-14 (S2): a validator that could not finish read as "Unverified"; it is now the internal `VALIDATOR_UNAVAILABLE`, shown as `RESEARCH_KIT_UNAVAILABLE`;
      - P4-7, P4-8, P4-16, P4-18 (S3): missing tests for Start review's conditions and the digest in the reply key, a FIFO hanging the read, and the untested post-read containment check;
      - P4-20 (owed e2e journey): written (B12); its first real run is Windows CI.
    - **Accepted:** P4-4 (the builder's decisions: the history label, the reader in more statuses, review wording for shared codes); P4-15 (the reader written before its tests, accepted with 15 guard removals as the red proof).
    - **Recorded, not changed:**
      - P4-2, P4-3: the original route read every session (removed by P4-10); a replayed `project.policy.update` can be answered `RUN_ACTIVE` when a Build run started since (no side effect);
      - P4-11: `RUN_ACTIVE` is answered before the engine's `REQUEST_CONFLICT`;
      - P4-21: the panel recognises `RUN_ACTIVE` by its public message, pinned to `src/main/bridge.ts` by a test;
      - for Phase 5: P4-12 (a replayed `run.start` re-admits a capability for a finished run, pre-existing), P4-17 (any non-ENOENT I/O error reads as `DOCUMENT_UNSAFE`), P4-19 (`project-member` authorization is declarative, pre-existing), P4-24 ("Cannot check" for a verifying package whose brief is refused);
      - P4-27: a run created outside `run.start` must take the project lock; recorded under missions below.
    - **Moved out:** P4-23 (S2, pre-existing): main's folder guards walk from the filesystem root, so a linked parent of the data folder disables reviews. Its own task below, [Linked parent above the data folder](#linked-parent-above-the-data-folder-found-october-4-as-p4-23-its-own-task).
    - **Process:** P4-5 and P4-13 were permission refusals (a cherry-pick and a reset), neither worked around; P4-22 was a wrong fact in the B12 brief, corrected by widening its scope.
    - **Rejected:** P4-9 (Start review after a trust change: the engine refuses `TRUST_CHANGED`).
    - Only Windows CI can verify: e2e journey 4, real junctions in the reader tests, and the reader's open flags on Windows.
  - **Phase 5:** B7 `research.purge`, docs, the four-role review, then `gap-audit` and `break-test`.
  - **Watch:** draft PR #31 (another session) renames the product to Moonzila and specifies Operate mode. Check whether it has merged before each phase starts; merge `main` into `main-axuse` (never rebase) when it moves.
- **Open after the October 3 integration (owner: the next research cycle unless the user decides otherwise).**
  - Decisions for the user:
    - `research.purge` semantics. The contract deletes the job; the source plan keeps the metadata. The import team recommends keeping the job and its journal and deleting only the retained ZIP, for finished jobs whose digest no other verification references.
    - How research is turned on: nothing in the app changes `policy.research` from `off`. The renderer team recommends a confirmation like "Allow cloud inference" that offers only `public-technical`.
    - Whether an inference-only policy edit should still end research jobs. Decided October 3: it does not; admission compares the research level and trust (done in the Task 5 cycle).
    - Whether `research.start` should carry the acknowledged repository, so that main refuses a stale acknowledgement.
  - Product work:
    - a park-reason field on the job DTO, so the panel can say why a collecting job waits;
    - research-specific public messages for collector save conflicts;
    - a bounded retry of a deferred import inside the watch deadline, instead of waiting for the next start;
    - deleting verified-but-rejected packages;
    - disposing a dispatch launch's `storage/collect/<uuid>` folder at once, not only at the next sweep;
    - the profile dialog's API key held in a controlled input.
  - Task 7: route the importer's run read to the e2e fake so a journey ends `collected`, and decide whether packaged runs cover the research journeys.
  - Tests the mutation audit asked for, not yet written:
    - waiting watch refusals never park (C19);
    - a tag ref `refs/tags/v1` end to end (S08);
    - an `APPROVED_BRIEF` receipt without `researchReady` is rejected (I17);
    - invalid UTF-8 in the run body (I08);
    - `INPUT_LIMIT` from archive inspection is not turned into `ARTIFACT_INVALID` (A06);
    - the e2e preload deletes its variable (N05);
    - `projectRevision` checked against the policy revision with different policy and trust revisions (S09);
    - Windows tests of `spawnOwned`'s `admissionTimeoutMs` validation and clamp (K01-K04).
  - Not testable cheaply: the retained-package write is temp plus rename. A crash mid-write cannot be produced in a test, so replacing it with an in-place write is not detected; the recovery of a torn file is tested.
  - Research spec open questions: Task 5 review Q1-Q10 (`docs/specification/research-review.md`), project memory (`docs/specification/project-memory.md`), and knowledge base decisions D1-D7 (`docs/superpowers/plans/2026-10-03-coding-knowledge-base.md`).
- **Next cycle (user instruction, October 3):** run it with the lead-orchestrator and careful-coding skills. Research the external facts through Research-Kit before designing anything: one nested project per topic under `docs/research/<date>-<topic>/`, the corpus committed with its ledger, and 20 pages in total.
- **Small follow-up (done, October 3):** `src/engine/policy.ts` threw `RESEARCH_DISABLED`, which is not in `ErrorCodeSchema`; the tool-policy path now throws the contract code `RESEARCH_NOT_ALLOWED`, as research admission does.

## Next phase after research: missions

User decision, October 2: finish this research phase first, then build missions (source-plan tasks C3/C4). Moonzila may propose splitting a hard task into several agents, but it must **always ask for approval** first, showing the agent count, step budget, cloud or local profiles, and whether agents run in parallel. Local parallel agents need a warm runtime and concurrent scheduler leases (the scheduler is currently one-at-a-time and stops the runtime after each lease); cloud profiles can run in parallel.

User direction, October 2: the mission should decide from the machine's resources which model each agent uses and how many agents run, as local model selection already does. The user approved this design on October 2. It follows `selectLocal` (`src/models/select.ts`, [selection policy](../../specification/model-store-selection.md)):

- **A pure mission planner** chooses per-agent profiles and concurrency from measured evidence only: qualified machine receipts, current free RAM/VRAM under the same reserve rule (`max(2 GiB, 15% of RAM)`), project cloud policy and the step budget. Hard subtasks may get a stronger profile, simple ones a smaller one; cloud only where the project allows it.
- **Concurrency is measured, never guessed.** Today's receipts measure one model at a time. Running N agents on one loaded model needs receipts measured at each concurrency level (each extra agent adds its own context memory). Without such a receipt the planner runs agents sequentially, or offers a short monitored probe first.
- **The planner fills the approval card; the user still approves** (agent count, model per agent, parallel or sequential, local or cloud, step budget). Resources are rechecked under the lease before each agent starts; if they drop, the mission falls back to sequential instead of failing.
- On the current PC (about 1.15 GiB free, below the reserve) the planner must report that no local agent fits and offer only policy-permitted cloud agents.
- **Project lock (P4-27, recorded October 4).** Main's policy route (`src/main/policy-route.ts`) locks only `run.start`. Any mission path that creates a non-research run outside `run.start` must take the same per-project lock; otherwise a research-only policy change can pass main's check, so main aborts and holds before the engine's re-check refuses it.

## More models (user request, October 4; its own task after Task 5)

User request, October 4: add more models to Moonzila, as its own task after Task 5, research first. Today Moonzila already reaches many models through profiles (`ollama`, `openai-compatible`, `openai-responses`, `anthropic`; `ProfileKindSchema` in `src/shared/contracts.ts`) and a signed managed catalogue of local models and runtimes (`src/models/catalogue.ts`), hardware-qualified before use.

Three directions, all in scope; their order is decided at the brainstorm:
1. **More one-click local models** in the managed catalogue: each needs a download artifact, a hardware qualification and a signed catalogue update.
2. **Native profile kinds** for providers that are not OpenAI-compatible (for example Google Gemini's own API): an adapter and tests each.
3. **Smarter selection**: rank cloud and local models by cost and quality per task, building on `docs/research/2026-10-02-model-pricing-and-ranking`.

Research first (a Research-Kit project): which coding models are worth adding, judged on tool-calling reliability, licence, size and hardware, and price. A curated, tested shortlist, not a count. Constraints: the current PC has about 1.15 GiB free memory (below the reserve), so new local models must not be offered where they do not fit; cloud models stay behind the project's inference policy.

## Linked parent above the data folder (found October 4 as P4-23; its own task)

Main's folder guards refuse every storage path when any folder above Moonzila's data folder is a link (Fedora Atomic's `/home -> var/home`, a `C:\Users` junction): `privateDirectory` (`src/models/artifact-files.ts:16`, used by the model store, downloads, archives, the runtime, managed Ollama and the Research Kit store), `containedFolder` (`src/main/review-workspace.ts`) and the reader's walk all lstat from the filesystem root. The engine's `containedReviewWorkspace` checks only below the data folder and compares realpaths, which is what both specs say. Pre-existing since before Task 5; taken out of Phase 4 because the fix changes a security guard used across the app. To do: anchor each guard explicitly (models, downloads, runtime, research-kit storage), lstat only below the anchor, keep the realpath equality check, record the rule as a decision, and test both directions. Red tests: `docs/orchestration/2026-10-03-task5-research-review/reports/p4-23-red-tests.patch`.

## Self-unblocking with research (user request, October 4; its own task after Task 5)

User request, October 4: when a Moonzila run is blocked, it first tries to resolve the blocker itself. If it cannot, it uses the research tool to find out how, applies the findings to the project, and pushes a pull request without merging. The user chose to make it its own task after Task 5 (not part of Phases 4-5). Its order relative to project memory and missions is decided when it is brainstormed.

What is fixed by the request:
- Moonzila tries its own fix first; research only when that fails.
- The fix rests on the research findings: the reviewed, research-ready package from Task 5, never an unreviewed corpus.
- The result is a pull request on the project's repository. **Moonzila never merges**; the user does.
- **If research with the kit cannot solve it, Moonzila notifies the user** (user, October 4): it says what blocked the run, what it tried, and what the research did and did not establish, and opens no pull request.

Open for the brainstorm (not decided):
- How the notification reaches the user (the run's conversation, a notice in the workbench, both) and what counts as "cannot solve": a research job that ends `not_ready`, findings that do not cover the blocker, or a fix that still fails.
- What "blocked" means: a failed command or test, an unknown API, a refused tool, a budget ended; and how many self-attempts come first.
- Disclosure: a collection's topic and queries are readable in the user's collector repository on GitHub. A blocker description built from project code could leak private content. The research query must be public-technical only and shown to the user before dispatch, as the research switch requires today.
- Approval: whether starting the research, and opening the PR, each need the user's confirmation (missions already require approval for multi-agent work).
- GitHub write access: Moonzila has a collector token and read-only GitHub URL reading; pushing a branch and opening a PR needs a write path, a token scope and its own vault handling.
- Budgets: the research page budget and the run's step budget across both attempts.

## Project memory (proposed for after this phase, before missions)

User request, October 2: sessions must be stored and the user must be able to switch modes freely without Moonzila forgetting where work stopped, repeating mistakes or rewriting finished work. Reference: [ProjectBrain](https://www.projectbrain.tools/), a hosted, structured memory of tasks, decisions, facts and skills shared across sessions and agents.

Current state (verified October 2): conversations, runs, messages and events persist in the engine database; the mode is chosen per message, so one conversation already spans Ask, Plan and Build. Forgetting comes from context assembly (`src/engine/context.ts`), which drops the oldest turns from the model request when the window fills (reported as omitted history), and there is no memory shared across conversations and no record of mistakes.

Proposed design (local, not the hosted service, consistent with local-first privacy):

- **Per-project memory records** in the engine database: tasks (todo, in progress, blocked, done), decisions with rationale, facts and constraints, and lessons (a mistake, its cause and the fix). Each record is revisioned and links to the conversation, run or operation that produced it.
- **Every run reads it, in every mode:** a bounded "where we are" brief (open tasks, active decisions and constraints, recent lessons) is assembled before history, so trimming old turns never removes project state. A `recall` tool searches full history through the existing FTS index.
- **Plan to Build handoff:** Plan mode saves a structured plan; Build mode follows it and marks steps done, so switching modes does not repeat or rewrite finished work.
- **Lessons:** failed operations, failing checks and user corrections become lesson records surfaced before similar actions. This reduces repeated mistakes; it cannot guarantee a model never repeats one.
- **Trust:** memory steers future runs, so entries derived from untrusted content (GitHub files, web or research captures) stay proposed until the user accepts them; imported text never becomes an instruction. The user can view, edit and delete every record. Project cloud policy applies whenever memory is sent to a cloud model.
- **Order (confirmed by the user, October 2):** research phase, then project memory, then missions, because mission agents need this shared state for handoffs.

**Specification (October 3):** [project memory](../../specification/project-memory.md) turns this proposal into an implementation-ready design: the data model, the schema step, IPC methods, how runs read the brief, privacy and retention, acceptance tests, nine commit-sized tasks, rejected alternatives and seven open product questions with recommendations. Nothing is implemented yet.

## Decisions recorded October 2

These are user decisions; later phases implement them.

- **Phase order:** finish this research phase, then project memory, then missions.
- **Completion is counted, never estimated.** Every plan step lists acceptance items written in advance. An item counts only when its evidence exists: a test that ran and passed, CI green on that exact commit, a merged PR. Build completion % = verified items / all items, and each number links to what is missing.
- **Research readiness per plan step.** Each step lists its blocking unknowns. Research readiness % = unknowns closed with verified evidence / all blocking unknowns; an unreachable fact may be labelled a known unknown with a day-one check, never left silent. The plan shows both percentages.
- **Build only where research is sufficient** (integration review Stage 3, research-aware Build admission): Build mode is admitted per plan step only when that step's research is ready (the kit's own gate plus a fresh Moonzila validation). Steps with no blocking unknowns need no research, so research stays optional for ordinary work.
- **Build to Research and back.** When Build hits something it cannot resolve from the code, it pauses that step, records the open question as an unknown in project memory and proposes a targeted research job with topic and queries prefilled from the error. The approval card shows exactly what becomes public; code is never placed in queries automatically. After review, facts land in project memory with sources and Build resumes at the same step; a mistake becomes a lesson.
- **Quality checks.** Careful-coding discipline (read before changing, run the checks, re-read the diff, report mistakes plainly) is Build mode's default behaviour. Break-test (prove realistic build and test failures, then fix them minimally) is suggested at 25%, 50% and 75% build completion, when a change touches risky areas (migrations, process or credential code, installers) and after a repeated-failure lesson; it is required before a milestone is marked 100% or released. The user approves every break-test run, with its cost shown. In missions it becomes a preset (finder, verifier, fixer).
- **GitHub, approved as four steps:**
  1. One secure GitHub connection (a GitHub App or fine-grained token with least privilege per repository) in the encrypted vault, shared by research collection, private repository reading and the steps below; never entered in chat.
  2. GitHub as completion evidence: CI runs on an exact commit and PR state tick acceptance items.
  3. Checks and break-test runs on GitHub Actions runners, so heavy and Windows-only checks do not depend on the user's PC.
  4. Optional per-project two-way sync of project memory tasks with GitHub Issues or a Project board, and finished work opened as draft PRs. Every write to GitHub needs the user's approval; issues are visible to repository readers, so private notes stay local unless the user opts in.
- **Background tasks, approved as the first part of the missions phase** (the foundation mission agents run on):
  1. A Tasks panel lists everything running in the background (test suites, builds, dev servers, research jobs, later mission agents) with status, elapsed time, the latest output and Stop.
  2. Build mode can start an approved command in the background and keep working; running in the background never bypasses the existing exact command approval.
  3. A finished task posts a short summary into the conversation (passed or failed and the key lines); the agent reads the full saved output on demand instead of loading it into context.
  4. Output streams to bounded files on disk. On app exit owned processes stop, and after restart those tasks show as interrupted and are never re-run silently; research jobs keep their resume-by-run-id behaviour.
  5. A concurrency limit applies, and local-model work still shares the one inference scheduler under the same RAM/VRAM rules as the mission planner.

## Computer use, Operator mode (approved: sandbox only, after missions)

User request, October 2: Moonzila should be able to control the PC, as GPT's agent does, with [Cua](https://github.com/trycua/cua) as the reference. Facts from Cua's README (read October 2): Cua Driver inspects and operates native apps and browsers on Windows, macOS and Linux through a CLI, MCP or typed SDKs, in the background where the app and platform allow; Cua also provides isolated local or cloud sandboxes. The core and the Driver are MIT; Spaces and cua-spacesd are FSL-1.1-MIT; the optional perception extension and cua-som carry AGPL obligations.

Proposed design (safety first; the user still chooses the scope):

1. **Sandbox first:** the agent works in an isolated Windows environment (Windows Sandbox or a Cua sandbox), never the real desktop, by default.
2. **Real desktop only by explicit per-session opt-in,** with an always-visible control banner, an instant stop hotkey and an app allowlist.
3. **Step approval for sensitive actions:** password or payment fields, sending messages or email, deleting, installing and purchases always pause for the user.
4. **Screenshots are private content:** they reach a cloud model only where the project allows cloud inference; local vision models are chosen by the hardware-aware planner when the machine qualifies.
5. **Cua stays an external, user-installed, version-pinned component** reached over MCP, like Research-Kit. Moonzila never runs its piped install script and never bundles the AGPL or FSL parts.

Order: research, project memory, missions (beginning with background tasks), then computer use, which reuses their approvals, background sessions, Stop and ownership.

**Decision, October 2: sandbox only.** The first version operates only an isolated sandbox (Windows Sandbox or a Cua sandbox) and never the real desktop. Item 2 is deferred: real-desktop control is not built, offered or hidden behind a setting in this version. It is reconsidered only as a separate, later plan once sandbox mode has shipped, and only with the safeguards in item 2. Items 3, 4 and 5 apply inside the sandbox too, because a sandbox can still send email, pay or upload what it sees.

## App name (decided October 2: keep Moonzila)

The user asked for a more fitting name, picked Groundwork, then chose to keep Moonzila after a web check (October 2) found the candidates already in use by AI-agent or developer tools:

- Groundwork: at least six agent and dev-tool projects (gates, project memory, cited research), plus several AI businesses.
- Cairn: an agent-first IDE and a local-first AI notes app.
- Plumbline, Keelson, Sightline, Provena and Firmground: each already an AI tool.
- Surefoot was the only free candidate in the category (a ski-boot brand uses it).

Moonzila is distinctive and already findable. Groundwork may instead name the research phase inside the app; confirm that when the research UI is built. If a rename comes back, record it as its own task:

- Change only what users see: product name, installer, window titles, docs.
- Keep `app.setName` (the `%APPDATA%` data folder), the installer `appId` and the update feed, so existing installs keep their data and still get updates.
- Run a trademark check before shipping an installer under the new name.

## Patterns adopted from awesome-llm-apps (approved October 2)

The user asked what Moonzila can take from [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) (Apache-2.0). It is a catalogue of standalone Python demos, mostly Streamlit UIs on Google ADK, OpenAI Agents SDK, CrewAI or LangGraph. Take patterns, not code: the demos have no vault, approvals or engine/main split, and several take API keys in UI text fields. Each pattern below was read from the example's README. The user approved adopting the first three, including the suggested first background task, on October 2. Re-read the example's code when its phase starts.

- **Missions, `agent_skills/advisor-orchestrator-worker`:**
  - Workers get self-contained briefs, with inputs and acceptance criteria inline.
  - Each result gets a verdict: PASS, FIX (re-dispatched with the failure details) or ESCALATE.
  - An advisor reviews the plan before dispatch and the result before delivery. In Moonzila the pre-dispatch review is where the user's approval goes.
  - The budget is stated up front and never exceeded silently.
  - Pair it with the hardware-aware planner: cheap workers, stronger judgment only where it changes a decision.
- **Project memory, `agent_skills/self-improving-agent-skills`:**
  - Analyse each failure for its root cause.
  - Apply one surgical change per round.
  - Re-run test scenarios that include the failed case.
  - Keep the change only if the score improves, otherwise revert it, and keep a changelog.
  - This is the mechanism for "does not repeat mistakes" and the repeated-failure lesson trigger.
- **Background tasks, `always_on_agents/release_radar_agent`:**
  - Outbound delivery needs both `dry_run=false` and a configured destination.
  - It reports only impact (breaking, security, deprecation).
  - A good first background task: watch a project's dependencies. Moonzila must add what the demo lacks: state between runs, de-duplication and Stop.
- **No change, `advanced_ai_agents/multi_agent_apps/trust_gated_agent_team`:** its SHA-256 hash-chained audit log matches Research-Kit's ledger and the `research_events` journal, and fixed agent trust scores are weaker than evidence and approval gates.
- **Not yet read; check when the related work starts:**
  - `rag_tutorials/corrective_rag`, for the Build-to-Research loop;
  - `advanced_llm_apps/llm_optimization_tools/headroom_context_optimization`, for small local context windows;
  - the external Openwork browser agent (`accomplish-ai/coworker`), for sandbox computer use;
  - `advanced_ai_agents/multi_agent_apps/agent_teams/llm_panel_agent_team`, for judged panels.

## MCP tools from awesome-mcp-servers (proposed October 2, with missions)

The user asked what Moonzila can take from [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers). It is a community-submitted, unvetted directory: only a 🎖️ badge marks an official implementation, and the README makes no security claim. The entries below were read from its README on October 2; check each one's own repository before use.

- **MCP as the plug-in mechanism (proposed).** Moonzila becomes an MCP client, so new tools are installed rather than built. Computer use already plans to reach Cua over MCP.
  - Servers are user-added only, pinned by version and executable hash, like Research-Kit.
  - Each runs as an owned process with a minimal environment, and receives credentials only through vault grants.
  - Tool schemas are shown before the first use. Every call with an effect goes through approvals, and every call is journaled.
  - Tool results are untrusted content.
  - First candidates: GitHub's official MCP server, for the four GitHub integration steps; Cua's MCP server, for sandbox-only computer use.
- **Provenance gating (proposed for missions), listed as `cgrtml/reasongate`:** a tool call whose arguments were derived from untrusted content (a fetched page, another tool's output) needs approval. This defends against prompt injection once agents browse and run tools.
- **Decision tracking with testable predictions (proposed for project memory), listed as `mcp-server-decisions`:** each recorded decision carries a check that could prove it wrong, which feeds "does not repeat mistakes".
- **Not taken:** installing directory servers freely, and cloud code-execution sandboxes as a default. Moonzila stays local-first; Windows Sandbox comes first.

## Coding knowledge base and the October 3 repository review (adopted October 3)

Both questions were answered through Research-Kit corpora with a ledger and a passing gate, not by a quick read. On October 3 the user approved incorporating both as suggested. The phase order is now:

1. research;
2. project memory;
3. the coding knowledge base;
4. missions, beginning with background tasks, and carrying the reviewer loop and the bait-tool tests;
5. sandbox-only computer use.

- **Coding knowledge base (adopted; its own phase after project memory)**, from `docs/research/2026-10-03-coding-knowledge-base/research/BRIEF.md`:
  - A local, version-matched documentation store in DevDocs' format.
  - Each set is downloaded on the user's approval, with its license and attribution kept beside it: Python (PSF), Node.js (MIT), MDN (CC-BY-SA prose, CC0 samples), OpenJDK (GPLv2 with the Classpath Exception). Oracle Javadoc is excluded.
  - The version comes from the project's own files: `engines.node`, `requires-python`, `maven.compiler.release`.
  - Agents read the store as untrusted text, and it is never build-gate evidence.
  - llms.txt is an optional refresh source. Context7 is only an approved MCP plug-in.
  - Defaults: nothing ships in the installer. Java docs are offered only for Java projects, because the OpenJDK set is about 103 MB. If a project declares no version, the user is asked rather than a version guessed.
  - First build step: a `docs.json` reader that maps a project's declared Node, Python and Java versions to DevDocs releases, tested over the captured index.
  - Day-one check: read the OpenJDK package's `debian/copyright` before offering Java docs.
  - Implementation plan: [coding knowledge base](2026-10-03-coding-knowledge-base.md), written October 3. It refines the matching rule to match by version line, lists the known unknowns with their day-one checks and lists the decisions for the user.
- **Repository review (adopted)**, from `docs/research/2026-10-03-agent-repo-review/research/BRIEF.md`. Patterns only, no code:
  - **Missions: a reviewer loop** (from gpt-pilot, which is FSL-1.1-MIT and unmaintained). Each mission step goes to a reviewer agent, which accepts it or sends it back with the reason, before the user approves. It reuses the adopted PASS/FIX/ESCALATE verdicts. First step: write it into the mission plan contract (step, then review verdict, then user approval).
  - **Prompt-injection tests: bait MCP tools** (from beelzebub, GPL-3.0). The test harness registers decoy tools no legitimate task needs. A call to one after reading untrusted content fails the test. It detects some attempts, not all, and complements provenance gating.
  - **Supply chain: a standing rule** (from gpt-pilot's ten-month hidden loader). No telemetry in the engine. Every external tool is pinned by hash and reviewed, as Research-Kit is. An unmaintained dependency is a risk to remove.

  tffm is unrelated. The GitHub research-and-development topic page refused the fetch, so it remains a known unknown.
