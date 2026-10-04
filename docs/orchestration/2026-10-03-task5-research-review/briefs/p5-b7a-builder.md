# B7a: research.purge (engine control + main + adapter)

Worktree `/home/user/task5-handoff/wt/p5-b7a`, branch `build/p5-b7a`, base `7e1f4d9`. Read `p5-common.md` first. Requirements: F-1..F-6, N-1, S-1, T-1 in `REQUIREMENTS-P5.md`.

Owns: `src/engine/control-dispatch.ts` (`research.retained`), `src/engine/store.ts` (one read for it; the collected digest comes from the `collecting -> collected` journal detail's verification, as `research.review.context` reads it), `src/adapters/research-kit/adapter.ts` (a `purgeRetained(...)` that runs inside `serialized()` and forgets receipts), a new `src/main/research-purge.ts`, the `case 'research.purge'` in `src/main/index.ts`, tests, ARCHITECTURE rows.

Must hold (spec decisions 1-7):
- Under the storage lock: read `research.retained`; refuse `PURGE_NOT_ALLOWED` unless the job is approved, failed or cancelled; delete the job's collected and reviewed ZIPs not referenced by any other job (`keptShared` counts the kept ones); if no job is in `ACTIVE_RESEARCH`, also delete store entries no job references; else keep them and `keptBusy: true`; forget receipts of every deleted digest.
- Only `<storage>/artifacts/<64 hex>.zip` names are ever deleted; any other entry is left and never followed (lstat, no links).
- Windows: a delete that fails with EBUSY or EPERM (a handle without FILE_SHARE_DELETE, research E-01) is retried once, then the call answers `RESEARCH_KIT_UNAVAILABLE`; what was deleted before stays deleted, and the result is never reported as complete.
- No path from the renderer; `research.retained` never in MethodSpec.

Pre-mortem: deletes a digest another job still references (shared collected package); reads references outside the lock so an import retained during the purge is deleted as an orphan; deletes orphans while a job is active; follows a link in `artifacts/`; forgets receipts it did not delete, or keeps receipts it did.

Tests (real Store, real kit adapter, the fixture packages; Stores closed): each status; a shared digest kept and the other job's reader still verifies; orphans removed only with no active job; an import's retain racing the purge ordered by the lock (use the adapter's `admit` hook or a held lock, no sleeps); a link or a non-zip entry in `artifacts/` untouched; receipts; EBUSY retry (inject the unlink, as the adapter's `OwnedRunner` style allows; report if no seam exists).
