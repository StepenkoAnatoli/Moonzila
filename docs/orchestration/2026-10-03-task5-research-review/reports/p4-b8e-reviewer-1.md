# B8e unit review 1 (saved by the lead; structured sections kept)

- Reviewed `805b97d`, `5e5e35e` in `/home/user/task5-handoff/wt/p4-rev-b8e` at `54a3df1`; tree clean.
- F1 (S3 proposed; lead: S2, a regression): `policy-route.ts:55`, `:87` call `session.read`, whose result is capped at 10000 runs (`params.ts:104`). Verified: a session with 10001 completed runs makes the route's research-only update fail (ZodError -> INTERNAL_ERROR; the engine directly applies it) and `run.start` through the route fail (it worked before). The reads have no other bound: one `session.read` per session (51 sessions -> 51 reads), each with up to 1000 messages, under the project lock.
- F2 (S3): `policy-route.ts:67` main does not check `expectedRevision`: a stale revision during a Build run gets `RUN_ACTIVE` from main where the engine would answer `REQUEST_CONFLICT`. Code only; nothing stopped.
- F3 (S3, pre-existing): `policy-route.ts:79` a replayed `run.start` returns the stored `queued` reply and main re-admits a capability for a finished run, never removed (verified with a `cancelled` run).
- Lead's concerns: only `run.start` creates Ask/Plan/Build runs (`application.ts:227`); `mission.*` NOT_IMPLEMENTED; `research.review.start` creates research runs (exempt); reads return before `acceptRequest` (`application.ts:104`), no ids journaled; engine exit rejects pending requests (`engine.ts:93`), 30 s timeout; on rejection lock and holds released (verified); decisions 1 and 3 acceptable (the old code stopped every run); `run.cancel`, `session.policy.update`, `project.revokeTrust` unchanged.
- Builder claims re-run: typecheck clean, 11 passed; guard removal at `:67` -> 2 red.
- Not checked: full suite, lint, ARCHITECTURE rows, the review supervisor's admission timing, renderer.
