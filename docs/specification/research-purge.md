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
- Windows: deleting a ZIP while another handle has it open. EBUSY/EPERM is retried once; still refused, the call answers `PURGE_INCOMPLETE` (lead decision after the Phase 5 spec review, P5-5): the packages already deleted stay deleted, the message says so and asks the user to close the program and delete again (a purge is idempotent). *Set aside:* `RESEARCH_KIT_UNAVAILABLE`, whose message tells the user to reinstall the kit, and an all-or-nothing purge, which Windows delete semantics cannot give.

## Also in Phase 5

- **P4-40:** generate the e2e test CA and leaf certificate at test time, so no private key is committed, and prove it on Windows CI. This clears the kit 0.9.5 `doctor` blocker.
- **Carry-overs from Phase 4** for the gap-audit and break-test: P4-12, P4-17, P4-30 to P4-33, P4-39, P4-42.

## Phase 5 as built (October 4)

Units B7a (`research.purge` in main, the adapter's locked step and the `research.retained` control), B7b (the panel) and P4-40 (test-time TLS), their unit reviews, the integration spec review and invariant audit, and the gap-audit (findings P5-1 to P5-16 in the [run ledger](../orchestration/2026-10-03-task5-research-review/RUN.md)). The decisions above are what was designed; where the build differs from them or adds to them, this section says so, and the build is what runs. Code: `src/main/research-purge.ts` (`purgeResearch`), `ResearchKit.purgeRetained` in `src/adapters/research-kit/adapter.ts`, `Store.researchRetained` in `src/engine/store.ts`, `PurgeControl` in `src/renderer/ResearchPanel.tsx` and `PURGE_TEXT` in `src/renderer/research-text.ts`. Tests: `tests/research-purge.test.ts` and `tests/research-panel-purge.test.tsx`.

**The result** (decisions 1, 3 and 5)
- **`removed` counts every ZIP deleted, orphans included**, not only the job's own digests. A target whose file is already gone (ENOENT), or that is no longer a regular file when it is checked again just before its delete, is skipped and not counted.
- **`keptShared` counts only the job's own shared digests whose file is in the store** (P5-6). A digest another job references but whose file is gone is not counted, so a second purge of the same job reports 0, not 1.
- **`keptBusy` is true only when unreferenced ZIPs were actually kept.** While a job is active, a store with no unreferenced ZIP answers `keptBusy: false`; it does not mean "a job was active".
- **`research.retained` also returns each job's `projectId`** besides its id, status, collected digest and reviewed digest. A journal row for `collecting -> collected` whose verification digest is not a lowercase 64-hex digest makes the whole read `RESEARCH_STATE_INVALID`, so the purge deletes nothing rather than treat a referenced ZIP as unreferenced.

**The order of checks** (decisions 2 and 4)
1. No kit installed: `RESEARCH_KIT_UNAVAILABLE` at once, before the engine is asked anything. So on such a machine an unknown job or a `collected` job also answers `RESEARCH_KIT_UNAVAILABLE`, not `NOT_FOUND` or `PURGE_NOT_ALLOWED`.
2. Under the storage lock, the `research.retained` read, then the job's status: an unknown job is `NOT_FOUND` ("This operation is no longer available."), a job outside `approved`, `failed` and `cancelled` is `PURGE_NOT_ALLOWED`. The engine's own refusals (`ENGINE_UNAVAILABLE` and the like) pass through unchanged; a code outside `ErrorCodeSchema` (`RESEARCH_STATE_INVALID`, a schema error in the reply) reaches the renderer as `INTERNAL_ERROR`.
3. Only then is `storage/artifacts` listed (review F2): a link or non-folder there is `RESEARCH_KIT_UNAVAILABLE`, but only after the status has been decided, so a refused purge never reports a store fault.

**The Windows retry and `PURGE_INCOMPLETE`** (requirement N-1, P5-5)
- A delete refused with `EBUSY` or `EPERM` is retried once after 100 ms. No other code is retried; `ENOENT` on either attempt counts as already gone.
- Refused again with `EBUSY` or `EPERM`, the purge stops with `PURGE_INCOMPLETE`: "Some stored packages could not be deleted because another program is using them. Close that program and delete the stored corpus again; the packages already deleted stay deleted." This replaces N-1's "`RESEARCH_KIT_UNAVAILABLE` with nothing half done", which was not true for a purge with several targets: what was deleted before the held file stays deleted, and the message now says so instead of telling the user to reinstall the kit. The receipts of the ZIPs that were deleted are forgotten; the held ZIP keeps its own.
- Any other failed delete, on the first attempt or the retry, is the store's fault: `RESEARCH_KIT_UNAVAILABLE`, again keeping what was already deleted.
- The Linux tests answer the delete through the adapter's injectable `unlink`; a Windows-only test holds a real ZIP open through the native helper (review F1) and checks that a second purge, once it is released, removes it.

**Shared digests between finished jobs** (P5-10). Two finished jobs that share a digest each keep it for the other, so purging either of them never deletes that ZIP, even when both are purged. This is the user's 2026-10-03 rule (delete only when no other job references the digest) applied as written, and it is kept: sharing needs identical package bytes, which the unique `client_ref` makes rare.

**Receipts** (decision 6 overstated). A purge forgets the receipts of exactly the digests it deleted, and nothing else. Every other receipt stays until the app quits (`close()`): each reader call and review start validates afresh and leaves one, so receipts for digests that are never purged still grow by one per call. Decision 6's "this also bounds P4-30's growth" holds only for purged digests; P4-30 itself stays recorded (bounded by clicks; a receipt is small).

**`verifyRetained` is now one locked step.** Before Phase 5 the existence check ran outside the storage lock and validation and read each took it. Now the existence check, the validation and the read of the validated bytes run in one step under the lock, so a purge of the same digest runs wholly before or wholly after a review start's or the reader's `verifyRetained`; tests cover both orders for the review start and the reader. The order inside it is unchanged from before (review F3): a missing file is `STALE_VERIFICATION` before the binding is parsed.

**The panel** (decisions 7 and 8)
- **The "Unverified" disclosure is shown only for the panel's current job when it is `approved`**, and it is worded conditionally: "If this research passed review and no other research uses its stored package, it reads "Unverified" instead of "Ready" from then on." A history row's confirmation has two lines: the brief and evidence can no longer be read; the record stays and packages another research job uses are kept. Failed and cancelled jobs never get the Unverified line (P5-2).
- **History rows offer Delete stored corpus** for their finished jobs, as well as the current job. A refusal is shown once, beside the control that was used, and automatic errors do not replace it.
- **There is no "corpus deleted" state.** The panel reports the result once (`purgeResultText`), then re-runs the approved check and closes an open document. An approved job then reads Unverified; a failed or cancelled job looks as before (the reader is not offered for those statuses); and the control stays offered: a second purge finds none of the job's own packages left to delete (it can still remove orphans, by the rules above).

**Invariant 4 (rows unchanged).** `tests/research-purge.test.ts` "a refused, a shared-digest and an approved purge leave the research, research_events, runs and events rows byte-identical" compares full dumps of those tables before and after (P5-8); the integration audit had shown it only with a scratch test.
