# B4b builder report 2: fix for P4-1 (saved by the lead; structured sections kept)

- Worktree `/home/user/task5-handoff/wt/p4-b4b`, branch `build/p4-b4b`, commit `4cfdb3b` on `b0fcc76`.
- Change: the card stores the `runMode` its load was for (`setPending(preview && { ...preview, runMode })`); the heading reads `pending.runMode`; `runMode` in the load effect's dependencies; `approval.decide` unchanged. New 7th test holds the next `changes.list` and re-renders with `runId`/`runMode` undefined: heading stays "Research workspace"; card gone after release. ARCHITECTURE row: one clause.
- Red first on `b0fcc76` (received "Review edit · research/BRIEF.md"); with fix changes-panel + workbench 18/18; typecheck, lint exit 0; gate allow (all verified).
- Guard removals: heading back to the prop -> new test red; mode not stored -> new test and the research label test red.
- Mistake: b0fcc76 took the label from the current prop though the card can outlive its run; fixed here; verified red/green.
- Open: App.tsx `runMode={activeRun?.mode}` (with B4).
