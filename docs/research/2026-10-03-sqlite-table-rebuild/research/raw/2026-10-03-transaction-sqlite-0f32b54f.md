---
url: https://www.sqlite.org/lang_transaction.html
retrieved: 2026-10-03
command: firecrawl scrape https://www.sqlite.org/lang_transaction.html --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Transaction
---
[![SQLite](https://www.sqlite.org/images/sqlite370_banner.svg)](https://www.sqlite.org/index.html)

Small. Fast. Reliable.

Choose any three.

Search DocumentationSearch Changelog

Transaction

# 1\. Transaction Control Syntax

**[begin-stmt:](https://www.sqlite.org/syntax/begin-stmt.html)** hide

BEGINEXCLUSIVETRANSACTIONDEFERREDIMMEDIATE

**[commit-stmt:](https://www.sqlite.org/syntax/commit-stmt.html)** hide

COMMITTRANSACTIONEND

**[rollback-stmt:](https://www.sqlite.org/syntax/rollback-stmt.html)** hide

ROLLBACKTRANSACTIONTOSAVEPOINTsavepoint-name

# 2\. Transactions

No reads or writes occur except within a transaction.
Any command that accesses the database (basically, any SQL command,
except a few [PRAGMA](https://www.sqlite.org/pragma.html#syntax) statements)
will automatically start a transaction if
one is not already in effect. Automatically started transactions
are committed when the last SQL statement finishes.

Transactions can be started manually using the BEGIN
command. Such transactions usually persist until the next
COMMIT or ROLLBACK command. But a transaction will also
ROLLBACK if the database is closed or if an error occurs
and the ROLLBACK conflict resolution algorithm is specified.
See the documentation on the [ON CONFLICT](https://www.sqlite.org/lang_conflict.html)
clause for additional information about the ROLLBACK
conflict resolution algorithm.

END TRANSACTION is an alias for COMMIT.

Transactions created using BEGIN...COMMIT do not nest.
For nested transactions, use the [SAVEPOINT](https://www.sqlite.org/lang_savepoint.html) and [RELEASE](https://www.sqlite.org/lang_savepoint.html) commands.
The "TO SAVEPOINT name" clause of the ROLLBACK command shown
in the syntax diagram above is only applicable to [SAVEPOINT](https://www.sqlite.org/lang_savepoint.html)
transactions. An attempt to invoke the BEGIN command within
a transaction will fail with an error, regardless of whether
the transaction was started by [SAVEPOINT](https://www.sqlite.org/lang_savepoint.html) or a prior BEGIN.
The COMMIT command and the ROLLBACK command without the TO clause
work the same on [SAVEPOINT](https://www.sqlite.org/lang_savepoint.html) transactions as they do with transactions
started by BEGIN.

## 2.1. Read transactions versus write transactions

SQLite supports multiple simultaneous read transactions
coming from separate database connections, possibly in separate
threads or processes, but only one simultaneous write transaction.

A read transaction is used for reading only. A write transaction
allows both reading and writing. A read transaction is started
by a SELECT statement, and a write transaction is started by
statements like CREATE, DELETE, DROP, INSERT, or UPDATE (collectively
"write statements"). If a write statement occurs while
a read transaction is active, then the read transaction is upgraded
to a write transaction if possible. If some other database connection
has already modified the database or is already in the process of
modifying the database, then upgrading to a write transaction is
not possible and the write statement will fail with [SQLITE\_BUSY](https://www.sqlite.org/rescode.html#busy).

While a read transaction is active, any changes to the database that
are implemented by separate database connections will not be seen
by the database connection that started the read transaction. If database
connection X is holding a read transaction, it is possible that some
other database connection Y might change the content of the database
while X's transaction is still open, however X will not be able to see
those changes until after the transaction ends. While its read
transaction is active, X will continue to see an historic snapshot of
the database prior to the changes implemented by Y.

## 2.2. DEFERRED, IMMEDIATE, and EXCLUSIVE transactions

Transactions can be DEFERRED, IMMEDIATE, or EXCLUSIVE.
The default transaction behavior is DEFERRED.

DEFERRED means that the transaction does not actually
start until the database is first accessed. Internally,
the BEGIN DEFERRED statement merely sets a flag on the database
connection that turns off the automatic commit that would normally
occur when the last statement finishes. This causes the transaction
that is automatically started to persist until an explicit
COMMIT or ROLLBACK or until a rollback is provoked by an error
or an ON CONFLICT ROLLBACK clause. If the first statement after
BEGIN DEFERRED is a SELECT, then a read transaction is started.
Subsequent write statements will upgrade the transaction to a
write transaction if possible, or return SQLITE\_BUSY. If the
first statement after BEGIN DEFERRED is a write statement, then
a write transaction is started.

IMMEDIATE causes the database connection to start a new write
immediately, without waiting for a write statement. The
BEGIN IMMEDIATE might fail with [SQLITE\_BUSY](https://www.sqlite.org/rescode.html#busy) if another write
transaction is already active on another database connection.

EXCLUSIVE is similar to IMMEDIATE in that a write transaction
is started immediately. EXCLUSIVE and IMMEDIATE are the same
in [WAL mode](https://www.sqlite.org/wal.html), but in other journaling modes, EXCLUSIVE prevents
other database connections from reading the database while the
transaction is underway.

## 2.3. Implicit versus explicit transactions

An implicit transaction (a transaction that is started automatically,
not a transaction started by BEGIN) is committed automatically when
the last active statement finishes. A statement finishes when its
last cursor closes, which is guaranteed to happen when the
prepared statement is [reset](https://www.sqlite.org/c3ref/reset.html) or
[finalized](https://www.sqlite.org/c3ref/finalize.html). Some statements might "finish"
for the purpose of transaction control prior to being reset or finalized,
but there is no guarantee of this. The only way to ensure that a
statement has "finished" is to invoke [sqlite3\_reset()](https://www.sqlite.org/c3ref/reset.html) or
[sqlite3\_finalize()](https://www.sqlite.org/c3ref/finalize.html) on that statement. An open [sqlite3\_blob](https://www.sqlite.org/c3ref/blob.html) used for
incremental BLOB I/O also counts as an unfinished statement.
The [sqlite3\_blob](https://www.sqlite.org/c3ref/blob.html) finishes when it is [closed](https://www.sqlite.org/c3ref/blob_close.html).

The explicit COMMIT command runs immediately, even if there are
pending [SELECT](https://www.sqlite.org/lang_select.html) statements. However, if there are pending
write operations, the COMMIT command
will fail with an error code [SQLITE\_BUSY](https://www.sqlite.org/rescode.html#busy).

An attempt to execute COMMIT might also result in an [SQLITE\_BUSY](https://www.sqlite.org/rescode.html#busy) return code
if another thread or process has an open read connection.
When COMMIT fails in this
way, the transaction remains active and the COMMIT can be retried later
after the reader has had a chance to clear.

In very old versions of SQLite (before version 3.7.11 - 2012-03-20)
the ROLLBACK will fail with an error code
[SQLITE\_BUSY](https://www.sqlite.org/rescode.html#busy) if there are any pending queries. In more recent
versions of SQLite, the ROLLBACK will proceed and pending statements
will often be aborted, causing them to return an [SQLITE\_ABORT](https://www.sqlite.org/rescode.html#abort) or
[SQLITE\_ABORT\_ROLLBACK](https://www.sqlite.org/rescode.html#abort_rollback) error.
In SQLite version 3.8.8 (2015-01-16) and later,
a pending read will continue functioning
after the ROLLBACK as long as the ROLLBACK does not modify the database
schema.

If [PRAGMA journal\_mode](https://www.sqlite.org/pragma.html#pragma_journal_mode) is set to OFF (thus disabling the rollback journal
file) then the behavior of the ROLLBACK command is undefined.

# 3\. Response To Errors Within A Transaction

If certain kinds of errors occur within a transaction, the
transaction may or may not be rolled back automatically. The
errors that can cause an automatic rollback include:

- [SQLITE\_FULL](https://www.sqlite.org/rescode.html#full): database or disk full

- [SQLITE\_IOERR](https://www.sqlite.org/rescode.html#ioerr): disk I/O error

- [SQLITE\_INTERRUPT](https://www.sqlite.org/rescode.html#interrupt): operation interrupted by [sqlite3\_interrupt()](https://www.sqlite.org/c3ref/interrupt.html)
or similar.

- [SQLITE\_NOMEM](https://www.sqlite.org/rescode.html#nomem): out of memory


For all of these errors, SQLite attempts to undo just the one statement
it was working on and leave changes from prior statements within the
same transaction intact and continue with the transaction. However,
depending on the statement being evaluated and the point at which the
error occurs, it might be necessary for SQLite to rollback and
cancel the entire transaction. An application can tell which
course of action SQLite took by using the
[sqlite3\_get\_autocommit()](https://www.sqlite.org/c3ref/get_autocommit.html) or
[sqlite3\_txn\_state()](https://www.sqlite.org/c3ref/txn_state.html) C-language interfaces.

An application might want to respond to the errors
listed above by explicitly issuing a ROLLBACK command. In that way,
the transaction state will always be the same after one of the errors
above. If the transaction has already been rolled back automatically
by the error response, then the ROLLBACK command will fail with an
error, but no harm is caused by this.

Future versions of SQLite may extend the list of errors which
might cause automatic transaction rollback. Future versions of
SQLite might change the error response. In particular, we may
choose to simplify the interface in future versions of SQLite by
causing the errors above to force an unconditional rollback.

_This page was last updated on 2026-02-18 11:56:50Z_
