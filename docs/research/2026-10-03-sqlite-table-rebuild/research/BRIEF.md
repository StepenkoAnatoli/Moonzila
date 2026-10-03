# Brief - How SQLite changes a CHECK constraint: the documented table-rebuild procedure and its rules for foreign keys, triggers, views, indexes and transactions, as better-sqlite3 runs it

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

MoonAliza (Electron/TypeScript desktop coding agent, SQLite through better-sqlite3 13.0.3) is about to implement
plan Task 5, the research review (docs/specification/research-review.md, "Schema v4" and "Recovery and restart").
Schema v4 must rebuild the `research` and `research_events` tables, because SQLite cannot change a `CHECK`
constraint in place: the status CHECKs gain `'packaging'`, `research_events.actor` gains `'engine'`, `research` gains
nullable review columns and table checks, and triggers are replaced (`research_readiness_reserved` becomes
`research_readiness_digest`, plus an immutability trigger). Done means a builder knows, from sqlite.org and
better-sqlite3's own documentation, the step order that copies every row, keeps every foreign key and recreates
every index, trigger and view, and how to run it in better-sqlite3 so the migration either fully applies or
fully rolls back, with no silently dropped trigger, broken reference or half-migrated database.

## What we verified

| Claim | Source | Type |
|---|---|---|
| sqlite.org's generalized ALTER TABLE procedure has 12 steps: (1) PRAGMA foreign_keys=OFF if enabled; (2) begin a transaction; (3) save the SQL of every index, trigger and view on X from sqlite_schema; (4) CREATE TABLE new_X in the new format; (5) INSERT INTO new_X SELECT ... FROM X; (6) DROP TABLE X; (7) ALTER TABLE new_X RENAME TO X; (8) recreate indexes, triggers and views; (9) drop and recreate views the change affects; (10) PRAGMA foreign_key_check if FKs were enabled; (11) commit; (12) re-enable foreign keys. The page warns that renaming the old table away first (rename old, create new, copy, drop old) is incorrect and can corrupt references in triggers, views and foreign keys; create-new, copy, drop-old, rename-new-into-old is the correct order, and the full procedure is the one for adding CHECK constraints. Since 3.25.0 a RENAME also rewrites references in trigger bodies and views; since 3.26.0 parent-table FOREIGN KEY references are always rewritten unless legacy_alter_table=ON. [quote: Take care to follow the procedure above precisely.] | E-01 `sqlite.org` (U-01, U-05) | P |
| Foreign-key enforcement cannot be switched inside a multi-statement transaction, and trying does not raise an error, so a PRAGMA foreign_keys=OFF issued inside the migration's transaction would silently leave enforcement on. With enforcement on, DROP TABLE runs an implicit DELETE that fires no triggers but does run foreign key actions (e.g. ON DELETE CASCADE) and can fail on an immediate constraint; RENAME TO of a parent table rewrites the child tables' REFERENCES text. [quote: It is not possible to enable or disable foreign key constraints] | E-02 `sqlite.org` (U-02, U-04) | P |
| PRAGMA foreign_keys is a no-op within a transaction and can only change with no pending BEGIN or SAVEPOINT. PRAGMA foreign_key_check (whole database, or one table) returns one row per violation with four columns: child table, child rowid (NULL for WITHOUT ROWID), parent table, and the foreign key's index as in foreign_key_list; an empty result means no violation. With legacy_alter_table=ON (default OFF), RENAME rewrites only the CREATE TABLE, CREATE INDEX and CREATE TRIGGER heads, leaving trigger and view bodies, CHECK constraints and partial-index WHERE clauses unmodified. defer_foreign_keys is switched off at each COMMIT or ROLLBACK. [quote: pragma returns one row output for each foreign key violation.] | E-03 `sqlite.org` (U-02, U-03, U-05) | P |
| DROP TABLE deletes the table and all indices and triggers associated with it, so the migration must recreate them after the rename. With foreign keys enabled it first runs an implicit DELETE FROM after dropping the triggers (so no trigger fires) that does run configured foreign key actions, and an immediate FK violation makes the DROP fail. [quote: dropped from the database schema before the implicit DELETE FROM] | E-04 `sqlite.org` (U-04) | P |
| BEGIN...COMMIT transactions do not nest (BEGIN inside a transaction fails, whether opened by BEGIN or SAVEPOINT); nesting uses SAVEPOINT/RELEASE. CREATE and DROP are write statements that run inside the transaction like INSERT and UPDATE, and on errors such as SQLITE_FULL, SQLITE_IOERR or SQLITE_NOMEM SQLite may undo only the statement or the whole transaction, so the application should issue ROLLBACK itself. [quote: Transactions created using BEGIN...COMMIT do not nest.] | E-05 `sqlite.org` (U-06) | P |
| better-sqlite3 13.0.3: db.transaction(fn) returns a function that BEGINs, commits when fn returns, and rolls back when fn throws (the exception propagates). A transaction function called inside another becomes a SAVEPOINT; an error there rolls back to the savepoint and rethrows, rolling back the outer one unless caught. Raw BEGIN/COMMIT/ROLLBACK must not be mixed into a transaction function, async functions do not work, and SQLite may roll back by itself (RAISE(), ON CONFLICT, SQLITE_FULL, SQLITE_BUSY), checked with db.inTransaction. db.pragma() runs a PRAGMA and returns rows ({simple:true} gives the first value) and is preferred over prepared statements for pragmas. [quote: If an exception is thrown, the transaction will be rolled back (and the exception will propagate as usual).] | E-06 `raw.githubusercontent.com` (U-07) | P |

