# Run: task5-research-review

| Field           | Value |
|-----------------|-------|
| Status          | ACTIVE |
| Started         | 2026-10-03 (research cycle); ledger adopted 2026-10-04 12:50 UTC, mid-run |
| Last checkpoint | 2026-10-04 - Phase 4 spec revised after the second cross-vendor review; user: start the build |
| Engagement      | Full |
| Working branch  | `main-axuse`, from `main` @ `6d51dbb` (Phase 2 merge) |
| Skill           | lead-orchestrator 2.0 (`.claude/skills/lead-orchestrator/references/changelog.md`) |

## Auto-build stages (Phase 5)
| Stage | Status | Artifact | Checkpoint |
|-------|--------|----------|------------|
| 0 Orient | DONE | RUN.md; baseline 74 (Linux); kit 0.9.5, doctor 1 blocker = P4-40 (fixed by this phase) | 2026-10-04 18:00 |
| 1 Research | SKIPPED (the Windows delete behaviour is in the 2026-10-03-windows-file-semantics corpus; certificate generation uses installed pkijs 3.4.1) | - | 18:00 |
| 2 Requirements | DONE | REQUIREMENTS-P5.md | 18:00 |
| 3 Design | DONE | docs/specification/research-purge.md | 18:00 |
| 4 Mandate | DONE (standing mandate) | MANDATE-P5.md | 18:00 |
| 5 Build | ACTIVE | - | - |
| 6 Harden | PENDING | - | - |
| 7 Audit | PENDING | - | - |
| 8 Deliver and merge | PENDING | - | - |
| 9 Validate and report | PENDING | - | - |

## Next action
Phase 5: freeze the contracts from `docs/specification/research-purge.md` (main-owned `research.purge`, `research.retained` control, `PURGE_NOT_ALLOWED`), write the B7 builder, P4-40 and reviewer briefs, launch, then the four-role review, gap-audit and break-test over Task 5.

## Task statement
- Goal: plan Task 5, the research review (`docs/specification/research-review.md`). A collected corpus is reviewed by a model run with user-approved edits, packaged by the kit's own `create`, and is research-ready only when the validator confirms the new package's exact bytes.
- Success criteria: the spec's four end-to-end scenarios pass; every phase merged through a draft PR with green Windows CI; every review finding dispositioned.
- Out of scope: missions, project memory, Operate mode (later plan phases).
- Research briefs relied on:
  - `docs/research/2026-10-03-sqlite-table-rebuild` (schema v4 migration order);
  - `docs/research/2026-10-03-windows-file-semantics` (guards, replace-by-rename, Q9);
  - `docs/research/2026-10-03-electron-fuses` (fuse set);
  - `docs/research/2026-10-04-playwright-fused-electron` (decision 13, the test-only package).

## Baseline
- Gate: `npm run typecheck`, `npm run lint`, `npx vitest run --reporter=json`, `npm run build`; script `/home/user/task5-handoff/gate.sh <checkout> <label>` (machine-local).
- Known failures (Linux): exactly 74, all needing the Windows native helper; list in `/home/user/task5-handoff/baseline-failing.json` and `AGENTS.md` "Orchestrator facts".
- Windows CI: 0 failures.
- Pass criterion: no failure outside the 74; a green Windows run on the exact head; for packaging changes, a green `workflow_dispatch` run.

## Research
| Topic | Folder | Gate (exit) | Brief | Status |
|-------|--------|-------------|-------|--------|
| SQLite table rebuild | `docs/research/2026-10-03-sqlite-table-rebuild` | 0 | yes | COMMITTED |
| Windows file semantics | `docs/research/2026-10-03-windows-file-semantics` | 0 | yes | COMMITTED |
| Electron fuses | `docs/research/2026-10-03-electron-fuses` | 0 | yes | COMMITTED |
| Playwright and fused Electron | `docs/research/2026-10-04-playwright-fused-electron` | 0 | yes | COMMITTED |

All four re-gated with Research-Kit `d00be07` on 2026-10-04: preflight 0, handoff 0.

## Contracts
- `fb34691`: `src/engine/review-contract.ts`, control and shared schema additions (Phase 0).
- `255d6e3`: D1, public code `REVIEW_NOT_READY`.
- `d68eb57`: `research.review.context` carries the journaled verification.
- `364bc55`: each review change carries `status` (`completed` / `unknown`).
- `7bc04e6`: `research.document.read` and the `DOCUMENT_*` codes (Phase 4).

