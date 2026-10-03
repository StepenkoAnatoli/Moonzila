# Discovery Contract - Windows file and directory semantics MoonAliza relies on: open-handle sharing modes on files and directories, whether an open directory handle stops new files being created in it, and whether MoveFileEx/ReplaceFile (and Node fs.rename) replace an existing file atomically

Started 2026-10-03. This file is the definition of "enough information to build".
`node "$HOME/.agents/research-kit/bin/preflight.mjs"` reads it and blocks the build until every unknown
below is either `CLOSED` with evidence or `KNOWN-UNKNOWN` with a verification step.

## Build intent

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

## Unknowns

A fact belongs here when guessing it wrong changes the design: API limits and pricing,
auth model, data schemas, rate limits, licensing/ToS, platform behavior, current library
versions, competitor pricing, data availability.

Status is exactly one of:
- `CLOSED` - proven by an `E-##` row in `research/EVIDENCE.md` (which must point at cached raw text).
- `KNOWN-UNKNOWN` - unreachable now; the `Evidence` cell names the day-one verification step.

Anything else (`OPEN`, blank, "in progress") fails the gate.

| ID | Unknown | Why it blocks the build | Status | Evidence |
|---|---|---|---|---|
| U-01 | What a CreateFileW share mode blocks for later openers of a file: which opens fail while a handle opened GENERIC_READ + FILE_SHARE_READ is held (write, delete, rename) | The freeze relies on file guards to stop a workspace file being changed or swapped while create runs (Tampering table) | CLOSED | E-01, E-02 |
| U-02 | Directories: how a directory is opened (FILE_FLAG_BACKUP_SEMANTICS) and what a directory handle without FILE_SHARE_DELETE blocks - renaming or deleting the directory itself; whether file guards pin their ancestors | Ancestor guards are meant to stop a folder being renamed or replaced by a junction during create | CLOSED | E-01, E-06 |
| U-03 | Whether an open directory handle (any share mode) prevents creating new entries, or renaming/deleting unguarded entries, inside that directory (spec Q9) | Decides whether inventory equality is the only defence against an added file (the spec assumes so) | KNOWN-UNKNOWN | No fetched Microsoft page states it (E-01 and E-06 cover only the directory itself and guarded files). Day one: Windows CI test - hold the helper's directory guard (FILE_READ_ATTRIBUTES, share read+write, FILE_FLAG_BACKUP_SEMANTICS) on a temp folder, then from a second process create a file, create a subfolder, rename and delete an unguarded file in it; record each result and error code. Expected to succeed (the helper's own comment says a guarded directory may still accept temporary files); the design keeps relying on inventory equality either way. |
| U-04 | MoveFileExW with MOVEFILE_REPLACE_EXISTING: what replacement does, and what happens when the target is open | Node's rename (U-10) is this call; a retained package renamed over an open destination must have a defined failure | CLOSED | E-03, E-06 |
| U-05 | ReplaceFileW: replacement semantics, its access and share modes, and its failure states | The alternative to rename for replacing a retained package | CLOSED | E-04 |
| U-06 | What Microsoft says about atomic replacement of a single file (ReplaceFile, MoveFileEx) | Decides whether temp-then-rename may be described as atomic in the design | CLOSED | E-05, E-03, E-04 |
| U-07 | Whether MoveFileExW(MOVEFILE_REPLACE_EXISTING) on NTFS is atomic across a crash or power loss (the destination holds the old or the new file, never neither) | If not, a crash during the rename could leave no retained package at the destination | KNOWN-UNKNOWN | No fetched primary page guarantees it (E-03 has no atomicity statement; E-05 states the need without a guarantee; E-04 documents non-atomic failure states for ReplaceFile). Day one: do not depend on it - after a restart main re-validates the retained package (spec Q6) and treats a missing or invalid destination as not ready; a Windows CI test renames over a destination held open by a concurrent reader and records that the rename fails with an error and leaves the old file in place. |
| U-08 | NT rename with POSIX semantics (FILE_RENAME_POSIX_SEMANTICS, FileRenameInformationEx): whether it replaces a target with open handles | The only documented way to replace an open target; tells whether Node's path can do it | CLOSED | E-06 |
| U-09 | Node fs.rename contract: overwrite of an existing newPath, directory target | The packaging code calls fs.rename | CLOSED | E-07 |
| U-10 | Which Win32 call and flags libuv's uv_fs_rename uses on Windows | Determines the Windows behaviour of the rename (open target, write-through, POSIX semantics) | CLOSED | E-08 |
| U-11 | That Node's fs.rename/renameSync dispatch to uv_fs_rename (Node src/node_file.cc), in the Node version Electron bundles | Links U-09 to U-10; not on any fetched page | KNOWN-UNKNOWN | Not collected within the 8-page budget. Day one: read src/node_file.cc (Rename calls uv_fs_rename) at the tag of the Node version MoonAliza's Electron bundles (process.versions.node), and check that deps/uv/src/win/fs.c fs__rename there matches E-08. |

## Questions for the human (maximum 3)

Intent questions only - things no document can answer. Facts never go here; they go in
the table above. If a question's answer is in public documentation, it is a research
task, not a question.

None - the intent is fixed by the specification.

## Already decided

Locked decisions for this project. Do not revisit these without the human.

- The specification does not rely on directory guards stopping file creation; inventory equality catches an added file (research-review.md, Packaging step 5, Q9).
- Phase 1 stays within 8 fetched pages and 3 searches; decompose was run only with --dry-run (a real run would have searched each of 3 topic parts on two providers).
