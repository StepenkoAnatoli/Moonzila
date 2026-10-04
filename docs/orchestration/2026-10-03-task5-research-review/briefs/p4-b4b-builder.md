# B4b: approval card label in a review run

Worktree: `/home/user/task5-handoff/wt/p4-b4b`. Read `common.md` beside this file first.

Spec: `docs/specification/research-review-ui.md` section 2.

Owns: `src/renderer/ChangesPanel.tsx` and its test file(s), the ARCHITECTURE.md row if one names the card.

Must hold: when the card's run has `mode` `'research'` (`RunSchema.mode`, `src/shared/contracts.ts`), the label reads "Research workspace · <path>" instead of "Review edit · <path>". Everything else (buttons, text, `approval.decide`) unchanged. Find how the panel knows the run; if it does not have the run's mode today, get it from what the panel already receives, and report if that needs a contract change (do not make one).

Pre-mortem: labels by session title instead of run `mode`; changes the label for other modes.

Tests: a research-mode run shows the new label and not the old; an ask/plan/build run keeps "Review edit"; each test fails with the mode check removed.
