# B7a fix round (P5-5, P5-6, P5-8, B7a review F1-F3)

Worktree `/home/user/task5-handoff/wt/p5-b7a-fix`, branch `build/p5-b7a-fix`, base `0fa1966` (main-axuse; contains `PURGE_INCOMPLETE`, `b4cfab7`). Read `p5-common.md`. One commit per item group, each red-first.

1. P5-5 (S2): a delete still refused after its one retry answers `PURGE_INCOMPLETE` (not RESEARCH_KIT_UNAVAILABLE); earlier deletes stay deleted; receipts forgotten only for files actually deleted. A missing kit or an unusable store stays RESEARCH_KIT_UNAVAILABLE.
2. Review F2: inside the lock, read `research.retained` and decide NOT_FOUND / PURGE_NOT_ALLOWED before listing `artifacts/`; a listing failure only after the status check. Test: a junction at `artifacts` with an unknown job -> NOT_FOUND, with a collected job -> PURGE_NOT_ALLOWED.
3. Review F3: `verifyRetained` keeps its earlier order (missing file -> STALE_VERIFICATION before the binding parse), or justify why not.
4. P5-6: a test for a purge racing a review start's `verifyRetained` (both orders, lock-ordered, no sleeps); the reader race in the other order; `keptShared` counts only the job's own digests whose file is in the store (a second purge of the same job reports 0).
5. P5-8: a byte-compare test: the research, research_events, runs and events rows (full `quote()` dumps) are identical before and after a refused, a shared-digest and an approved purge.
6. Review F1: a Windows-only test (skipped elsewhere, like `tests/guarded-fs-semantics.test.ts`) that holds the native helper's read guard on a retained ZIP and asserts PURGE_INCOMPLETE after the retry, with the guard released afterwards and a second purge removing it. Verified by the lead on Windows CI.

Run typecheck, lint, research-purge, research-document, research-review-main-kit, review-main, research-review-e2e. Report commits, guard removals, mistakes.
