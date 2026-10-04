# Managed inference scheduling boundary

`src/engine/scheduler.ts` implements the Stage D4 ownership queue. It is a source subsystem, not yet the installed app's managed Ollama provider. The main process will own the instance alongside its runtime controller; the source directory does not grant the renderer or utility process permission to release a host lease.

## Admission and completion

`InferenceScheduler.run(task, options)` admits one callback at a time in FIFO order. A callback receives an immutable lease containing an opaque epoch/generation token, an abort signal, `assertCurrent()` and `heartbeat()`. A token is valid only for its exact in-process holder; a copy, a foreign scheduler's token, an absent token and a retired holder cannot authorize work. Host operations must validate the live lease before dispatch. Arbitrary callback code is not sandboxed by this class.

Cancellation or expiry revokes the holder before invoking its abort listeners. Pending results are consumed without being published as a successful current request. The scheduler then calls its trusted `stopRuntime(reason)` owner callback and waits for confirmed cleanup. Normal completion also revokes the signal and stops the runtime before returning the result. This implementation deliberately pays the cost of a cold runtime for each lease; retaining warm models requires a separately verified completion/unload protocol.

If cleanup rejects or exceeds its deadline, the scheduler records `RUNTIME_STOP_UNCONFIRMED`, rejects queued work and keeps admission closed. A later callback result cannot clear this fault. The owner callback must acknowledge actual owned process termination; an aborted HTTP request by itself is insufficient. The production owner must never stop a user-owned Ollama service.

## Limits and time

| Limit | Default | Accepted range |
| --- | --- | --- |
| Waiting entries, excluding active work | 16 | 0–128 |
| Queue wait | 60 seconds | 1 ms–1 hour |
| Inference lease | 5 minutes | 1 ms–1 hour |
| Heartbeat interval | 60 seconds | 1 ms–1 hour |
| Runtime cleanup | 30 seconds | 1 ms–2 minutes |

Heartbeats renew only liveness, never the hard lease deadline. Relative elapsed time comes from the process's monotonic clock. Admission, host-operation assertions, heartbeats, completion and cleanup check elapsed deadlines directly: delayed event-loop timer callbacks cannot revive expired work or accept late success. Queued cancellation and expiry remove the entry without running its callback.

## Maintenance and shutdown

`withRuntimeStopped(task, signal?)` is compatible with `ActivationStore`'s ownership callback. Requesting maintenance closes new inference admission immediately, drains work already ahead of it, confirms runtime cleanup, and then runs one maintenance callback. Multiple accepted maintenance requests hold admission closed until all are settled or removed from the queue.

A maintenance timeout or abort cannot revoke filesystem operations already in progress. Cancellation therefore keeps the gate closed until the maintenance callback settles. The caller supplies bounded, cancellable work, as the artifact downloader/extractor already does. Re-entering this scheduler from inside a holder is unsupported; schedule sequential work after the current call settles.

`shutdown()` closes new admission, rejects waiting work, revokes active inference and waits for confirmed cleanup. An active maintenance callback must settle before shutdown can finish. Unknown cleanup is returned as an error, never converted to an idle state.

## Tests and integration boundary

Behavioral tests cover FIFO exclusion, queue limits, queued cancellation/expiry, immediate revocation with delayed cleanup, stale results, heartbeats, hard deadlines, cleanup faults, maintenance and shutdown. Deliberately blocking a test worker's event loop checks elapsed-time enforcement without fake timers. A real Windows integration test starts a child and grandchild through the production native helper and checks that both are gone when the next holder begins. An ActivationStore integration test holds inference open and verifies zero download effects until its actual scheduler maintenance gate is acquired.

The opt-in `scripts/check-runtime-artifacts.ts` now uses this scheduler around real Ollama startup. It queues a follow-up lease before startup finishes; that lease must be able to bind the old runtime's released port after cleanup. This checks scheduling and runtime lifecycle only. Model generation, backend qualification, quality receipts and the installed setup UI are separate work.

That real-runtime check passed on 27 September 2026 at 12:08 UTC: **99.56 seconds** total, the version endpoint ready after **15.21 seconds**, valid Ollama Inc. Authenticode, verified owned-port ancestry, empty isolated model inventory, confirmed native exit, a queued follow-up lease binding the released port, and temporary runtime removal. The report includes `schedulerFollowupAfterStop: true`; no model inference was performed. The run used the cached, rehashed Ollama 0.34.4 archive. The reusable developer producer saves `.build/managed-artifact-check/verification.json`; this checkpoint is also retained in the sibling outputs directory as `Monnzila-scheduler-runtime-verification.json`.

The later [managed provider checkpoint](managed-provider.md) connects this scheduler to its process controller and authenticated loopback transport in source. The verifier now proves ownership of each established connection by PID, creation time and TCP tuple before sending HTTP bytes, and checks cloud-disabled status. The preceding report remains preserved as historical scheduler evidence; main/setup integration and actual model qualification are still pending.
