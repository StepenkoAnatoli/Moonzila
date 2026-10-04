# Brief - Windows file and directory semantics MoonAliza relies on: open-handle sharing modes on files and directories, whether an open directory handle stops new files being created in it, and whether MoveFileEx/ReplaceFile (and Node fs.rename) replace an existing file atomically

_Auto-drafted 2026-10-03 by `bin/brief.mjs` from the corpus. Sections marked **TODO**
require the reviewing agent's judgement; everything else is assembled from evidence already
in `research/`. While a **TODO** remains, this brief is **not reviewed** and the
handoff is **not approved** - a structurally valid corpus, a reviewed one, and an
approved handoff are three different states._

Reviewed by: agent

**This is the phase-1 to phase-2 handoff.** **Gate: PASS.** Every blocking unknown is closed with evidence, and every claim below
traces to a cached page in `research/raw/`.

Whoever you are - another agent, a different model, or a person - read this file
first. You should not need to re-research anything to start work. If something
here is not enough to build from, say which fact is missing rather than guessing
it: that is a phase-1 gap to close, not a phase-2 judgment call.

## Intent

MoonAliza is about to implement plan Task 5, the research review (docs/specification/research-review.md:
"The private workspace", "Packaging", "Tampering", open question Q9). At packaging, the native helper
(native/host.cpp ReadGuards) holds read guards while the kit's create runs: each workspace file opened GENERIC_READ
with share mode FILE_SHARE_READ, and each ancestor directory opened FILE_READ_ATTRIBUTES with
FILE_SHARE_READ|FILE_SHARE_WRITE and FILE_FLAG_BACKUP_SEMANTICS. MoonAliza also writes retained packages to a temp
file and renames them over the destination (Node fs.rename). Done means a builder knows, from the owners' pages,
exactly what those guards prevent other processes from doing (writing, deleting or renaming a guarded file;
renaming or deleting a guarded directory; creating entries inside it), and what the temp-then-rename replacement
does on NTFS: which Win32 call Node uses, whether it replaces a target that is open, and what Microsoft does and
does not promise about atomicity - so the design relies only on documented behaviour and Windows CI checks the rest.

## What we verified

