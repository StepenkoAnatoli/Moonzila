# Run: task5-research-review

| Field           | Value |
|-----------------|-------|
| Status          | ACTIVE |
| Started         | 2026-10-03 (research cycle); ledger adopted 2026-10-04 12:50 UTC, mid-run |
| Last checkpoint | 2026-10-04 - Phase 4 spec revised after the second cross-vendor review; user: start the build |
| Engagement      | Full |
| Working branch  | `main-axuse`, from `main` @ `6d51dbb` (Phase 2 merge) |
| Skill           | lead-orchestrator 2.0 (`.claude/skills/lead-orchestrator/references/changelog.md`) |

## Next action
Wait for the B11, B4, B4b and B8e builder reports (worktrees `/home/user/task5-handoff/wt/p4-*`, branches `build/p4-*`). On each: save it verbatim to `reports/p4-<unit>-builder-1.md`, check it against the acceptance rules, re-run its key test, cherry-pick onto `main-axuse`, launch its unit reviewer (`briefs/p4-<unit>-reviewer.md`). When B4 lands, continue the B4 builder with `briefs/p4-b8-builder.md`. Then the integration review (`briefs/p4-integration-reviewers.md`), docs (`briefs/p4-docs.md`), offer the GPT reviewer, gate, draft PR.

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
| 4 | review UI (B4, B4b), reader (B11), research switch (B8, B8e), e2e journey (B12) | [#36](https://github.com/StepenkoAnatoli/Moonzila/pull/36) (draft, opened early for Windows CI) | DESIGN APPROVED 2026-10-04; spec revised after cross-vendor review, second review folded in; BUILDING |
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
| B11 reader | `src/main/` reader, `index.ts` case, tests | REVIEWED, FIXES P4-14, P4-16, P4-18 IN PROGRESS (reports `p4-b11-builder-1.md`, `p4-b11-reviewer-1.md`) | `1465f12` (branch `2c2cc7d`) | Opus |
| B4 panel | `ResearchPanel.tsx`, `research-text.ts`, `App.tsx`, tests | REVIEWED, P4-6..P4-8 FIXED (reports `p4-b4-builder-1.md`, `p4-b4-reviewer-1.md`, `p4-b8-builder-1.md`) | `6019045` (branch `a8a5b42`); lead `runMode` wiring `792e68e` | Opus |
| B4b card label | `ChangesPanel.tsx`, tests | REVIEWED, P4-1 FIXED (reports `p4-b4b-builder-1.md`, `-2.md`, `p4-b4b-reviewer-1.md`; App.tsx `runMode` wiring with B4) | `f8972f7`, fix `58bafd9` | Opus |
| B8e policy guard | main route module, `index.ts`, engine re-check, tests | REVIEWED, P4-10 FIXED (reports `p4-b8e-builder-1.md`, `-2.md`, `p4-b8e-reviewer-1.md`) | `805b97d`, `5e5e35e` (branch `581c19a`, `d85fbdd`) | Opus |
| B8 switch | `ResearchPanel.tsx` switch section | INTEGRATED (report `p4-b8-builder-1.md`); e2e journey owed (P4-20) | branch `2d94a1c`; lead `onProjectChange` wiring `06448f1` | Opus |

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
| P4-14 | B11 builder | S2 (the B11 pre-mortem's risk) | `verifyRetained` reports a validator timeout or storage limit as `STALE_VERIFICATION`, so the reader shows "Unverified" (or `DOCUMENT_UNVERIFIED`) when nothing is known | FIX BRIEFED to the B11 builder: adapter throws internal `VALIDATOR_UNAVAILABLE` for TIMEOUT and STORAGE_LIMIT; reader and review.ts map it as they map `INSTALLATION_INVALID`; OUTPUT_LIMIT and VALIDATOR_OUTPUT stay stale (a tampered ZIP can cause them) |
| P4-15 | B11 builder | process | the reader was implemented before its tests (not red-first) | ACCEPTED with the 15 guard removals as the red proof; the unit reviewer re-checks some |
| P4-16 | B11 unit review | S3 | a FIFO swapped in for the document hangs the read (no `O_NONBLOCK`), holding a libuv thread | FIX BRIEFED to the B11 builder: `O_NONBLOCK` on POSIX, red-first |
| P4-17 | B11 unit review | S3 | any non-ENOENT I/O error (EACCES, EBUSY, EMFILE, EPERM; antivirus on Windows) reads as `DOCUMENT_UNSAFE`, "Start the review again" | RECORDED for Phase 5: conservative (no text shown); a retryable outcome needs a spec row |
| P4-18 | B11 unit review | S3 | the post-read `contained()` check is untested | FIX BRIEFED: a test that reaches it, or the builder's reasoning that it is redundant |
| P4-19 | B11 unit review | S3, pre-existing | no method enforces its declared `authorization` (`project-member` is declarative); a researchId from another project is readable, as with `research.read` | RECORDED for Phase 5's gap-audit |
| P4-20 | B8 builder | S2 (owed) | the spec's e2e journey (turn research on, read a collected job's brief) is not written: a collected job needs the Windows native helper | INTEGRATED (B12: branch `00a04a7`, `fe6d16d`, `801eecd`; reports `p4-b12-builder-1.md`, `-2.md`); network tests 52/52 on main-axuse, dropping GET-only turns one red; the journey itself verified only by Windows CI (a merge check) |
| P4-21 | B8 builder | S3 | the preload passes only the error message, so the panel recognises `RUN_ACTIVE` by its public text (a test pins it to `bridge.ts`) | RECORDED: the test makes drift loud; carrying the code through the preload is a contract change for later |
| P4-22 | lead | process | the B12 brief said the existing journey reaches a collected package; it stops at the import park (`research-journeys.md` lists `collected` as Task 7 work) | the builder stopped instead of editing unowned files; scope widened to the test fixtures and the journeys doc |
| P4-23 | integration spec review | S2 (proposed S3; raised: it disables reviews on machines with a linked ancestor; pre-existing in Phase 3's `containedFolder`) | main walks from the filesystem root, the spec and engine from the data folder: a linked ancestor of userData makes every workspace read `DOCUMENT_UNSAFE` and every review start `PATH_OUTSIDE_PROJECT` | FIX BRIEFED to the B11 builder (after its current items): match the engine's walk and realpath comparison, red-first |
| P4-24 | integration spec review | S3 | an approved package that verifies shows "Cannot check" when the brief itself is refused (too large, absent) | RECORDED for Phase 5: a brief over 4 MiB is unrealistic and the kit's preflight requires BRIEF.md |
| P4-25 | integration spec review | S3 | ARCHITECTURE says only `INSTALLATION_INVALID` maps to `RESEARCH_KIT_UNAVAILABLE`; the reader maps every non-stale error (CANCELLED cannot occur: the reader passes no signal) | DOCS: the docs unit corrects the row |
| P4-26 | integration spec review | docs | spec text now false: button rule, "changes only research", `policy.guard`, section 3 edge cases, untrusted text | DOCS: "Phase 4 as built" in research-review-ui.md |
| P4-27 | integration invariant audit | design note | any future path that creates a non-research run outside `run.start` (missions) must take the project lock, or main aborts and holds before the engine refuses | RECORDED in the missions section of the plan when missions are designed; noted in the spec's "Phase 4 as built" |
| P4-5 | B4 builder | process | the permission system refused the builder's `git cherry-pick f8972f7` ("Logging/Audit Tampering") | NOT worked around by the builder; the lead wired `runMode` itself at integration, as planned before the refusal; reported to the user |
| P4-6 | B4 unit review | S2 (proposed S3; raised: it bypasses the conversation list's own guard) | `App.tsx:180` `openConversation`: no alive/project check on the `session.list` reply (a project switch can be overwritten by the old list), and no `busy`/`scopeLoading`/`activeRun` guard, so Open review can switch conversation during an active run | FIXED (branch `05689af`): list applied only for the same project; Open review disabled with the reason while busy, loading or a run is active; red-first; lead re-ran 82/82 |
| P4-7 | B4 unit review | S3 | no test for Start review hidden when untrusted or research off (`ResearchPanel.tsx:122`) | FIXED (branch `b467f7b`): tests added, each red with its condition removed |
| P4-8 | B4 unit review | S3 | the digest part of `jobKey` (`ResearchPanel.tsx:31`) is untested (the stale test also bumps the revision) | FIXED (branch `521fa95`): `ApprovedCheck` driven with only the digest changed |
| P4-9 | B4 unit review | Rejected | Start review offered after a trust change | the engine refuses `TRUST_CHANGED`; the renderer cannot see `trustRevision` |
| P4-10 | B8e unit review | S2 (proposed S3; raised: a regression of `run.start`) | the route learns a session's project and a project's active runs through the renderer's `session.read`, capped at 10000 runs: over the cap `run.start` and the research switch fail with INTERNAL_ERROR; one read per session, messages included, under the lock | FIX: lead adds internal engine controls `policy.guard {projectId}` and `session.project {sessionId}` (contract); the B8e builder implements them and moves the route onto them, red-first with the 10001-run case. FIXED (branch `8731f8e`, `254b049`; `Store.policyGuard` accepted); lead re-ran 38/38, dropping the mode filter turns its test red |
| P4-11 | B8e unit review | S3 | main refuses `RUN_ACTIVE` before the engine's `REQUEST_CONFLICT` for a stale `expectedRevision` during a Build run | RECORDED: code differs only; nothing is stopped; the spec's "as built" says so |
| P4-12 | B8e unit review | S3, pre-existing | a replayed `run.start` re-admits a capability for a run that already finished, never removed | RECORDED for Phase 5's gap-audit (present before Phase 4) |

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
