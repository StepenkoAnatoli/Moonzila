# Report: Task 5 Phase 5 (auto-build)

Task statement (verbatim): "Continue the auto-build: Moonzila Task 5 Phase 5 (research.purge per docs/specification/research-purge.md, P4-40 test-time TLS fixtures, four-role review, gap-audit and break-test over Task 5)". Authorization: the user's standing mandate (MANDATE-P5.md) and "merge as you decide just be careful", "dont lower quality". The user's last instruction: "finish the latest task and stop".

## Outcome
PR #37 (https://github.com/StepenkoAnatoli/Moonzila/pull/37), merged with a merge commit once every merge check held on its final head (the merge commit is recorded on the PR). Every requirement in TRACEABILITY-P5.md is VERIFIED; the purge control has no e2e journey (unit and panel tests only).

## What was built
- `research.purge` (main-owned): deletes a finished job's retained ZIPs that no other job references, removes unreferenced ZIPs only when nothing is active, reads references and deletes under the kit's storage lock, and answers `PURGE_INCOMPLETE` when Windows still refuses a delete after one retry. The job and its journal stay byte-identical.
- The internal engine control `research.retained`; `verifyRetained` as one locked step.
- Research panel: Delete stored corpus with a confirmation (Unverified line for approved jobs, current or history), Show for any earlier job, Cancel review confirmation.
- Review engine: a fresh retry tells the model its earlier edits are gone.
- Test-time CA and leaf for the fake GitHub (no private key committed); Research-Kit `doctor` READY.
- Break-test fixes: Electron's installer in AGENTS.md's install step; the fixture generator cleans its temp folder.

## Verification
- Pinned Linux gate on `59b3ef9` (and again on the final head before the merge): typecheck, lint, build pass; 1121 tests, 74 failed, all in the baseline, 0 new, 0 files without results.
- Windows CI on `59b3ef9`: push run 37235382886 and PR run 37235386221, both success; the final head's runs are checked before the merge.
- Reviews: unit review per unit, integration spec review, invariant audit (seven invariants hold), gap-audit, break-test, final four-dimension audit, re-review of P5-23 (PASS; its S3 test gap P5-29 fixed in `97b399c`).
- Not run: the cross-vendor (GPT) reviewer offered for the gap-audit (the user asked to continue without stopping); e2e journeys for the purge control.

## Four-dimension audit (final reviewer, on `c10b8be`, unedited)
| Dimension | Score |
|---|---|
| SPEC | 8/10 |
| DESIGN | 8/10 |
| CORRECTNESS | 8/10 |
| QUALITY | 8/10 |

Full report: `reports/p5-four-dimension-1.md`. Its one user-facing gap (P5-23) was fixed in `6a9985d` and re-reviewed before the merge.

## What went wrong
- P5-3: a placeholder commit id in a reviewer's launch message. Rule since: ids from `git log`.
- P5-5: my spec said a blocked Windows delete answers `RESEARCH_KIT_UNAVAILABLE` with nothing half done; neither was true for a multi-file purge. Fixed with `PURGE_INCOMPLETE`.
- P5-9: I edited the checkout while a gate ran in it, producing a false failure. Gates now run in pinned worktrees.
- P5-19: my gate comparison was blind to files that fail to load. It now also compares totals and files without results.
- P5-23: the history-row Unverified line, dropped by a narrower rule that P5-11's Show made stale; caught by the final audit.
- P5-29: my P5-23 test guarded the defect but not its opposite (history rows showing the line for failed or cancelled jobs); the re-review's mutation survived. Fixed with a history-row check.
- P5-28: the first pinned gate on `59b3ef9` lacked the `.build` link to the staged kit, so 134 real-kit tests failed. Found by comparing the two worktrees; re-run with the link equals the baseline.

## Open items
- P5-15: a retry is not told why the previous review failed (interface change).
- P5-16: collected and not_ready corpora cannot be abandoned (changes the user's purge rule).
- P5-25, P5-26: the audit's cosmetic design and test notes.
- P5-27: one Windows push run on `c10b8be` timed out in `research-jobs-state.test.ts` (unchanged Phase 4 test, 1.25 s on a normal run, 7 fresh SQLite stores with `synchronous = FULL`); the PR run on the same commit and both runs on `59b3ef9` passed. Not root-caused; watch for recurrence.
- P5-20..P5-22, P4-23 and the recorded Phase 4 carry-overs.
- Queued after Task 5 (not started), in the plan's order: More models, the linked parent above the data folder (P4-23), Self-unblocking with research. The user has not ordered them; the next run should ask which comes first.
