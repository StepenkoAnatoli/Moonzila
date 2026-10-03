---
url: https://www.sqlite.org/lang_droptable.html
retrieved: 2026-10-03
command: firecrawl scrape https://www.sqlite.org/lang_droptable.html --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: DROP TABLE
---
[![SQLite](https://www.sqlite.org/images/sqlite370_banner.svg)](https://www.sqlite.org/index.html)

Small. Fast. Reliable.

Choose any three.

Search DocumentationSearch Changelog

DROP TABLE

**[drop-table-stmt:](https://www.sqlite.org/syntax/drop-table-stmt.html)** hide

DROPTABLEIFEXISTSschema-name.table-name

The DROP TABLE statement removes a table added with the
[CREATE TABLE](https://www.sqlite.org/lang_createtable.html) statement. The name specified is the
table name. The dropped table is completely removed from the database
schema and the disk file. The table can not be recovered.
All indices and triggers
associated with the table are also deleted.

The optional IF EXISTS clause suppresses the error that would normally
result if the table does not exist.

If [foreign key constraints](https://www.sqlite.org/foreignkeys.html) are enabled, a DROP TABLE command performs an
implicit [DELETE FROM](https://www.sqlite.org/lang_delete.html) command before removing the
table from the database schema. Any triggers attached to the table are
dropped from the database schema before the implicit DELETE FROM
is executed, so this cannot cause any triggers to fire. By contrast, an
implicit DELETE FROM does cause any configured
[foreign key actions](https://www.sqlite.org/foreignkeys.html#fk_actions) to take place.
If the implicit DELETE FROM executed
as part of a DROP TABLE command violates any immediate foreign key constraints,
an error is returned and the table is not dropped. If
the implicit DELETE FROM causes any
deferred foreign key constraints to be violated, and the violations still
exist when the transaction is committed, an error is returned at the time
of commit.