## Phases (one draft PR each; the lead decides the merge under the merge checks in AGENTS.md, user 2026-10-04)
| Phase | Content | PR | Status |
|-------|---------|----|--------|
| 0 | research, decisions, frozen contracts, admission fix | #32 | MERGED |
| 1 | schema v4 (B0), Windows guard tests (B6), Moonzila spelling | #33 | MERGED |
| 2 | Electron fuses (B5), test-only package for packaged e2e (D2) | #34 | MERGED |
| 3 | engine review run (B2), main supervisor (B3), e2e scenarios (B10), fix round | #35 | MERGED (710e083) |
| 4 | review UI (B4, B4b), reader (B11), research switch (B8, B8e), e2e journey (B12) | [#36](https://github.com/StepenkoAnatoli/Moonzila/pull/36) | MERGED (`cb343a2`) by the lead under the merge checks |
| 5 | `research.purge` (B7), docs, four-role review, gap-audit, break-test | - | PLANNED (offer the GPT reviewer for gap-audit) |

## Units (Phase 3)
| Unit | Owns | Status | Commit on main-axuse | Model |
|------|------|--------|----------------------|-------|
| B2 engine review run | `src/engine/**` review parts, `src/tools/files.ts`, `reads.ts` | INTEGRATED, REVIEWED | `df64924` | Opus |
| B3 main supervisor | `src/main/review*.ts`, `adapter.ts` prepareReview, `src/main/engine.ts`, `index.ts` | INTEGRATED, REVIEWED | `4eeab35`, `c24ff40` | Opus |
| B10 e2e scenarios | `tests/research-review-e2e.test.ts` | INTEGRATED, REVIEWED | `b156c88` | Opus |
| FE engine fixes | engine files | INTEGRATED, RE-REVIEWED | `8bef5cf`, `74fda0f`, `6335563`, `527bb55` | Opus |
| FM main fixes | main files | INTEGRATED, RE-REVIEWED | ten commits after `527bb55`, then `301177a` | Opus |

## Units (Phase 4)
Briefs: `briefs/p4-*` (builders, unit reviewers, integration reviewers, docs), each with its pre-mortem. Waves: B11, B4, B4b, B8e in wave 1 (disjoint files, frozen contract `7bc04e6`); B8 in wave 2 after B4 (same files).
| Unit | Owns | Status | Commit on main-axuse | Model |
|------|------|--------|----------------------|-------|
| B11 reader | `src/main/` reader, `index.ts` case, tests | REVIEWED, P4-14, P4-16, P4-18 FIXED (reports `p4-b11-builder-1.md`, `-2.md`, `p4-b11-reviewer-1.md`) | `1465f12` (branch `2c2cc7d`) | Opus |
| B4 panel | `ResearchPanel.tsx`, `research-text.ts`, `App.tsx`, tests | REVIEWED, P4-6..P4-8 FIXED (reports `p4-b4-builder-1.md`, `p4-b4-reviewer-1.md`, `p4-b8-builder-1.md`) | `6019045` (branch `a8a5b42`); lead `runMode` wiring `792e68e` | Opus |
| B4b card label | `ChangesPanel.tsx`, tests | REVIEWED, P4-1 FIXED (reports `p4-b4b-builder-1.md`, `-2.md`, `p4-b4b-reviewer-1.md`; App.tsx `runMode` wiring with B4) | `f8972f7`, fix `58bafd9` | Opus |
| B8e policy guard | main route module, `index.ts`, engine re-check, tests | REVIEWED, P4-10 FIXED (reports `p4-b8e-builder-1.md`, `-2.md`, `p4-b8e-reviewer-1.md`) | `805b97d`, `5e5e35e` (branch `581c19a`, `d85fbdd`) | Opus |
| B8 switch | `ResearchPanel.tsx` switch section | INTEGRATED (report `p4-b8-builder-1.md`); e2e journey owed (P4-20) | branch `2d94a1c`; lead `onProjectChange` wiring `06448f1` | Opus |

## Units (Phase 5)
Contracts `7e1f4d9`. Briefs: `briefs/p5-common.md`, `p5-b7a-builder.md`, `p5-b7b-builder.md`, `p5-tls-builder.md`. All three in wave 1 (disjoint files).
| Unit | Owns | Status | Commit on main-axuse | Model |
|------|------|--------|----------------------|-------|
| B7a purge | engine `research.retained`, adapter `purgeRetained`, `src/main/research-purge.ts`, index case | BUILDING | - | Opus |
| B7b panel | Delete stored corpus in `ResearchPanel.tsx` | INTEGRATED (report `p5-b7b-builder-1.md`; lead: `collected` added to the statuses -> red) | branch `36f082f` | Opus |
| P4-40 TLS | test-time CA and leaf, pkijs devDependency | INTEGRATED (report `p5-tls-builder-1.md`; lead: SAN removed -> red); doctor READY | branch `460b66c`, `5031951`, `dced452` | Opus |

## Reviews (Phase 3)
| Scope | Role | Model | Status |
|-------|------|-------|--------|
| integration `6d51dbb..b156c88` | spec, breaker, mutation, invariant | Opus | TRIAGED |
| integration `6d51dbb..b156c88` | cross-vendor reviewer | GPT (run by the user) | TRIAGED |
| fix round `..0319112` | re-review of all S1 reproductions | Opus | TRIAGED: all CLOSED, no regressions |

## Findings
Phase 3 dispositions are in `docs/specification/research-review.md` "Phase 3 as built" and the plan's Phase 3 entry. Earlier phases: the plan's Phase 1 and Phase 2 entries. All S1 findings: FIXED and RE-REVIEWED.

## Decisions and assumptions
- 2026-10-03: research is turned on through a confirm dialog offering only public-technical; `research.purge` deletes retained ZIPs only; inference-only policy edits do not end research jobs.
- 2026-10-04: D1, one public code `REVIEW_NOT_READY`. D2, packaged e2e on a test-only package (decision 13). The product name is Moonzila (decision 12). PRs open as drafts; the user's "Ready for review" lets the lead merge on green CI.
- 2026-10-04: user: "merge as you decide, just be careful". The lead merges a phase PR itself once every check in AGENTS.md's merge rule holds on the exact head (S1/S2 fixed and re-reviewed, Linux gate against baseline, Windows CI green, mergeable, no open thread). Supersedes "the user marks Ready for review".
- 2026-10-04: merge-protocol mapping (auto-build `references/merge-protocol.md` section 9): no `gh` here; the GitHub MCP tools stand in. `pr-readiness.sh` conditions are read with `pull_request_read get` (state open, `draft` false, base `main`, `mergeable_state` clean), `get_check_runs` (every check `success` on the head SHA, none pending), `get_review_comments` (no unresolved thread) and the reviews (no CHANGES_REQUESTED); the merge is `merge_pull_request` with `merge_method: merge` and `expectedHeadSha` = the gated SHA. Same conditions, recorded as lines in this ledger before each merge.
- 2026-10-04: user request, more models (local catalogue, native profile kinds, smarter selection), research first: its own task after Task 5, recorded in the plan.
- 2026-10-04: user request, self-unblocking with research (blocked run: self-fix, else research, then a PR, never merged), out of this run's scope: its own task after Task 5, recorded in the plan.
- 2026-10-04: a cross-vendor (GPT) reviewer joins Phase 3's review and is offered for Phase 5's gap-audit.

## Findings (Phase 4)
| ID | Source | Severity | Finding | Disposition |
|----|--------|----------|---------|-------------|
| P4-1 | B4b unit review | S2 (proposed S3; raised: it is the mislabel spec section 2 forbids) | `ChangesPanel.tsx:59` labels a stale card from the current `runMode`; when a research run ends the card briefly reads "Review edit" with Approve enabled | FIXED (`4cfdb3b` on the branch): the card binds its mode at load; red first, lead re-ran 18/18 and the guard removal (new test red) |
| P4-2 | B8e builder | S3 | each policy update reads every session of the project with `session.read` (messages included) to find active runs | RECORDED: correct; a lighter engine read is a later optimisation |
| P4-3 | B8e builder | S3 | a replayed `project.policy.update` can now be answered `RUN_ACTIVE` instead of its stored result when a Build run started since | RECORDED for the unit and integration reviewers to judge; no side effect either way |
| P4-4 | B4 builder | S3 | spec decisions taken by the builder: `approved` history label "Approved review, not checked here"; reader shown while reviewing/packaging; review wording for shared codes | ACCEPTED; to be written into the spec's "Phase 4 as built" |
| P4-13 | B8e builder | process | the permission system refused `git reset --hard c5fcd54` on the builder's own branch ("irreversible local destruction") | NOT worked around; the lead did not reset it either: a new branch `build/p4-b8e-fix` and worktree `wt/p4-b8e-fix` from `c5fcd54` were created instead, leaving the old branch intact |
| P4-14 | B11 builder | S2 (the B11 pre-mortem's risk) | `verifyRetained` reports a validator timeout or storage limit as `STALE_VERIFICATION`, so the reader shows "Unverified" (or `DOCUMENT_UNVERIFIED`) when nothing is known | FIXED (branch `a8d18a1`): internal `VALIDATOR_UNAVAILABLE` for TIMEOUT and STORAGE_LIMIT, mapped to `RESEARCH_KIT_UNAVAILABLE` by the reader and review.ts; lead: removing the TIMEOUT mapping turns the reader test red |
| P4-15 | B11 builder | process | the reader was implemented before its tests (not red-first) | ACCEPTED with the 15 guard removals as the red proof; the unit reviewer re-checks some |
| P4-16 | B11 unit review | S3 | a FIFO swapped in for the document hangs the read (no `O_NONBLOCK`), holding a libuv thread | FIXED (branch `1b6abd1`), red first (hung to the test timeout without the flag) |
| P4-17 | B11 unit review | S3 | any non-ENOENT I/O error (EACCES, EBUSY, EMFILE, EPERM; antivirus on Windows) reads as `DOCUMENT_UNSAFE`, "Start the review again" | RECORDED for Phase 5: conservative (no text shown); a retryable outcome needs a spec row |
| P4-18 | B11 unit review | S3 | the post-read `contained()` check is untested | FIXED (branch `de6a2d8`): a test that reaches it; the check is not redundant (a folder swapped for a link to itself keeps the inode) |
| P4-19 | B11 unit review | S3, pre-existing | no method enforces its declared `authorization` (`project-member` is declarative); a researchId from another project is readable, as with `research.read` | RECORDED for Phase 5's gap-audit |
| P4-20 | B8 builder | S2 (owed) | the spec's e2e journey (turn research on, read a collected job's brief) is not written: a collected job needs the Windows native helper | INTEGRATED (B12: branch `00a04a7`, `fe6d16d`, `801eecd`; reports `p4-b12-builder-1.md`, `-2.md`); network tests 52/52 on main-axuse, dropping GET-only turns one red; the journey itself verified only by Windows CI (a merge check) |
| P4-21 | B8 builder | S3 | the preload passes only the error message, so the panel recognises `RUN_ACTIVE` by its public text (a test pins it to `bridge.ts`) | RECORDED: the test makes drift loud; carrying the code through the preload is a contract change for later |
| P4-22 | lead | process | the B12 brief said the existing journey reaches a collected package; it stops at the import park (`research-journeys.md` lists `collected` as Task 7 work) | the builder stopped instead of editing unowned files; scope widened to the test fixtures and the journeys doc |
| P4-23 | integration spec review | S2 (proposed S3; raised: it disables reviews on machines with a linked ancestor; pre-existing in Phase 3's `containedFolder`) | main walks from the filesystem root, the spec and engine from the data folder: a linked ancestor of userData makes every workspace read `DOCUMENT_UNSAFE` and every review start `PATH_OUTSIDE_PROJECT` | MOVED OUT OF PHASE 4 (lead decision): the cause is app-wide, `privateDirectory` (`src/models/artifact-files.ts:16`, used by the model store, downloads, runtime and the kit store) also walks from the root, pre-existing since before Task 5; recorded as its own task in the plan, red tests kept in `reports/p4-23-red-tests.patch`; the user is told it is not fixed |
| P4-24 | integration spec review | S3 | an approved package that verifies shows "Cannot check" when the brief itself is refused (too large, absent) | RECORDED for Phase 5: a brief over 4 MiB is unrealistic and the kit's preflight requires BRIEF.md |
| P4-25 | integration spec review | S3 | ARCHITECTURE says only `INSTALLATION_INVALID` maps to `RESEARCH_KIT_UNAVAILABLE`; the reader maps every non-stale error (CANCELLED cannot occur: the reader passes no signal) | DOCS: the docs unit corrects the row |
| P4-26 | integration spec review | docs | spec text now false: button rule, "changes only research", `policy.guard`, section 3 edge cases, untrusted text | DOCS: "Phase 4 as built" in research-review-ui.md |
| P4-27 | integration invariant audit | design note | any future path that creates a non-research run outside `run.start` (missions) must take the project lock, or main aborts and holds before the engine refuses | RECORDED in the missions section of the plan when missions are designed; noted in the spec's "Phase 4 as built" |
| P4-28 | docs unit | process | `docs/ARCHITECTURE.md` line 29 still says "The user reviews and merges it. Do not merge on the user's behalf.", conflicting with AGENTS.md and the user's 2026-10-04 merge decision; the docs agent's edit was refused by the permission system ("Instruction Poisoning") | RESOLVED: the user chose "You change it" (AskUserQuestion, 2026-10-04); the lead replaced the line with the AGENTS.md merge rule |
| P4-29 | integration breaker (BRK-1) | S2 (breaks Phase 4 invariant 3) | a switch update the engine refuses (stale `expectedRevision`, or a replay) still aborts, revokes and holds first | FIXED (branch `cd7d17c`): replay, then revision, then RUN_ACTIVE, before any stop; contract and implementation in one green commit; lead re-ran 44/44, removing the revision check turns 2 red |
| P4-30 | integration breaker (BRK-2) | S3 | each reader call leaves a kit receipt in memory until `close()` | RECORDED for Phase 5 (bounded by clicks; a receipt is small) |
| P4-31 | integration breaker (BRK-3) | S3 | `research/` linked back between lstat and open reads its own file; the docstring overclaims | RECORDED for Phase 5: docstring wording; no leak |
| P4-32 | integration breaker (BRK-4) | S3, test-only | the B12 route reads the CA inside a `'connect'` handler; a missing CA hangs the fetch | RECORDED for Phase 5 |
| P4-33 | integration breaker | to verify | `research.review.start` takes no project lock; racing an update could install a capability for a run the engine cancelled (expected, not run) | Phase 5 break-test reproduces it first |
| P4-34 | Windows CI (runs 37214679623, 37214682330) | S2 (red CI) | `tests/research-document.test.ts` left every Store open; Windows could not unlink `state.sqlite` in the root cleanup (EBUSY), failing the suite with all 1,037 tests passing | FIXED by the lead: stores tracked and closed before rm (the research-review-engine pattern); verified only by the next Windows run |
| P4-35 | full Linux gate on `de1425c` | S1 (flaky test) | `research-panel.test.tsx` "Checking until the reader answers" asserted the read right after the initial "Checking" text, before React's effect sends it; failed once under full-suite load | FIXED (`a83c6d0`): waits for the read, then asserts exactly one; 30/30 alone; the file's other call assertions follow reply-produced states and cannot race |
| P4-36 | Windows CI (run 37216031752) | S2 (red CI) | the e2e journey expected status "Collected"; the panel shows "Collected · GitHub run 1" (the journey reached `collected` through the real import) | FIXED by the lead: regex on the panel's format; the reader steps after it run first on the next Windows run |
| P4-37 | integration mutation audit | S1 (three new tests survive their named guard alone) | the junction test (walk skipped; containedFolder catches it), "nothing to read", Checking->Ready (no `verified: false` case) | FIX BRIEFED (unit T1, tests only): each test's own input must reach its named guard |
| P4-38 | integration mutation audit | S2 (untested guards that protect shown content or other projects) | DocumentReader stale-reply guards (out-of-order brief/evidence; reply after a revision change), `jobKey` revision, route abort filter (other project's run), reviewed-unverified explanation, `approved` in READABLE, switch revision-wins, dangling link at the job folder | FIXED (T1 `46c356b`): a test per guard, each red alone with its guard mutated; lead: removing the revision from `jobKey` turns 2 red. The reader's `latest.current === sent` check is an equivalent mutant (kept as defence in depth, documented in the test) |
| P4-39 | integration mutation audit | S3 | survivors needing inputs the platform or the validator prevent: STORAGE_LIMIT mapping (only TIMEOUT tested), EACCES on an ancestor (tests run as root here), entry hash (a validated package cannot differ), layered pairs (each covered by its pair) | RECORDED for Phase 5's break-test; T1 adds STORAGE_LIMIT if the adapter's OwnedRunner injection can produce it |
| P4-40 | kit 0.9.5 doctor | process | `doctor` in MoonAliza reports 1 blocker: secret scan `private-key-block` on `tests/fixtures/github-tls/leaf.key`, a documented loopback test fixture (README: protects nothing outside the fake; CA key discarded); kit 0.9.5 has no exemption and is feature-frozen | FIXED in Phase 5 (P4-40 unit): no key committed; kit doctor READY on 0.9.5 (secret-scan pass); Windows CI pending |
| P4-41 | re-review | S2 (proposed S3; raised: the P4-14 defect class) | `verifyRetained` classifies by error code, not by whether the bytes still hash to the digest: an intact package with a crashing or truncating validator reads "Unverified"; a tampered file that times the validator out reads as a machine fault | FIXED (branch `654cf98`): `retainedFailure` classifies by the single capture's hash; lead re-ran 32/32, removing the hash check turns the main-kit test red. `readRetained`'s machine-fault branches untested (recorded) |
| P4-42 | re-review | S4 | a missing project takes and releases both holds before PROJECT_NOT_FOUND; `research-open-review-guards.test.tsx:78` asserts a non-call right after a click | RECORDED; no runs are affected |
| P4-43 | final re-review | S4 | a tamper race between the capture and the store's intact check can read as VALIDATOR_UNAVAILABLE (STORAGE_LIMIT) or INSTALLATION_INVALID; the validator's bytes were intact, nothing untrusted accepted | RECORDED for Phase 5's break-test |
| P4-5 | B4 builder | process | the permission system refused the builder's `git cherry-pick f8972f7` ("Logging/Audit Tampering") | NOT worked around by the builder; the lead wired `runMode` itself at integration, as planned before the refusal; reported to the user |
| P4-6 | B4 unit review | S2 (proposed S3; raised: it bypasses the conversation list's own guard) | `App.tsx:180` `openConversation`: no alive/project check on the `session.list` reply (a project switch can be overwritten by the old list), and no `busy`/`scopeLoading`/`activeRun` guard, so Open review can switch conversation during an active run | FIXED (branch `05689af`): list applied only for the same project; Open review disabled with the reason while busy, loading or a run is active; red-first; lead re-ran 82/82 |
| P4-7 | B4 unit review | S3 | no test for Start review hidden when untrusted or research off (`ResearchPanel.tsx:122`) | FIXED (branch `b467f7b`): tests added, each red with its condition removed |
| P4-8 | B4 unit review | S3 | the digest part of `jobKey` (`ResearchPanel.tsx:31`) is untested (the stale test also bumps the revision) | FIXED (branch `521fa95`): `ApprovedCheck` driven with only the digest changed |
| P4-9 | B4 unit review | Rejected | Start review offered after a trust change | the engine refuses `TRUST_CHANGED`; the renderer cannot see `trustRevision` |
| P4-10 | B8e unit review | S2 (proposed S3; raised: a regression of `run.start`) | the route learns a session's project and a project's active runs through the renderer's `session.read`, capped at 10000 runs: over the cap `run.start` and the research switch fail with INTERNAL_ERROR; one read per session, messages included, under the lock | FIX: lead adds internal engine controls `policy.guard {projectId}` and `session.project {sessionId}` (contract); the B8e builder implements them and moves the route onto them, red-first with the 10001-run case. FIXED (branch `8731f8e`, `254b049`; `Store.policyGuard` accepted); lead re-ran 38/38, dropping the mode filter turns its test red |
| P4-11 | B8e unit review | S3 | main refuses `RUN_ACTIVE` before the engine's `REQUEST_CONFLICT` for a stale `expectedRevision` during a Build run | RECORDED: code differs only; nothing is stopped; the spec's "as built" says so |
| P4-12 | B8e unit review | S3, pre-existing | a replayed `run.start` re-admits a capability for a run that already finished, never removed | RECORDED for Phase 5's gap-audit (present before Phase 4) |
| P5-1 | P4-40 builder | process | `npm install --package-lock-only` also rewrote npm's hidden lockfile `node_modules/.package-lock.json` in the shared checkout; the builder stopped as briefed | ACCEPTED: npm's own regenerated cache; `npm ls` consistent (0 missing, invalid or extraneous). asn1js added to D-1 by hand edit, no further npm writes |
| P5-2 | B7b unit review | S3 (x4, batched) | purge refusal overwritten by an automatic error; the Unverified disclosure overstates (history rows, failed/cancelled, shared digest); plural wording; formatting | FIX ROUND sent to the B7b builder (one commit) |
| P5-3 | lead | process | the B7b reviewer's launch message named a placeholder commit ("85b..."); the reviewer found the real one (`b010a3b`) | launch messages name commits from `git log`, never from memory |

## Kit findings


- none

## Log
- 2026-10-03: research (3 corpora), decisions, contracts; wave 1 built B0, B5, B6.
- 2026-10-04: #32, #33, #34 merged; Phase 3 built, reviewed, fixed, re-reviewed; #35 opened.
- 2026-10-04 12:55 UTC: lead-orchestrator 2.0 adopted mid-run; this ledger written from verified disk state (every commit above exists on `main-axuse`).
- 2026-10-04: #35 merged; main merged into main-axuse (d8811ef). Phase 4 brainstorming: panel + conversation, brief/evidence reader, switch in the panel; design approved; spec written.
- 2026-10-04: cross-vendor review of the Phase 4 spec: 6 findings (2 S1, 4 S2), all folded in; user decision: the research switch is blocked while other work runs (engine guard B8e).
- 2026-10-04: second cross-vendor review of the Phase 4 spec: 4 findings (2 S1, 1 S2, 1 S3), all folded in: the research-switch check moves into main's route under a per-project lock, before any abort or revoke; redaction runs on the whole document before the cut; reader outcomes get their own codes and messages. The user said to start the build after the revision.
- 2026-10-04: lead-orchestrator re-applied mid-phase. Corrected two gaps: builders now commit to their own branches (the first rules said leave uncommitted; all four told before their first commit), and every Phase 4 brief is written to `briefs/` before launch.
- 2026-10-04: B4b accepted (key test re-run 6/6; weakening the mode check turns 4 red) and integrated as f8972f7; unit reviewer launched. Its one-line App.tsx wiring went to the B4 builder, who owns App.tsx.
- 2026-10-04: B4b unit review: activeRun confirmed as the right source; one finding P4-1 (S2), fix sent to the B4b builder.
- 2026-10-04: P4-1 fixed and integrated; the lead re-ran the tests and the guard removal.
- 2026-10-04: B4 and B8e accepted and integrated (lead re-ran their tests: 81/81 and 42/42; guard removals: Ready on any reply -> 2 red; main's check removed -> 2 red). Lead wired `runMode` in App.tsx (792e68e) after the B4 builder's cherry-pick was refused. B4 and B8e unit reviewers launched; B4 builder continued with B8.
- 2026-10-04: B4 unit review: decisions confirmed; P4-6 (S2), P4-7, P4-8 queued to the B4 builder after B8; P4-9 rejected.
- 2026-10-04: B8e unit review: lock coverage, read side effects and failure paths held; P4-10 (S2) fixed through a lead contract (two internal engine controls); P4-11, P4-12 recorded.
- 2026-10-04: P4-10 fix moved to a new branch `build/p4-b8e-fix` (from `c5fcd54`) after the reset of the old builder branch was refused (P4-13).
- 2026-10-04: B11 accepted and integrated (lead re-ran 20/20; cutting before redaction turns the straddle and expansion tests red). P4-14 (S2) and P4-15 recorded; B11 unit reviewer launched; P4-14 fix to the B11 builder on a new branch.
- 2026-10-04: B8 and P4-6..P4-8 integrated (82/82; forcing inference in the switch turns its test red). Lead wired `onProjectChange` (`06448f1`, red-first). B11 unit review: no S1/S2; P4-16, P4-18 to the B11 builder; P4-17, P4-19, P4-21 recorded; P4-20 e2e journey owed.
- 2026-10-04: P4-10 fix integrated (38/38 on main-axuse; mode filter removed -> red). `Store.policyGuard` accepted outside the file list.
- 2026-10-04: process changes adopted (user asked how to go faster without losing quality): prepare the next task during review and CI; a pre-launch checklist for every builder (worktree from the latest main-axuse, kit build linked, final rules, no resets); batch S3 fixes per unit; start the integration review on stable units early.
- 2026-10-04: B12 report 1: the switch half of the journey written; the brief's "reaches collected" fact was wrong (P4-22); fixture route approved.
- 2026-10-04: integration spec review: no Phase 4 S1/S2; P4-23 (S2, pre-existing) to the B11 builder; P4-24 recorded; P4-25, P4-26 to docs.
- 2026-10-04: integration invariant audit: every Phase 4 invariant HOLDS at `ab97386`; P4-27 recorded for missions.
- 2026-10-04: B12 integrated (52/52; GET-only guard removal red). The e2e journey's first real run is Windows CI.
- 2026-10-04: draft PR #36 opened early so Windows CI runs the e2e journey. PR events cannot wake this session (the Claude GitHub App is not installed on the repository), so the lead checks CI directly at each integration point.
- 2026-10-04: P4-14, P4-16, P4-18 integrated (reader 23/23; TIMEOUT mapping removed -> red). P4-23 moved out of Phase 4 to its own task (the cause is the app-wide `privateDirectory` guard). A spawn_task call for it timed out; the plan section is the durable record.
- 2026-10-04: docs integrated ("Phase 4 as built", ARCHITECTURE corrections, plan entry, three AGENTS invariant rows). P4-28 raised with the user; the merge waits on it.
- 2026-10-04: full Linux gate on `5e084ff`: typecheck, lint, build clean; 950 passed, 74 failed, exactly the baseline (0 new, 0 baseline passing). P4-28 resolved by the user's answer.
- 2026-10-04: integration breaker: P4-29 (S2) to the B8e builder; P4-30..P4-33 recorded for Phase 5. The merge waits on P4-29 and the mutation audit.
- 2026-10-04: Windows CI red on `9f69e1c` and `5e084ff`: the reader test's cleanup (P4-34), fixed. BRK-1 fix integrated (44/44; revision check removed -> red).
- 2026-10-04: full gate on `de1425c`: one failure outside the baseline, a flaky renderer test (P4-35), fixed. Re-gating.
- 2026-10-04: Windows CI on `de1425c`: unit stage green (P4-34 fix works); the new journey reached `collected` and failed on the status text (P4-36), fixed.
- 2026-10-04: full Linux gate twice on `1fa8561` (after the P4-35 fix): both typecheck, lint, build clean; 956 passed, 74 failed, exactly the baseline, 0 new. (`9c90fd2`/`bad5909` change only the e2e spec and RUN.md, which the Linux gate does not run.)
- 2026-10-04 17:09: Windows CI green on `bad5909` (push run 37217502754 and PR run 37217507014): the e2e journey passes end to end, reader included. Remaining before merge: the mutation audit, and an independent re-review of the S2 fixes (P4-10, P4-14, P4-29) and the CI fixes (P4-34..P4-36) on the final head.
- 2026-10-04: Research-Kit fast-forwarded to `d9e5f9c` (0.9.5), install and hooks re-run, firecrawl-cli 1.25.3 installed; all 15 MoonAliza corpora preflight 0 and handoff 0; doctor: 1 blocker (P4-40). Mutation audit: P4-37 (S1), P4-38 (S2), P4-39 recorded; tests-only unit T1 briefed. The merge waits on T1 and the re-review.
- 2026-10-04: re-review of the fixes at `49da553`: P4-10, P4-29 and the test fixes HOLD; P4-41 (S2) to the B11 builder; P4-42 recorded. T1 launched for P4-37/P4-38.
- 2026-10-04: P4-41 integrated (32/32; hash check removed -> red).
- 2026-10-04: T1 integrated (touched files 107/107; `jobKey` revision removed -> 2 red). All Phase 4 findings now fixed or dispositioned. Final full gate (twice) and Windows CI on the final head next.
- 2026-10-04: final re-review of P4-37/38/41: HOLD; P4-43 (S4) recorded. Every merge check held on `6a1fe4c` (Windows push and PR runs green, two full Linux gates equal to the baseline, mergeable, no threads, every S1/S2 fixed and re-reviewed). PR #36 merged by the lead as `cb343a2`. main-axuse rebased its two unpushed docs commits onto main. Check-in cancelled, PR unsubscribed.
- 2026-10-04: auto-build Phase 5 started: stages 0-4 done (research SKIPPED with reason; standing mandate); contracts `7e1f4d9`; B7a, B7b, P4-40 launched.
- 2026-10-04: P4-40 paused on npm's hidden-lockfile rewrite (P5-1), accepted; D-1 now covers asn1js 3.0.10.
- 2026-10-04: B7b and P4-40 integrated (88/88 and 56/56; one guard removal each red). Kit doctor READY. Waiting for B7a.
- 2026-10-04: B7b unit review: no S1/S2; P5-2 (four S3) batched to the builder; P5-3 recorded.
