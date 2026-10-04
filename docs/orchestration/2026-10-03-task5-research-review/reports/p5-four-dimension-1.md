# Final four-dimension audit, PR #37 (Task 5 Phase 5)

Saved from the reviewer's return (agent a3ee79ffa1510a8e2, Opus, read-only worktree at `c10b8be`). The scorecard is unedited.

Final four-dimension audit of Moonzila PR #37 (Task 5 Phase 5). I graded `git diff cb343a2..c10b8be`, 88 files, in the read-only worktree /home/user/task5-handoff/wt/fda (detached at c10b8be). I did not author this change and modified nothing there. Mutation probes ran in a `git archive` copy in my scratchpad.

**Merge-relevant up front:** when I checked, the PR head was c10b8bef1d09 and its two `desktop` check runs (GitHub Actions jobs 111530052847 and 111529991428) were still `in_progress`; the PR's mergeable state was `unstable`. Windows CI on the exact head is unknown, so AGENTS.md's merge rule ("never merge while a check is red or unknown") does not yet hold.

## SPEC — 8/10
1. [observed] Decision 8 ("an approved job will read Unverified") is only partly met. In history rows, `PurgeControl` is always rendered with `unverified={false}` (`src/renderer/ResearchPanel.tsx`, the history `<li>` map). The as-built reason was that only the current job's Ready check can change. P5-11's new Show control (same PR) made that stale: an approved history job can be purged without the Unverified line, then shown, and it reads Unverified. `tests/research-panel-purge.test.tsx` "the Unverified line is shown only for the current approved job…" locks in the narrower behaviour. Fix: pass `job.status === 'approved'` for history rows, and update that test and the as-built paragraph in `docs/specification/research-purge.md`.
2. [observed] A-1 (Windows CI green on the head) is not met yet: both check runs are in progress (see above).
3. [observed] Additions beyond F-1..F-8 / N-1 / S-1 / T-1 / D-1:
   - P5-11: the Show control and panel-subject logic.
   - P5-12: the Cancel review confirmation and its wording.
   - P5-13: `REVIEW_REBUILT_NOTICE` in `src/engine/research-review.ts`.
   - Break-test fixes P5-17 and P5-18.

   The task statement's "gap-audit and break-test over Task 5" covers them and RUN.md records each one, so I count them only lightly. They are still behaviour changes the REQUIREMENTS table never lists.
4. [observed] The N-1 row in `REQUIREMENTS-P5.md` still says "`RESEARCH_KIT_UNAVAILABLE` with nothing half done". The build answers `PURGE_INCOMPLETE` and keeps earlier deletes. That change is justified and recorded in research-purge.md's as-built section and in P5-5, but the requirements table was never amended.

Everything else is present and tested:
- F-1..F-7: main-owned method and result shape; status refusals; shared digests kept; the read happens under the lock; orphans only when nothing is active; receipts forgotten; panel control with confirmation.
- F-8: CA and leaf are generated at test time; `git ls-files tests/fixtures/github-tls` lists only README.md.
- D-1: pkijs 3.4.1 and asn1js 3.0.10 are explicit devDependencies.
- S-1: `research.retained` is a strict `ControlSchema` member and is not in `MethodSpec`.

## DESIGN — 8/10
1. [observed] `src/main/research-purge.ts`, `purgeResearch`: the selector returned from `plan` writes the result into outer `let keptShared` / `keptBusy` variables. `let decided` plus the `error === decided` identity check is then the only way to tell plan refusals from store failures. If the selector returned `{ targets, keptShared, keptBusy }`, and `purgeRetained` passed that through and tagged its own failures, the result would have one owner and no identity trick.
2. [observed] `src/engine/control.ts`: the new `research.retained` doc comment and `ResearchRetainedResultSchema` were inserted between the `session.project` JSDoc and `SessionProjectResultSchema`. That leaves a dangling comment and an undocumented schema.
3. [observed] `src/renderer/ResearchPanel.tsx` keeps growing as one component. It now holds:
   - the subject-choice state machine (`choice`, `fresh`, a `useEffect` keyed on a newline-joined `activeKey`);
   - the cancel-confirmation state;
   - the purge-refusal state and per-job purge counters;
   - the inline Cancel review confirmation JSX.

   The subject choice and the Cancel review confirmation would each read more clearly as a small hook or component, as `PurgeControl` already is.

Leave as is: `verifyRetained` is now one locked step via `validateOwned`; `purgeRetained` checks the status before listing the store and runs `lstat` again before each unlink; `Store.researchRetained` fails closed on a non-digest.

