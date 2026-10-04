# B4b unit review 1 (saved by the lead; structured sections kept)

- Reviewed `f8972f7` in `/home/user/task5-handoff/wt/p4-rev-b4b`. Verdict: meets spec section 2 and both pre-mortem lines; one finding.
- `activeRun` is the right source: the panel's `runId` is already `activeRun?.id` (`App.tsx:216`); one active run per project (`operations.ts:216`); review session in the job's project (`research-review.ts:199`); `mode` persisted and read by `session.read` (`App.tsx:96`), so a remount keeps it; a review run live at shutdown ends `interrupted`.
- Finding (proposed S3; lead: S2, it is the mislabel spec section 2 forbids): `ChangesPanel.tsx:59` reads the current `runMode` prop while `pending` is stale state cleared only when the next load resolves. When the research run stops being active, `runMode` turns undefined first and the stale card reads "Review edit · research/BRIEF.md" with Approve enabled until reload. Reproduced with a scratch re-render while `changes.list` was held. Fix: bind the mode to the card at load (`setPending({...preview, runMode})`).
- Builder claims re-run: tests 17/17, typecheck clean, both guard removals (1 red / 4 red) confirmed on a scratch copy.
- Not checked: lint, App.tsx wiring (not in commit), the running app.
- Open risk: B4 must take `runMode` from the same object that supplies `runId` (pass from `activeRun`).
