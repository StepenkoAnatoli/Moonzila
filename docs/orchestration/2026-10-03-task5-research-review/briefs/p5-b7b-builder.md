# B7b: Delete stored corpus (Research panel)

Worktree `/home/user/task5-handoff/wt/p5-b7b`, branch `build/p5-b7b`, base `7e1f4d9`. Read `p5-common.md` first. Requirement F-7; spec decision 8.

Owns: `src/renderer/ResearchPanel.tsx`, `src/renderer/research-text.ts`, `tests/research-panel.test.tsx` (or a new panel test file), the ARCHITECTURE row.

Must hold: approved, failed and cancelled jobs offer **Delete stored corpus**; it opens a confirmation listing: the brief and evidence can no longer be read; an approved job will read "Unverified"; the job's record stays. Buttons Cancel / Delete stored corpus. Only the confirm calls `research.purge {researchId}`. The result is shown ("Removed N stored packages", plus "N kept because another job uses them" and "Unused packages were kept because research is running" when they apply). `PURGE_NOT_ALLOWED` and other refusals show the public message, no retry. After a purge the panel re-checks an approved job (its Ready check re-runs). No text contains "approve" or "authorize" except the existing status words the button rule already allows; the button-text test is extended for the new button.

Pre-mortem: offers the button for collected or not_ready; deletes without the confirmation; shows Ready from a stale check after the purge; the result line drifts from the result schema.

Tests: each status's offer; confirmation and Cancel; the exact params; each result line; a refusal; the approved re-check after purge (wait on the call, P4-35).
