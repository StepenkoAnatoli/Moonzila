# B8e: research-switch guard (main route + engine re-check)

Worktree: `/home/user/task5-handoff/wt/p4-b8e`. Read `common.md` beside this file first.

Spec: `docs/specification/research-review-ui.md` section 4 "Never while other work runs" (four numbered steps) and section 5 B8e tests. Read `src/main/index.ts` `handle` (~line 182) and `src/engine/application.ts` `project.policy.update` (~218) and `cancelProject` (~266).

The defect to prevent: main aborts each run's capability signal, revokes its vault context and holds the collector and review supervisors BEFORE forwarding `project.policy.update`; an engine-only guard would refuse after the damage.

Owns: a new main module (for example `src/main/policy-route.ts`) holding the `project.policy.update` and `run.start` routing logic moved out of `index.ts` with its dependencies injected (engine request, the `active` map, vault `revokeContext`, the two supervisors' `hold`, `executingCommands` check for run.start as today); the slimmed wiring in `src/main/index.ts` (only those routes; keep every other route byte-identical in behaviour); the engine re-check in `src/engine/application.ts`; tests (for example `tests/policy-route.test.ts` and an engine test beside the existing application/policy tests); ARCHITECTURE.md rows.

Must hold:
1. A per-project lock in main shared by `project.policy.update` and `run.start` (the run's project comes from its session; find how main/engine know it; if main cannot know the project before forwarding `run.start`, report and propose, do not guess).
2. Under the lock, before any abort/revoke/hold: read the project's current policy and active runs from the engine (existing read methods if they suffice; a new engine control only if not, and then report it as a contract addition). If the update changes only `research` and an active run's mode is not `research`: throw `RUN_ACTIVE`, touching nothing.
3. Otherwise today's behaviour exactly: abort, revoke, hold, forward, release.
4. Engine: in `project.policy.update`, the same rule refuses with `RUN_ACTIVE` before `cancelProject`. An update that changes `inference` keeps today's behaviour (stops every run). A research-only update with only research runs active goes through.

Pre-mortem: checks in the engine only; checks without the lock, so a run starts between check and stop; refuses a change that also changes inference; lets a research-only change through while a Build run is active; changes behaviour of other routes while moving code.

Tests (through the real route module, not the engine alone): refusal leaves the signal not aborted, the vault context not revoked, neither supervisor held, the run running, the policy unchanged; a `run.start` arriving while an update holds the lock is admitted only after it (deterministic ordering with deferred promises, no sleeps); research-only during a review run goes through; an inference change still stops every run; the engine re-check refuses the same change sent to the engine directly.
