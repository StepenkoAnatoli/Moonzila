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

## Phases (one draft PR each; the user marks "Ready for review", the lead merges on green)
| Phase | Content | PR | Status |
|-------|---------|----|--------|
| 0 | research, decisions, frozen contracts, admission fix | #32 | MERGED |
| 1 | schema v4 (B0), Windows guard tests (B6), Moonzila spelling | #33 | MERGED |
| 2 | Electron fuses (B5), test-only package for packaged e2e (D2) | #34 | MERGED |
| 3 | engine review run (B2), main supervisor (B3), e2e scenarios (B10), fix round | #35 | MERGED (710e083) |
| 4 | review UI (B4, B4b), reader (B11), research switch (B8, B8e) | - | DESIGN APPROVED 2026-10-04; spec revised after cross-vendor review, second review folded in; BUILDING |
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
| B11 reader | `src/main/` reader, `index.ts` case, tests | BUILDING | - | Opus |
| B4 panel | `ResearchPanel.tsx`, `research-text.ts`, `App.tsx`, tests | BUILDING | - | Opus |
| B4b card label | `ChangesPanel.tsx`, tests | INTEGRATED, IN UNIT REVIEW (report `reports/p4-b4b-builder-1.md`; App.tsx `runMode` wiring moved to B4) | `f8972f7` (branch `b0fcc76`) | Opus |
| B8e policy guard | main route module, `index.ts`, engine re-check, tests | BUILDING | - | Opus |
| B8 switch | `ResearchPanel.tsx` switch section | BRIEFED (after B4) | - | Opus |

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
- 2026-10-04: a cross-vendor (GPT) reviewer joins Phase 3's review and is offered for Phase 5's gap-audit.

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
