# Phase 5 prep (written during Phase 4's review, 2026-10-04)

Phase 5 content (plan): B7 `research.purge`, docs, the four-role review, then `gap-audit` and `break-test` (offer the GPT reviewer for gap-audit). Carry-overs from Phase 4: P4-12, P4-17, P4-19 (recorded for Phase 5).

## B7 `research.purge`: what is decided
- User, October 3: deletes only the retained ZIP; the job and its journal stay; only finished jobs; only when no other verification references the digest.
- Q7 (research-review.md): includes unreferenced ZIPs from repeated packaging.

## B7: what the lead must settle before the brief (contract questions)
1. **Owner.** `src/shared/params.ts` declares `research.purge` as `'engine'` returning `Deleted`. The retained ZIPs live in main's storage (`storage/artifacts/<sha256>.zip`, the adapter's store, under its storage lock). The engine knows which digests jobs reference; main owns the bytes. Likely shape: main-owned, reads references from the engine (an internal control, as `policy.guard`), deletes under the storage lock. A contract change, so the lead freezes it first.
2. **"Finished".** Which statuses: `approved`, `not_ready`, `failed`, `cancelled`? A `not_ready` job can be reviewed again (`research.review.start` continues from the collected package), so purging its collected ZIP ends that; decide whether `not_ready` counts or purge refuses it.
3. **References.** A job references its collected digest (the `collecting -> collected` verification) and, once approved, its reviewed package digest. Two jobs can share a digest only by identical bytes; "no other verification references it" must be checked across all jobs under one read.
4. **Approved jobs.** Purging an approved job's reviewed ZIP makes the panel's live check "Unverified" (the reader's `verified: false`): intended by "readiness only from a live verification", but the panel and the confirmation must say so.
5. **Orphans.** ZIPs from repeated packaging that no job references: purged per job, or by a store-wide sweep? Q7 says included; decide how they are found (no job names them).
6. **Concurrency.** A purge racing a review start's `verifyRetained` or the reader's validation of the same digest: the storage lock serializes; define who wins and what the loser answers.
7. **Renderer.** Where the control lives (the Research panel's job detail?), its confirmation text, and its disclosure ("the corpus can no longer be read or reviewed; the job record stays").

## Docs
- `research-review-ui.md` "Phase 4 as built" (spec reviewer's list), ARCHITECTURE rows, the plan's Phase 4 entry, AGENTS.md invariants if new tests prove one.

## Reviewers
- Four-role integration review on Phase 5's range; then gap-audit (offer GPT: brief from `gpt-review-brief-phase3.md`'s shape) and break-test over all of Task 5.
