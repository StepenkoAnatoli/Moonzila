# MAP - topic decomposition

## Topic

How SQLite changes a CHECK constraint: the documented table-rebuild procedure and its rules for foreign keys, triggers, views, indexes and transactions, as better-sqlite3 runs it

## Subtopics

Statuses are blank on purpose: phase 0 gathers material, it does not judge. Mark each
row COVERED (cite the U-## rows that cover it), DISMISSED (reason required - dismissing
is fine, omitting is not), or GAP, and add topic-specific subtopics where the checklist
is not enough.

| ID | Subtopic | Why it matters | Status | Covered by |
|---|---|---|---|---|
| D-1 | Access model | Public pages, an official API, an auth-walled app, or a paywall - each is a different collection design | DISMISSED | Not a data source: SQLite and better-sqlite3 documentation is public and the engine runs locally |
| D-2 | Auth and credentials | What accounts, keys, or logins the collection and the product need, and who holds them | DISMISSED | No accounts or keys: an embedded database opened by the app itself |
| D-3 | Rate limits and quotas | Caps every cadence in the design, and caps the research collection itself | DISMISSED | No service and no quota: a local migration runs once per database |
| D-4 | ToS, licensing, legality of the intended use | A prohibition on automated collection, storage, or display ends the design for that source - and sometimes the project | DISMISSED | SQLite is public domain and better-sqlite3 is already a MoonAliza dependency; no new licence question |
| D-5 | Data schema and its stability | How the data is shaped, and how often the source changes the shape without asking | COVERED | U-01, U-03, U-04, U-05 |
| D-6 | Freshness and staleness | How fast the data goes stale, and what staleness costs the product that depends on it | DISMISSED | Documentation of a stable engine; version pinning is D-8 |
| D-7 | Cost at expected volume | The economics at real usage, not the pricing page's first row - this decides viability | DISMISSED | No metered cost; a rebuild copies rows once |
| D-8 | Runtime and platform limits | Where this actually executes - OS, runtime version, desktop app, cloud - and what those limits forbid | COVERED | U-06, U-07, U-08 |
| D-9 | Output obtainability | Does the data your stated "done" depends on exist, and can you actually get it? Load-bearing: a project whose output cannot be produced should die in phase 1, not phase 2 | COVERED | U-01, U-02 |
| T-1 | Rebuild step order (12-step procedure) | A wrong order drops triggers, breaks references or leaves a half-migrated schema | COVERED | U-01, U-05 |
| T-2 | Foreign keys during the rebuild | DROP TABLE with enforcement on runs an implicit DELETE that fires FK actions | COVERED | U-02, U-03, U-04 |
| T-3 | All-or-nothing migration under better-sqlite3 | The spec requires the migration to fully apply or roll back | COVERED | U-06, U-07 |

## Coverage notes (per dimension)

- D-5 (schema): the rebuild procedure, what DROP TABLE removes, how RENAME rewrites references, and what foreign_key_check returns are all in sqlite.org's own pages (E-01..E-04).
- D-8 (runtime): MoonAliza runs SQLite through better-sqlite3 13.0.3 in Electron; its transaction and pragma API is E-06, and the bundled SQLite version is U-08 (KNOWN-UNKNOWN, checked on day one).
- D-9 (obtainability): the documented procedure exists and states which order is safe (E-01); nothing the build needs is unobtainable.
- The decompose step was not run for real: its dry run planned 5 searches against a budget of 3, so this map is the seeded checklist classified by hand, with T-1..T-3 added for the topic.

## Candidate material

Gathered 2026-10-03.

_No material gathered - run without `--dry-run`, or add URLs to `research/plan.json`._

