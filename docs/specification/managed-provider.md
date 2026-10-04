# Managed Ollama ownership and provider boundary

This source subsystem connects the inference scheduler, Windows process owner and native Ollama adapter. It is not yet an installed setup flow, a model materializer or evidence of coding quality.

## Connection ownership before project content

`MoonAlizaHost.exe --report-start` reports the child PID and full process-creation FILETIME after assigning the suspended child to its kill-on-close Job Object. The child is then resumed. Ordinary command execution retains its existing protocol. The main process parses a bounded startup record; malformed metadata cancels the job.

The loopback transport establishes one IPv4 TCP socket without sending HTTP bytes. A separate read-only native query holds a handle to the expected process, checks its creation time and live state, and looks for the exact server-side established tuple: expected PID, local `127.0.0.1:serverPort` and remote `127.0.0.1:clientPort`. The process must still be alive after the table query. Holding the handle and checking creation time distinguishes process instances even when Windows reuses a PID.

Only after that proof and a fresh lease assertion does the transport supply the already-connected socket to a private HTTP agent. It cannot create a replacement connection and it does not pool sockets. A replacement listener cannot take over an established TCP connection. This closes the gap in checking a listener's owner and then separately opening an ordinary fetch connection.

The transport accepts only GET version/status/tags/ps and POST chat on its fixed origin. It rejects credentials, arbitrary headers, other destinations and management routes. It does not use proxy settings or follow redirects. Requests are limited to 8 MiB, response headers to 16 KiB and response bodies to 4 MiB; compressed responses are rejected. Cancellation closes the socket and HTTP request. A fresh assertion also precedes delivery of the complete response.

## Runtime lifecycle

`ManagedOllamaRuntime.start` accepts an application-supplied installation descriptor. The caller must obtain its identities from trusted, verified release/activation metadata. Renderer or model input must never supply this descriptor. The controller copies and validates it, rejects overlapping runtime/home/model directories, and rechecks the complete runtime file inventory and SHA-256 hashes before launch. It rejects extra files, missing files and linked paths. These are app-owned path checks, not handle-relative protection against a hostile Windows account.

The controller starts only that executable through the production native helper, using a private home/model directory, an ephemeral loopback port, cloud disabled, one parallel request, one loaded model and a queue limit of one. It strips inherited Ollama/provider configuration through the existing environment allowlist. Startup has a 60-second bound, and the process has a five-minute maximum lifetime. The authenticated version endpoint must match the descriptor, and the authenticated status endpoint must confirm cloud disabled.

`stop()` aborts and awaits the actual owned process result. An unknown or failed terminal state permanently faults that controller. The scheduler separately bounds cleanup and keeps admission closed if termination cannot be confirmed. Aborting an HTTP request alone never acknowledges runtime Stop. The controller never attaches to or stops an external user-owned Ollama service.

`ManagedOllamaProvider` owns the controller and scheduler together. It resolves configuration under the current lease, starts the runtime, performs the request and awaits cleanup before delivering success or admitting another holder. Its hard lease is five minutes, heartbeat limit 150 seconds and each HTTP exchange at most 120 seconds. Phase-boundary heartbeats permit bounded slow local generation without extending the hard deadline. Maintenance is available through `withRuntimeStopped`; shutdown closes the queue and confirms cleanup.

## Model requests and limits of observation

The current managed request path supports explicit CPU placement. It checks the selected tag against the pinned model-manifest digest, preloads with empty messages, explicit context/output limits, `num_gpu: 0` and `keep_alive: -1`, then verifies one loaded model with the expected name, digest, context and quantization and zero reported VRAM allocation. Only then does it send project messages and tool declarations through the existing canonical Ollama adapter. Tool calls and results preserve their canonical identities and argument validation.

Managed requests also disable silent history truncation and context shifting; an over-budget prompt must fail instead of silently discarding earlier context. After the response, another loaded-model check must pass before any result or tool call reaches the broker. All work ends with owned-process cleanup, so keeping the model loaded during the request does not leave a warm runtime behind.

Ollama's running-model API does not attest an exact GPU backend or adapter. This implementation therefore exposes no managed GPU selection and creates no backend, lab or machine qualification receipt. `num_gpu: 0` plus zero reported VRAM is a placement check, not a benchmark or an attestation of every loaded library. The main resolver still needs validated model storage, real qualification evidence and resource admission before this subsystem can be enabled in the installed application.

## Activation lock order

`ActivationStore.activate` acquires the stopped-runtime maintenance lease before its store lock. Inference may read active metadata while it holds a runtime lease. Holding the store lock while waiting for that inference to finish would deadlock; a regression test exercises these overlapping operations using the real scheduler.

## Evidence and remaining integration

Tests use real job-owned Windows processes and TCP connections to check correct/wrong process instances, stale leases with zero HTTP bytes, unsupported destinations and headers, redirect rejection, response limits, cancellation, runtime file tampering, version/cloud/model/configuration mismatches and cleanup before queued reuse. Controlled native-Ollama protocol fixtures exercise canonical tools. They are explicitly not model quality evidence.

The opt-in `node --import tsx scripts/check-runtime-artifacts.ts` uses this production controller and transport with real pinned Ollama 0.34.4. It rehashes the archive, freshly extracts the runtime, checks Ollama Inc. Authenticode, rechecks the file inventory, verifies authenticated version/cloud status and empty private model storage, then proves Stop and port reuse by a queued lease. Its report records `ownershipMethod: established-tuple-pid-creation-time`, and explicitly records that no model inference or qualification was performed.

That real-runtime run passed on 27 September 2026 (started at 18:15:50 UTC) in **131.73 seconds**; revalidation and startup readiness took **32.36 seconds**. All 82 extracted files, 1,929,981,750 expanded bytes, the Ollama Inc. signature, connected socket proof, cloud-disabled status, empty private inventory, native exit, queued port reuse and scratch removal passed. The report is retained at `outputs/Monnzila-managed-provider-runtime-verification.json` in the parent workspace. The first attempt cleaned up successfully but failed readiness because socket cancellation lost its abort classification. Regression tests reproduced that failure; the transport now retains the abort classification and bounded startup retries passed against the real runtime.

Remaining work includes materializing the verified model blobs into the private Ollama store, lab/machine qualification and resource selection, production catalogue signing inputs, main/IPC/setup integration, reference-aware removal and relocation, GPU attestation and a newly packaged desktop verification. The installed 0.5 app remains a separate historical checkpoint.

Primary implementation references, captured for the research gate on 27 September 2026: [Ollama v0.34.4 API types](https://github.com/ollama/ollama/blob/v0.34.4/api/types.go), [Ollama server routes](https://github.com/ollama/ollama/blob/v0.34.4/server/routes.go), [Node 24 HTTP agent connection contract](https://nodejs.org/docs/latest-v24.x/api/http.html#agentcreateconnectionoptions-callback), [Windows TCP owner tables](https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable), and [Windows process creation time](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes). Research preflight passed with zero blockers and eight existing warnings; research does not replace the runtime tests.
