# Sources

Every page this project has fetched, and what it was used for. `P` primary/official
carries the design, `S` secondary is context, `L` lead-only is a hint and never proof.

| URL | Type | Title | Retrieved | Used for |
|---|---|---|---|---|
| https://www.sqlite.org/lang_altertable.html | P | ALTER TABLE | 2026-10-03 | U-01, U-04: the 12-step generalized ALTER TABLE procedure, and RENAME TABLE behaviour for triggers, views and legacy_alter_table (3.25/3.26 changes) |
| https://www.sqlite.org/foreignkeys.html | P | SQLite Foreign Key Support | 2026-10-03 | U-02: PRAGMA foreign_keys is a no-op inside a transaction; DROP TABLE and foreign keys |
| https://www.sqlite.org/pragma.html | P | Pragma statements supported by SQLite | 2026-10-03 | U-02, U-03, U-04: foreign_keys, foreign_key_check output, legacy_alter_table, defer_foreign_keys |
| https://www.sqlite.org/lang_droptable.html | P | DROP TABLE | 2026-10-03 | U-04: what DROP TABLE removes (indexes, triggers) and the implicit DELETE it runs |
| https://www.sqlite.org/lang_transaction.html | P | Transaction | 2026-10-03 | U-05: transactional DDL, rollback behaviour on error |
| https://raw.githubusercontent.com/WiseLibs/better-sqlite3/v13.0.3/docs/api.md | P | api-md | 2026-10-03 | U-06: db.transaction() semantics, nested transactions as savepoints, exceptions roll back, db.pragma() |
