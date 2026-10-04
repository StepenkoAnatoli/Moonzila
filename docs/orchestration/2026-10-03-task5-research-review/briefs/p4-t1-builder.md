# T1: tests for the mutation audit's survivors (P4-37, P4-38)

Worktree `/home/user/task5-handoff/wt/p4-t1`, branch `build/p4-t1`, from the PR #36 head. Read `p4-common.md` first. The audit is `reports/p4-int-mutation-1.md`.

Owns: test files only (`tests/**`). No product code. If a survivor can only be killed by changing product code, stop and report it.

For each item: write the test, then mutate the guard exactly as the audit did and show the new test red ON ITS OWN INPUT (run alone), then restore. Name the guard in the test title.
- P4-37 (S1): make each of these three tests' own input reach its named guard, or rename it to the guard that its input actually reaches and add a test for the original guard:
  - the junction test whose walk can be skipped (containedFolder catches its input);
  - "nothing to read" (needs a failed or cancelled job that has a verification);
  - Checking -> Ready (add the `verified: false` case to that test).
- P4-38 (S2):
  - DocumentReader stale replies: a brief reply arriving after the evidence was requested must not show under "Evidence table", and a reply after the job's revision changed is discarded (all three guards);
  - `jobKey` revision: an approved job whose revision changes with the same digest re-checks, and the old Ready is not kept;
  - route abort filter: an update in project p1 never aborts, revokes or holds a run in project p2;
  - reviewed-and-unverified: the explanation is shown, not an empty `<pre>`;
  - `approved` keeps the reader;
  - the switch's revision-wins rule: a newer external policy revision is not masked;
  - a dangling link at the job folder is `DOCUMENT_UNSAFE`, not `DOCUMENT_NOT_AVAILABLE`. If the product returns NOT_AVAILABLE there, that is a product finding: stop and report it.
- P4-39 (optional): `STORAGE_LIMIT` -> `VALIDATOR_UNAVAILABLE` in `verifyRetained`, only if the adapter's existing `OwnedRunner` injection can produce it without new product hooks.

Renderer tests: wait on states the product produces after the call, never on an initial state (P4-35). Filesystem tests: junctions inside your mkdtemp only. Any Store you open is closed before cleanup (P4-34).

Verification: typecheck, lint, every touched test file, each new test repeated 10 times alone. Commit on your branch, one commit per finding group. Report a table guard -> test -> red-run evidence; plus anything that turned out to be a product defect.
