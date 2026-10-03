# MAP - topic decomposition

## Topic

Windows file and directory semantics MoonAliza relies on: open-handle sharing modes on files and directories, whether an open directory handle stops new files being created in it, and whether MoveFileEx/ReplaceFile (and Node fs.rename) replace an existing file atomically

## Subtopics

Statuses are blank on purpose: phase 0 gathers material, it does not judge. Mark each
row COVERED (cite the U-## rows that cover it), DISMISSED (reason required - dismissing
is fine, omitting is not), or GAP, and add topic-specific subtopics where the checklist
is not enough.

| ID | Subtopic | Why it matters | Status | Covered by |
|---|---|---|---|---|
| D-1 | Access model | Public pages, an official API, an auth-walled app, or a paywall - each is a different collection design | DISMISSED | The facts are public vendor documentation and open source; nothing is collected at runtime |
| D-2 | Auth and credentials | What accounts, keys, or logins the collection and the product need, and who holds them | DISMISSED | No account or key: the helper runs as the user; the ACL needs of rename are recorded under U-04 |
| D-3 | Rate limits and quotas | Caps every cadence in the design, and caps the research collection itself | DISMISSED | Local file-system calls have no quota |
| D-4 | ToS, licensing, legality of the intended use | A prohibition on automated collection, storage, or display ends the design for that source - and sometimes the project | DISMISSED | Calling documented Win32 and Node APIs raises no licensing question |
| D-5 | Data schema and its stability | How the data is shaped, and how often the source changes the shape without asking | COVERED | U-08 |
| D-6 | Freshness and staleness | How fast the data goes stale, and what staleness costs the product that depends on it | DISMISSED | API contracts, not data; version-gated behaviour (FileRenameInformationEx, Node version) is carried by U-08 and U-11 |
| D-7 | Cost at expected volume | The economics at real usage, not the pricing page's first row - this decides viability | DISMISSED | No metered cost at runtime |
| D-8 | Runtime and platform limits | Where this actually executes - OS, runtime version, desktop app, cloud - and what those limits forbid | COVERED | U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-10 |
| D-9 | Output obtainability | Does the data your stated "done" depends on exist, and can you actually get it? Load-bearing: a project whose output cannot be produced should die in phase 1, not phase 2 | COVERED | U-03, U-07, U-11 |
| T-1 | File share modes (helper file guards) | What a FILE_SHARE_READ-only read handle stops other processes doing | COVERED | U-01 |
| T-2 | Directory handles (helper ancestor guards, Q9) | Whether a guarded folder can be renamed, deleted or added to | COVERED | U-02, U-03 |
| T-3 | Replacing a file on NTFS | Temp-then-rename of retained packages: semantics, open targets, atomicity | COVERED | U-04, U-05, U-06, U-07, U-08 |
| T-4 | Node and libuv rename on Windows | Which Win32 call fs.rename makes | COVERED | U-09, U-10, U-11 |

## Coverage notes (per dimension)

- D-5, U-08: the POSIX-semantics rename flag exists only in FileRenameInformationEx (Windows 10 RS1 and later); E-06.
- D-8, T-1..T-3: the platform is Windows/NTFS through the helper's CreateFileW guards and Node's rename; closed from learn.microsoft.com (E-01..E-06) and libuv (E-08), except creation inside a guarded directory (U-03) and crash atomicity (U-07), which no fetched page states.
- D-9: the output is design facts; the two facts no primary page states are labelled KNOWN-UNKNOWN with Windows CI checks, and the Node-to-libuv link (U-11) with a source read.
- Dismissed rows: the subject is local OS and runtime behaviour, with no access, credential, quota, licence, freshness or cost dimension.

## Candidate material

Gathered 2026-10-03.

_Decompose ran only with `--dry-run` (search budget); the owning pages were named directly in `research/plan.json`._

