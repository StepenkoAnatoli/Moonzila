# Research purge (Task 5, Phase 5)

`research.purge` deletes the retained package bytes of finished research. The user decided its scope on 2026-10-03: only retained ZIPs are deleted, the job and its journal stay, and only finished jobs are purged when no other job references the digest. Q7 (research-review.md) adds that unreferenced ZIPs left by repeated packaging are included. This page settles the rest. It is a lead decision drafted on 2026-10-04 during Phase 4's final review, written before Phase 5's builders start.

## Decisions

1. **Main owns the method.** The retained ZIPs live in main's storage (`<userData>/research-kit/storage/artifacts/<sha256>.zip`), and the adapter's storage lock serialises them. The engine knows which digests the jobs reference, but it cannot delete main's files.
   - The declared contract (`src/shared/params.ts`: engine-owned, returning `Deleted`) changes to main-owned, returning `{ removed: number, keptShared: number, keptBusy: boolean }`.
   - *Set aside:* keeping it engine-owned and having main act on a notice. That splits one user action across two processes with no reply that says what was deleted.
2. **Which jobs.** Only `approved`, `failed` and `cancelled`.
   - Refused: `collected` and `not_ready`, because a review starts from the collected package and `not_ready` can be reviewed again; and every active status.
   - The refusal is a new public code, `PURGE_NOT_ALLOWED`: "Only finished research can have its stored corpus deleted: approved, failed or cancelled."
3. **References.** A new internal engine control, `research.retained`, returns every job's id, status, collected digest (from the `collecting -> collected` verification in the journal) and reviewed package digest, in one read. It is internal like `policy.guard`, and never in `MethodSpec`.
   - Main deletes a digest of the purged job only when no other job, in any status, references it.
   - `keptShared` counts the digests that were kept because another job shares them.
4. **The read happens inside the storage lock.** Main takes the adapter's storage lock first, reads `research.retained` inside it, deletes, and releases. So a review start's or the reader's `verifyRetained` of the same digest runs entirely before or entirely after the purge.
   - After a purge, the reader for an approved job answers `verified: false`: "Unverified: the reviewed package is missing or no longer matches".
   - For a failed or cancelled job it answers `DOCUMENT_NOT_AVAILABLE`, as it already does.
5. **Orphans.** In the same locked step, main also deletes store entries that no job references, but only when no job anywhere is in an active status.
   - An import or a packaging step retains a ZIP before the engine commits the digest that references it. An in-flight job's ZIP looks orphaned until then.
   - When any job is active, orphans are kept and `keptBusy` is true.
   - *Set aside:* an age threshold for orphans. A clock is not evidence that a ZIP is unreferenced.
6. **Receipts.** The adapter forgets its in-memory receipts for every deleted digest (this also bounds P4-30's growth).
7. **What stays.** The job row, its journal, the review workspace folder (deleted by recovery as today), and every hash recorded in the journal. The engine's state does not change; the panel derives "corpus deleted" from the reader's answer, not from a new status.
   - *Set aside:* a journal row or column for purges. It is a schema change, and the user decided the job and journal stay as they are.
8. **Renderer.**
   - A finished job in the Research panel offers **Delete stored corpus**. Its confirmation says:
     - the brief and evidence can no longer be read;
     - an approved job will read "Unverified";
     - the job's record stays.
   - The result reports what was removed and kept.
   - The control's text contains neither "approve" nor "authorize" (the Phase 4 button rule).

## Tests the builders owe

- Each status: allowed for approved, failed and cancelled; `PURGE_NOT_ALLOWED` for collected, not_ready and every active status.
- A digest shared with another job is kept (`keptShared`), and the reader for the other job still verifies.
- Orphans are removed only when no job is active, and kept with `keptBusy` while an import or packaging step is in flight.
- A purge racing `verifyRetained` of the same digest (review start, reader): the storage lock orders them, and neither sees a half-deleted file.
- After a purge: the approved job reads Unverified; the reader never falls back to another source.
- Receipts for deleted digests are gone.
- No path is taken from the renderer, and `research.retained` is unreachable from it.
- Windows: deleting a ZIP while another handle has it open. The test pins the outcome: EBUSY/EPERM is retried once, then answered `RESEARCH_KIT_UNAVAILABLE` with nothing half done.

## Also in Phase 5

- **P4-40:** generate the e2e test CA and leaf certificate at test time, so no private key is committed, and prove it on Windows CI. This clears the kit 0.9.5 `doctor` blocker.
- **Carry-overs from Phase 4** for the gap-audit and break-test: P4-12, P4-17, P4-30 to P4-33, P4-39, P4-42.
