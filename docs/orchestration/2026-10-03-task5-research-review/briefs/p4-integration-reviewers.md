# Phase 4 integration review (four roles, after all units are on main-axuse)

Common: commit range `7bc04e6..<head>` on `main-axuse`, each reviewer in its own detached worktree; env as in the unit reviewer briefs. None authored the code. Each states the commit and worktree reviewed and what it did not check. Max 400 words (mutation and invariant: 300).

## Spec reviewer
Sources: `docs/specification/research-review-ui.md` (the contract), `research-review.md`, RUN.md, every `reports/p4-*-reviewer-*.md`. Focus: divergences; codes and messages per the reader outcomes table; status-to-control table; switch ordering (check under the lock before any abort, revoke or hold); docs that misdescribe the code; cross-unit interactions (panel <-> reader reply matching; switch <-> guard; card label <-> run mode).

## Breaker
Focus across units: a policy update racing `run.start` and `research.review.start`; engine restart mid-update (lock released? hold released?); a reader call during packaging/approval transitions and after purge of a retained ZIP; workspace swapped for a junction between lstat and open; a document of exactly 262,144 / 262,145 bytes and multibyte at the edge; secrets at the cut and redaction expansion; stale reader replies after the job changed; Windows semantics for every new filesystem test. Every finding needs a reproduction.

## Mutation auditor
Mutate every guard in the diff (lock acquisition, check-before-abort ordering, research-only predicate, mode predicate, engine re-check, containment checks, nlink/identity check, redact-before-cut order, cap, verified flag, reply matching, button set, label predicate) and run the relevant tests; then, for every new test, remove the guard it names and run it alone. Green = SURVIVED. Tree clean at the end.

## Invariant auditor
Invariants: AGENTS.md "Orchestrator facts" table, plus for this phase: (1) no document text and no secret reach the renderer unredacted - byte-scan IPC results and error payloads in the reader tests for a synthetic vault secret; (2) `verified: true` only for bytes validated in that call; (3) a refused research-only policy change has no side effect (signal, vault context, holds, run, policy); (4) `approved` still only through the kit's gate and fresh validation; (5) the reader never accepts a path from the renderer. HOLDS / VIOLATED / UNPROVEN with evidence.