| Claim | Source | Type |
|---|---|---|
| CreateFileW's dwShareMode decides which later opens succeed while this handle is open: without FILE_SHARE_WRITE no process can open the object for write access, without FILE_SHARE_DELETE none can open it for delete access, and delete access is what both delete and rename need; a conflicting later open fails with ERROR_SHARING_VIOLATION, and attribute access is not affected by the share mode. A directory is opened with CreateFile only by passing FILE_FLAG_BACKUP_SEMANTICS (OPEN_EXISTING only). So the helper's file guard (GENERIC_READ, FILE_SHARE_READ) blocks other writers, deleters and renamers of that file, and its directory guard (share read and write, no FILE_SHARE_DELETE) blocks any open of the directory for delete, i.e. deleting or renaming the directory itself. [quote: Otherwise, no process can open the file or device if it requests delete access.] [quote: Delete access allows both delete and rename operations.] [quote: To open a directory using **CreateFile**, specify the] | E-01 `learn.microsoft.com` (U-01, U-02) | P |
| A second CreateFile on an already open file is checked against the first handle's access and share modes in both directions, regardless of order; the compatibility table lists only GENERIC_READ opens as compatible with a first handle opened GENERIC_READ + FILE_SHARE_READ, so a writer cannot open a guarded file. [quote: the system compares the requested access and sharing modes to those specified when the file was opened.] [quote: It does not matter in which order the **CreateFile** calls are made.] | E-02 `learn.microsoft.com` (U-01) | P |
| At the NT layer a rename needs DELETE access to the file plus create access in the target directory. With ReplaceIfExists (FILE_RENAME_REPLACE_IF_EXISTS) a rename still fails if the target is a directory, read-only or executing, and fails if the target name exists and has open handles - unless FILE_RENAME_POSIX_SEMANTICS (FileRenameInformationEx, Windows 10 RS1+) is also set, which replaces the file despite open handles that stay valid. A directory cannot be renamed while any file under it has open handles, so file guards alone pin every ancestor. Renames stay within one volume. The Win32 name FILE_RENAME_FLAG_POSIX_SEMANTICS is not on this page. [quote: A file cannot be renamed if a file with the same name exists and has open handles] [quote: allow replacing a file even if there are existing handles to it.] [quote: A directory cannot be renamed if it or any of its subdirectories contains a file that has open handles] [quote: Renaming a file requires DELETE access to the file] | E-06 `learn.microsoft.com` (U-02, U-04, U-08) | P |
| MoveFileExW with MOVEFILE_REPLACE_EXISTING replaces an existing file at lpNewFileName (subject to ACLs) and reports an error if the target is an existing directory; a directory can be moved only on the same drive; MOVEFILE_WRITE_THROUGH only guarantees that a copy-and-delete move is flushed. The page makes no atomicity statement and does not describe an open target; renaming needs delete permission on the file or delete-child on the parent. [quote: the function replaces its contents with] [quote: When moving a directory, the destination must be on the same drive.] [quote: To delete or rename a file, you must have either delete permission on the file or delete child permission in] | E-03 `learn.microsoft.com` (U-04, U-06) | P |
| ReplaceFileW opens the replaced file with GENERIC_READ, DELETE and SYNCHRONIZE and share mode read/write/delete, and the replacement file with no sharing; so a replaced file held open by a handle without FILE_SHARE_DELETE (MoonAliza's file guard) makes it fail with a sharing violation (per E-01). It is not all-or-nothing on failure: ERROR_UNABLE_TO_MOVE_REPLACEMENT without a backup name leaves the replaced file gone and the replacement under its original name. REPLACEFILE_WRITE_THROUGH is not supported. [quote: **GENERIC\_READ**, **DELETE**, and] [quote: Otherwise, the replaced file no longer] [quote: This value is not supported.] | E-04 `learn.microsoft.com` (U-05, U-06) | P |
| Microsoft's guidance for an all-or-nothing update of one document-like file (instead of the deprecated TxF) is to write a new file and then replace the original, naming ReplaceFile as one method; the page states the requirement but gives no atomicity guarantee for ReplaceFile or MoveFileEx. [quote: A common approach is to write the document to a new file, then replace the original file with the new one.] | E-05 `learn.microsoft.com` (U-06) | P |
| Node's documented fs.rename/renameSync contract (v26.10.0 docs): newPath is overwritten if it exists, a directory at newPath raises an error, and the page points to POSIX rename(2); it says nothing Windows-specific about atomicity or open targets. [quote: In the case that `newPath` already exists, it will be overwritten.] [quote: If there is a directory at `newPath`, an error will be raised instead.] | E-07 `nodejs.org` (U-09) | P |
| libuv (v1.x src/win/fs.c) implements uv_fs_rename on Windows as a single MoveFileExW(old, new, MOVEFILE_REPLACE_EXISTING): no MOVEFILE_WRITE_THROUGH, no ReplaceFile, and no FILE_RENAME_POSIX_SEMANTICS, so a rename over a target that has open handles fails (E-06) and the Win32 error is returned. [quote: if (!MoveFileExW(req->file.pathw, req->fs.info.new_pathw, MOVEFILE_REPLACE_EXISTING)) {] | E-08 `raw.githubusercontent.com` (U-10) | P |

## Contradictions and how they were resolved

Three places where sources read differently. None changes the guard design; two change how the rename may be described.

- **"Write a new file, then ReplaceFile" vs ReplaceFile's own failure states.** Microsoft's TxF page names write-then-ReplaceFile as one way to get an all-or-nothing update of a single file (E-05). ReplaceFileW's own reference page documents a failure (ERROR_UNABLE_TO_MOVE_REPLACEMENT, no backup name) after which the replaced file no longer exists (E-04). Trust the function's own reference page for failure behaviour: ReplaceFile is not atomic on failure, and the TxF page states a need, not a guarantee. MoonAliza must not call either ReplaceFile or the rename "atomic" (U-07 stays KNOWN-UNKNOWN).
- **Node's rename(2) pointer vs the Windows implementation.** Node's docs say newPath "will be overwritten" and point to POSIX rename(2) (E-07), whose replacement succeeds even when the target is open. On Windows libuv calls MoveFileExW(MOVEFILE_REPLACE_EXISTING) without POSIX semantics (E-08), and the NT rename rules say a rename fails when the target name exists and has open handles (E-06). Trust the libuv source and the NT rules for Windows: fs.rename over a destination another process holds open fails there with an error (the Win32 error mapped by libuv; the exact code is not in the corpus) instead of replacing it.
- **NT rename rule "a file cannot be renamed if it has any open handles" vs the share-mode model.** E-06 states the rule without qualification; E-01 says an open handle blocks delete/rename only when it lacks FILE_SHARE_DELETE. For MoonAliza both readings agree, because the helper's file guards do not share delete: a guarded file cannot be renamed, deleted or replaced. The difference would matter only for files opened with FILE_SHARE_DELETE, which the design does not rely on.

Corroboration: every Microsoft claim rests on learn.microsoft.com alone (the gate's one-voice warnings); the Windows CI checks under Known unknowns are the second, independent reading.

## Known unknowns

- **U-03** - Whether an open directory handle (any share mode) prevents creating new entries, or renaming/deleting unguarded entries, inside that directory (spec Q9)
  - Known so far: No fetched Microsoft page states it (E-01 and E-06 cover only the directory itself and guarded files).
  - Day-one verification: Windows CI test - hold the helper's directory guard (FILE_READ_ATTRIBUTES, share read+write, FILE_FLAG_BACKUP_SEMANTICS) on a temp folder, then from a second process create a file, create a subfolder, rename and delete an unguarded file in it; record each result and error code. Expected to succeed (the helper's own comment says a guarded directory may still accept temporary files); the design keeps relying on inventory equality either way.
- **U-07** - Whether MoveFileExW(MOVEFILE_REPLACE_EXISTING) on NTFS is atomic across a crash or power loss (the destination holds the old or the new file, never neither)
  - Known so far: No fetched primary page guarantees it (E-03 has no atomicity statement; E-05 states the need without a guarantee; E-04 documents non-atomic failure states for ReplaceFile).
  - Day-one verification: do not depend on it - after a restart main re-validates the retained package (spec Q6) and treats a missing or invalid destination as not ready; a Windows CI test renames over a destination held open by a concurrent reader and records that the rename fails with an error and leaves the old file in place.
- **U-11** - That Node's fs.rename/renameSync dispatch to uv_fs_rename (Node src/node_file.cc), in the Node version Electron bundles
  - Known so far: Not collected within the 8-page budget.
  - Day-one verification: read src/node_file.cc (Rename calls uv_fs_rename) at the tag of the Node version MoonAliza's Electron bundles (process.versions.node), and check that deps/uv/src/win/fs.c fs__rename there matches E-08.

## Decision

What the guards prove, for the spec's Tampering table (all from E-01, E-02, E-06):

- A **file guard** (GENERIC_READ, FILE_SHARE_READ) stops any other process opening that file for write or delete access, so it cannot be written, truncated, deleted, renamed, or replaced by a rename over it while create runs. Readers still succeed.
- A **directory guard** (FILE_READ_ATTRIBUTES, share read+write, no FILE_SHARE_DELETE, FILE_FLAG_BACKUP_SEMANTICS) stops the directory itself being deleted or renamed. File guards alone already pin every ancestor directory against rename (E-06).
- **Nothing documented stops a new file or subfolder appearing inside a guarded directory** (U-03, Q9). Keep packaging step 5 (inventory equality, REVIEW_PACKAGE_MISMATCH) as the defence, exactly as the spec says.

What the rename gives, for retained packages (E-03, E-06, E-07, E-08):

- Node's fs.rename on Windows is MoveFileExW(MOVEFILE_REPLACE_EXISTING): same-volume replace of a file; fails if the destination is a directory, read-only, or open by anyone (no POSIX semantics). Keep the temp file in the same folder (same volume) as the destination.
- Describe it as "replace by rename", never "atomic": no fetched Microsoft page guarantees crash atomicity (U-07). The spec's re-validation of a retained package after restart (Q6) is what makes a lost or torn destination safe; a failed rename must leave the job not ready and the temp file swept.
- Do not switch to ReplaceFileW: it is not all-or-nothing on failure (E-04) and gains nothing here. Do not add FILE_RENAME_POSIX_SEMANTICS through native code unless a test shows destinations are routinely held open; it is the only documented way to replace an open target (E-06).

**First build step:** add a Windows-only CI test file beside the helper's tests that (1) takes the helper's read guards on a temp workspace and asserts that a second process cannot write, delete or rename a guarded file nor rename or delete a guarded folder; (2) records whether creating a file and a subfolder inside a guarded folder succeeds (Q9, U-03) and prints the result; (3) renames a temp file over a destination held open by a reader and asserts an error with the old destination intact (U-07). Then implement packaging as specified, unchanged.

Out of scope: network shares and non-NTFS volumes (the helper admits only normalized local drive paths), TxF, cross-volume moves (MOVEFILE_COPY_ALLOWED).

## Next steps

1. Review the **TODO** sections above (Contradictions, Decision) before handing off.
2. Hand this file to the builder (phase 2). Re-running `node "$HOME/.agents/research-kit/bin/brief.mjs"`
   redrafts this file while it is unedited; after any edit it refuses without `--force`,
   so your judgements are preserved.

<!-- research-kit:brief-draft body=c96010aadfb5085e inputs=cecfaa78ed44ac69 gate=pass -->