## Contradictions and how they were resolved

No source contradicts another. All SQLite facts come from sqlite.org (the owner), so preflight warns of one voice; the pages read each other consistently (foreignkeys.html and pragma.html both say foreign_keys cannot change inside a transaction, E-02, E-03; lang_droptable.html and foreignkeys.html both describe the implicit DELETE, E-04, E-02). Two things are version-dependent rather than contradictory:

- **RENAME behaviour.** Before 3.25.0 trigger and view bodies were not rewritten; before 3.26.0 parent FOREIGN KEY references were not rewritten with foreign_keys=OFF (E-01). legacy_alter_table=ON restores the old behaviour (E-03). Trust the current behaviour only after U-08's day-one check proves the bundled SQLite is >= 3.26.0 and legacy_alter_table is 0.
- **"Rollback on error".** SQLite may undo only the failing statement or the whole transaction (E-05); better-sqlite3 rolls back the whole transaction when the wrapped function throws (E-06). They agree once the migration rethrows every error out of the transaction function, which is what better-sqlite3 recommends.

## Known unknowns

- **U-08** - Which SQLite version better-sqlite3 13.0.3 bundles (must be >= 3.26.0 for the rename behaviour relied on)
  - Known so far: Not collected (budget 6 pages).
  - Day-one verification: in the worktree run `node -e "const D=require('better-sqlite3');console.log(new D(':memory:').prepare('select sqlite_version()').pluck().get())"` under Electron's Node ABI and assert >= 3.26.0; also assert `PRAGMA legacy_alter_table` returns 0 at migration start

## Decision

Add `migrateResearchReview(db)` as the `version === 3` step inside the existing `migrate()` in `src/engine/migrations.ts`, which already runs the 12-step frame correctly: `db.pragma('foreign_keys = OFF')` before the transaction (step 1, E-02, E-03), one `db.transaction(...).immediate()` (steps 2 and 11, E-06), `foreign_key_check` before `user_version` (step 10, E-03), and `foreign_keys = ON` in `finally` (step 12). Inside the step, in this order (E-01, E-04):

1. `CREATE TABLE new_research (...)` and `CREATE TABLE new_research_events (... REFERENCES research(id) ON DELETE CASCADE ...)` with the v4 CHECKs and columns. Name the final parent (`research`), not `new_research`.
2. `INSERT INTO new_research (...) SELECT ... FROM research`, then the same for `research_events`, with explicit column lists. No triggers exist on the new tables yet, so `research_events_step` cannot refuse historical rows.
3. `DROP TABLE research_events`, then `DROP TABLE research`. Each drop deletes its own indexes and triggers (E-04). With enforcement off, no `ON DELETE CASCADE` fires (E-02, E-04).
4. `ALTER TABLE new_research RENAME TO research` and `ALTER TABLE new_research_events RENAME TO research_events`. Never rename the old tables away first: sqlite.org calls that order incorrect (E-01).
5. Recreate every index and trigger: `research_project`, `research_active` (with `'packaging'`), `research_single_dispatch`, `research_insert_guard`, `research_update_journaled`, `research_identity_immutable`, `research_events_step`, `research_events_append_only`, the new `research_readiness_digest` and the reviewed-columns immutability trigger. Leave out `research_readiness_reserved`. There are no views on these tables today (step 9 is empty).
6. Assert the result before `user_version`: `SELECT type,name FROM sqlite_schema WHERE tbl_name IN ('research','research_events')` lists exactly the expected indexes and triggers, and row counts match the counts taken before the copy.

Rules for the builder:

- Never issue `PRAGMA foreign_keys` inside the transaction function. It is a silent no-op (E-02, E-03).
- Never mix raw `BEGIN`/`COMMIT` into the transaction function, and never make it `async` (E-06).
- Rethrow every error so the whole migration rolls back (E-05, E-06).
- `foreign_key_check` returns one row per violation; any row aborts (E-03).

Check before writing the copy (from the codebase, not a research fact): the v3 status list already contains `reviewing` and `approved`. A v3 row in either state would fail the new v4 CHECKs on copy, because the review columns are NULL. Count such rows, or prove that v3 can never reach those states (`research_readiness_reserved`), and define their mapping in the spec before coding.

Out of scope: the simpler `writable_schema` procedure on lang_altertable.html, which applies only to removing constraints (E-01), and any change to tables other than `research` and `research_events`.

Tests to write: a v3 fixture database with rows and events migrates to v4 with identical rows, the full trigger and index list, and an empty `foreign_key_check`. An injected failure after the drop (for example a throwing statement in step 5) leaves the database at `user_version` 3 with the v3 schema and all of its rows. `PRAGMA foreign_keys` reads 1 after both outcomes.

## Next steps

1. Run U-08's day-one check (bundled SQLite >= 3.26.0, `legacy_alter_table` = 0) before writing the migration.
2. Hand this file to the builder (phase 2). Re-running `node "$HOME/.agents/research-kit/bin/brief.mjs"`
   redrafts this file while it is unedited; after any edit it refuses without `--force`,
   so your judgements are preserved.

<!-- research-kit:brief-draft body=083f2185f29f8138 inputs=b53166836d72b280 gate=pass -->
