# Discovery Contract - How SQLite changes a CHECK constraint: the documented table-rebuild procedure and its rules for foreign keys, triggers, views, indexes and transactions, as better-sqlite3 runs it

Started 2026-10-03. This file is the definition of "enough information to build".
`node "$HOME/.agents/research-kit/bin/preflight.mjs"` reads it and blocks the build until every unknown
below is either `CLOSED` with evidence or `KNOWN-UNKNOWN` with a verification step.

## Build intent

MoonAliza (Electron/TypeScript desktop coding agent, SQLite through better-sqlite3 13.0.3) is about to implement
plan Task 5, the research review (docs/specification/research-review.md, "Schema v4" and "Recovery and restart").
Schema v4 must rebuild the `research` and `research_events` tables, because SQLite cannot change a `CHECK`
constraint in place: the status CHECKs gain `'packaging'`, `research_events.actor` gains `'engine'`, `research` gains
nullable review columns and table checks, and triggers are replaced (`research_readiness_reserved` becomes
`research_readiness_digest`, plus an immutability trigger). Done means a builder knows, from sqlite.org and
better-sqlite3's own documentation, the step order that copies every row, keeps every foreign key and recreates
every index, trigger and view, and how to run it in better-sqlite3 so the migration either fully applies or
fully rolls back, with no silently dropped trigger, broken reference or half-migrated database.

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
| U-01 | The documented procedure for schema changes ALTER TABLE cannot make (the 12 steps), and which order is mandatory | Defines the migration's step order; the wrong order corrupts references | CLOSED | E-01 |
| U-02 | Whether PRAGMA foreign_keys can be changed inside a transaction | Decides where the migration turns enforcement off and on | CLOSED | E-02, E-03 |
| U-03 | What PRAGMA foreign_key_check reports | Decides how the migration proves no reference broke before commit | CLOSED | E-03 |
| U-04 | What DROP TABLE removes (indexes, triggers) and what its implicit DELETE does to foreign keys | Decides which objects must be recreated and why enforcement must be off | CLOSED | E-04, E-02 |
| U-05 | How ALTER TABLE RENAME rewrites triggers, views and foreign keys since 3.25/3.26, and what legacy_alter_table changes | Decides whether renaming new_X into X keeps or breaks other tables' references | CLOSED | E-01, E-03 |
| U-06 | Whether DDL runs inside a transaction and how a transaction rolls back on error; BEGIN nesting | Decides that the whole rebuild is one transaction that either applies or rolls back | CLOSED | E-05 |
| U-07 | better-sqlite3 db.transaction() semantics, nested savepoints, and db.pragma() | Decides how the migration code wraps the steps and where pragmas go | CLOSED | E-06 |
| U-08 | Which SQLite version better-sqlite3 13.0.3 bundles (must be >= 3.26.0 for the rename behaviour relied on) | The rename rules in U-05 differ before 3.26.0 | KNOWN-UNKNOWN | Not collected (budget 6 pages). Day one: in the worktree run `node -e "const D=require('better-sqlite3');console.log(new D(':memory:').prepare('select sqlite_version()').pluck().get())"` under Electron's Node ABI and assert >= 3.26.0; also assert `PRAGMA legacy_alter_table` returns 0 at migration start |

## Questions for the human (maximum 3)

Intent questions only - things no document can answer. Facts never go here; they go in
the table above. If a question's answer is in public documentation, it is a research
task, not a question.

## Already decided

- The rebuild pattern is the one v2 used for `sessions` and `runs` (`migrateChat` in `src/engine/migrations.ts`): create new tables, copy rows, drop the old ones, rename, then create indexes and triggers (spec, "Schema v4").
- Triggers are created after the copy, because `research_events_step` would refuse historical rows (spec).

Locked decisions for this project. Do not revisit these without the human.
