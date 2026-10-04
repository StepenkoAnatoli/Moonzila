# B11: the reader `research.document.read` (main)

Worktree: `/home/user/task5-handoff/wt/p4-b11`. Read `common.md` beside this file first.

Spec: `docs/specification/research-review-ui.md` section 3 (contract, outcomes table, source by status, workspace read, redaction then cut) and section 5 tests.

Owns: a new main module (for example `src/main/research-document.ts`), its wiring as a `case 'research.document.read'` in `src/main/index.ts` `handle`, new tests (for example `tests/research-document.test.ts`), the ARCHITECTURE.md row.

Facts to start from (verify them):
- `ResearchKit.verifyRetained(digest, binding, signal?, admit?)` (`src/adapters/research-kit/adapter.ts` ~282) validates afresh and returns `{receipt, bytes}`; throws `STALE_VERIFICATION` (missing or not verifying) or `INSTALLATION_INVALID` (this machine) or `CANCELLED`.
- The binding for a collected package comes from the engine control `research.review.context` (`verification`), as `src/main/review.ts` builds it for start; the reviewed package's binding uses its `boundRevision` with that verification, as `review.ts` validates the produced package. Reuse those helpers rather than re-deriving the binding.
- The workspace path and `containedFolder` live in `src/main/review-workspace.ts`; the rule is in research-review.md "Phase 3 as built".
- `vault.redact(text)` (`src/main/vault.ts:183`) throws `REDACTION_UNAVAILABLE`; it replaces each saved secret by `[redacted]`.
- Extract `research/BRIEF.md` or `research/EVIDENCE.md` from the package ZIP bytes in memory, under the package's `project/` prefix; check how `review-workspace.ts` reads entries and reuse it.

Must hold:
- The request never names a path. Status decides the source (spec table). Every outcome maps to exactly one result or one code; no `STALE_VERIFICATION`, `PATH_OUTSIDE_PROJECT` or `ENCRYPTION_UNAVAILABLE` leaves the reader.
- `approved`: text only from the buffer `verifyRetained` returned; a missing or non-verifying package is a RESULT `{text:'', verified:false, source:'reviewed', truncated:false}`; `INSTALLATION_INVALID` is `RESEARCH_KIT_UNAVAILABLE`.
- Workspace read: ancestors real directories, realpath matches; lstat each component below the root; open; fstat: regular file, nlink 1, same identity as the lstat; read at most 4 MiB + 1 byte (`DOCUMENT_TOO_LARGE` over 4 MiB). Any link/junction/hard link/replaced file is `DOCUMENT_UNSAFE`. Fallback to the collected package only when the workspace folder does not exist (ENOENT on the job folder), never on a containment failure.
- Decode, redact the WHOLE text, then cut to <= 262,144 UTF-8 bytes at a character boundary; `truncated` true if the redacted text was longer. Redaction failure: `DOCUMENT_REDACTION_UNAVAILABLE`, no text.
- No receipt cache. Errors carry no document text (never put text or paths in `cause` messages that could reach IPC; `safeError` only maps codes, but check).

Pre-mortem (how this unit most likely fails review): reads the workspace without containment and identity checks, or with a path from the request; calls bytes verified without validating in this call, or extracts from a second read of the file; cuts before redacting; lets a containment failure fall back to the collected package; maps a validator outage to "Unverified".

Tests (against the real pinned kit and the collected fixture package, as `tests/research-review-*.test.ts` do; find their harness and reuse it): every row of the spec's B11 test list in section 5, including the secret straddling byte 262,144 (no prefix of it in the result), redaction expansion past the cap, deleted vs tampered approved package (result, not error), deleted collected package (`DOCUMENT_UNVERIFIED`), validator unavailable, > 4 MiB, a junction or hard link (Windows-only primitives may be skipped on Linux the way existing guard tests do; use a symlink where Linux allows), multibyte boundary.
