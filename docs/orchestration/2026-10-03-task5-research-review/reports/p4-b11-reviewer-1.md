# B11 unit review 1 (saved by the lead; structured sections kept)

- Reviewed `1465f12` (same patch-id as `2c2cc7d`) in `/home/user/task5-handoff/wt/p4-rev-b11` at `7b025af`; tree clean. No S1/S2.
- F1 (S3): `research-document.ts:172` opens without `O_NONBLOCK`: a FIFO swapped in via the `beforeOpen` hook left the call pending > 5 s until a writer opened it; the IPC call never answers and each hang holds a libuv threadpool thread. Needs a local process; review runs never run commands (`policy.ts:18-19`). Fix: `O_NONBLOCK` on POSIX.
- F2 (S3): any non-ENOENT `lstat`/`open` error (EACCES, EBUSY, EMFILE, EPERM: e.g. antivirus on Windows) becomes `DOCUMENT_UNSAFE` ("Start the review again") for a transient error; the spec has no row. Expected, not run.
- F3 (S3, test gap): the post-read `contained()` at `:164` untested (removed: 20/20 green); the identity check makes it mostly redundant.
- Guard removals re-done, all red: dev/ino check; fallback on UNSAFE; never fall back; cut before redacting; both nlink checks.
- TOCTOU: O_NOFOLLOW covers the last component only; a swapped `project/` or `research/` is caught by dev/ino plus nlink 1. Windows: O_NOFOLLOW is 0; relies on libuv lstat reporting junctions as links, realpath in `containedFolder`, bigint fstat file id plus volume serial (expected, not run); ReFS 128-bit ids truncated to 64-bit `ino`.
- No text or path reaches IPC: `fail()` throws a bare code; `safeError` (`bridge.ts:51`) passes known codes only; nothing logged.
- Bindings: approved `boundRevision` (as `review.ts:534/585`), collected `verification.jobRevision` (as `review.ts:164/434`); one status snapshot; `verified` only after `verifyRetained` succeeds in the call.
- Authorization: nothing in `src` reads the method's `authorization` field; `project-member` is declarative for every method; a researchId from another project is readable, as with `research.read` (not a regression). Admission is not checked; the spec is silent.
- Not checked: full suite, lint, Windows.