## CORRECTNESS — 8/10
Verified:
- The nine Phase 5 test files (`research-purge`, `research-panel-purge`, `research-panel-subject`, `research-panel-cancel-review`, `research-review-engine`, `research-contracts`, `github-tls`, `research-panel`, `research-review-native`): 8 files passed, 1 skipped; 213 tests passed, 2 skipped (Windows-only).
- `npm run typecheck` and `npm run lint`: both clean.
- Full `vitest run --reporter=json` in the worktree (Node 24.21.0, cwd /home/user/task5-handoff/wt/fda): 1121 total, 1041 passed, 74 failed, 6 pending. Failures by file: research-kit 20, managed-ollama 11, git 10, commands 8, guarded-process 7, owned-transport 7, command-broker 6, owned-connection 3, hardware 1, scheduler 1.
  - This matches AGENTS.md's recorded Linux set exactly: 74, the same ten files, and the same per-file counts once the documented 21→20 research-kit change is applied.
  - No file was without `assertionResults`.
- Mutation probes on a scratch copy:
  - Dropping the shared-digest filter (`targets = [...own]`) made 5 tests fail.
  - Forcing `busy = false` made the orphans/keptBusy test fail.
  - Removing the `PURGE_NOT_ALLOWED` check made 3 tests fail, including the byte-identical-rows test.
- PR #37 head is c10b8bef1d09 and base is cb343a2, matching the diff under review.

Could not run:
- The Windows-only tests (the held-handle purge through the native helper, and P5-14 review kit children through `MoonAlizaHost.exe`). They are skipped on Linux, and Windows CI on the head was still in progress.
- The e2e Playwright journeys, because Electron cannot run in this container (AGENTS.md).

Unsure:
- Whether moving `verifyRetained` back outside the lock would turn the race tests red. I did not mutate it.
- Whether a Windows `EPERM` from a read-only attribute, rather than an open handle, could reach `PURGE_INCOMPLETE` with its "another program is using them" message. This is [inferred] low risk, because the app writes these files itself.

Gaps:
1. [observed] The history-row approved purge omits the Unverified disclosure (SPEC 1). Reproduce: an approved job behind a newer failed job; open History, choose Delete stored corpus, and the confirmation shows two lines. Confirm, then choose Show: the job reads Unverified.
2. [inferred] The import race test ("an import retaining a ZIP while the purge reads its references…") still passed with `busy = false`. It does not exercise the window where a retained ZIP is not yet committed. The orphans test is what actually guards decision 5.

## QUALITY — 8/10
Estimated reducible size: about 5% of the code, roughly 30–40 lines, mostly in `research-purge.ts` (the closure plumbing) and the `ResearchPanel.tsx` subject logic. Confidence: medium.

1. [observed] `src/main/research-purge.ts`: `decided`, the outer `let keptShared` / `keptBusy`, and the `catch` that re-wraps `decided` could go if the selector returned its counts (see DESIGN 1).
2. [observed] `src/engine/control.ts`: fix the misplaced JSDoc (DESIGN 2).
3. [observed] `src/renderer/ResearchPanel.tsx`: the label check `cancelLabel(current.status) === 'Cancel review'` is repeated three times, inline and in `cancel()`. A `reviewCancel = current.status === 'reviewing' || current.status === 'packaging'` (or reuse of the existing helper) would remove that string comparison as control flow.

Most of the 28k added lines are the break-test research corpus (raw captures and the ledger, which the Research-Kit convention requires) and orchestration records. I do not count those against code size.

## Leave alone
- The `PURGE_INCOMPLETE` replacement for N-1's `RESEARCH_KIT_UNAVAILABLE`: Windows cannot give an all-or-nothing purge, and the new message is accurate.
- Keeping shared digests between two finished jobs (P5-10). This is the user's 2026-10-03 rule as written.
- Deciding the status before `artifacts/` is listed (review F2), and the `lstat` re-check before each unlink.
- `Store.researchRetained` throwing `RESEARCH_STATE_INVALID` on a malformed digest rather than treating it as null.
- The non-extractable CA key in `tests/fixtures/github-tls.ts`.

## Next pass
Hold the merge until both `desktop` Windows check runs on c10b8bef1d09 finish green; that is a hard AGENTS.md merge condition, and nothing else here blocks. Then, as one small commit, pass `unverified={job.status === 'approved'}` to history-row `PurgeControl`s and update the panel test and the as-built paragraph. It closes the only user-facing spec gap, where an approved job's purge confirmation omits the "reads Unverified" disclosure that decision 8 requires, and it costs about three lines. The DESIGN and QUALITY cleanups are cosmetic and can wait.

## Scorecard
| Dimension | Score |
|---|---|
| SPEC | 8/10 |
| DESIGN | 8/10 |
| CORRECTNESS | 8/10 |
| QUALITY | 8/10 |
