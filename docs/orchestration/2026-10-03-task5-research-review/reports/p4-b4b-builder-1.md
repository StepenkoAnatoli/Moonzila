# B4b builder report 1 (saved by the lead, condensed from the hand-back; structured sections kept)

- Worktree `/home/user/task5-handoff/wt/p4-b4b`, branch `build/p4-b4b`, commit `b0fcc76` (parent `7bc04e6`).
- Files: `src/renderer/ChangesPanel.tsx` (optional prop `runMode?: Run['mode']`; heading `Research workspace` when `runMode === 'research'`, else `Review edit`), `tests/changes-panel.test.tsx` (new), `docs/ARCHITECTURE.md` (one sentence in the "Review run (Task 5, B2)" row).
- Needs a decision: the panel receives only `api`, `projectId`, `runId`; no list/read carries the mode, and `run.started` is missed after a remount. Proposal: `App.tsx` ~216 passes `runMode={activeRun?.mode}` (App.tsx is B4's file).
- Tests: research mode shows exactly "Research workspace · research/BRIEF.md", card text and Decline unchanged, Approve sends `approval.decide` with `decision: 'allow'`; five tests (ask, plan, build, mission, no mode) keep "Review edit".
- Guard removals: always-old label -> test 1 red (also the original red); always-new -> all 5 red; predicate weakened to "any mode" -> ask/plan/build/mission red.
- Commands: vitest changes-panel + workbench 17/17 (verified); typecheck, lint clean (verified); commit gate allow. In-app label: expected, untested until App.tsx passes runMode.
- Mistake: Decline asserted after Approve closed the card (false red in the new test only); moved before the click; re-run 6/6.
