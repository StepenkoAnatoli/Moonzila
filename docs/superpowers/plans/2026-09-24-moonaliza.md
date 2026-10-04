# Monnzila Implementation Plan

**Goal:** implement the full Windows desktop coding-agent product described in the supplied Rework specification, renamed Monnzila.

**Architecture:** Electron main owns OS/credential/network capabilities; a utility engine owns durable application state, policy and the agent loop. React communicates through strict IPC. A C++17 Windows helper supervises owned commands and collects hardware facts. Providers remain interchangeable.

**Tech stack:** Windows x64, Electron, React, TypeScript, SQLite, Zod, esbuild, Vitest, Playwright, C++17 Windows APIs, NSIS, managed Ollama.

**Spec:** the supplied 2026-09-24 Rework plan, preserved in `docs/specification/source-plan.md`; incorporated corrections in `docs/specification/decisions.md`. User authorized the complete project and implementation, superseding a proposed smaller product scope.

## Global constraints

One agent loop and permission broker. Local-only never silently uses cloud inference. Imported instructions grant no permissions. Journal identities precede mutations; ambiguous effects are reconciled rather than replayed. Approvals bind input hashes, project identity, trust/policy revisions and relevant file versions. Credential values never enter renderer retrieval APIs, transcripts or logs. Only owned processes may be killed. Actual hardware and installed-app evidence are necessary for qualification. Never fabricate signing identities, benchmarks or release inputs.

## Execution

Execute source tasks A1–A5, B1–B5, C1–C5, D1–D5, E1–E5 and F1–F5 through the same dependency order. Components can be developed concurrently only behind agreed interfaces. The full product is the target; working checkpoints are integration controls.

- [ ] A: reproducible scaffold, strict shared contracts, persistence, vault, shell/engine.
- [ ] B: policy, paths, file journal/undo, owned commands, recovery.
- [ ] C: provider adapters, durable loop/context, skills/teams, missions, workbench.
- [ ] D: hardware, verified artifacts, qualification/selection, scheduler/runtime, model UI.
- [ ] E: kit provisioning, job reconciliation, artifact integrity, evidence review, research UI.
- [ ] F: updates/migrations, diagnostics, installer, actual qualification, evidence gate.

## Current source checkpoint

28 September: 364 tests across 30 files, typecheck, lint and build pass. Verified model materialization and deterministic local selection join the existing managed provider/scheduler. Real pinned Qwen3 0.6B storage/inventory and owned Stop passed; inference quality remains unqualified. The user authorized pushing the full implementation so far and opening a PR. Installed version 0.5 remains separate. See `docs/development-status.md` for exact evidence and remaining scope.

## First concurrent review units

Checkpoint 2026-09-26: v0.3 adds reviewed Build commands and bounded Git status/diff/log to the existing file tools, Ollama/OpenAI-compatible tool loop, approval/undo UI, cancellation and budgets. 186 tests and three packaged desktop workflows pass. Full B/C remain open for quotas, recovery/path hardening, wider Git qualification, streaming/context and remaining product features; D/E/F are still in scope. See `docs/development-status.md` for evidence and limits.

1. `src/shared`: strict schemas and public DTOs, consumed by engine/main/renderer. Test unknown fields, unauthorized response fields, malformed events, identity mismatches and bounds.
2. `src/engine/store.ts`: SQLite entities, request deduplication, transactions, event replay and history. Test reopen, lost replies, conflicts, transaction rollback and project isolation.
3. `native/` and `src/tools/commands.ts`: actual process ownership; test child/grandchild Stop, crash, output cap and unrelated-process survival.
4. Root integration: package/build, main/preload/engine, vault/project tickets, renderer, transport. Test actual packaged SQLite load and sender/epoch validation before model tools are exposed.

Each implementation unit starts with its failing behavioral test. Run the test, implement, re-run, and integrate before marking it complete. Source-plan helper snippets are illustrative and cannot satisfy the subsystem acceptance criteria alone.
