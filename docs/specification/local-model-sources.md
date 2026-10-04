# Local-model readiness: primary sources and implementation boundary

Reviewed 2026-09-26. This note supports the approved Stage D implementation. It records external facts separately from measurements on this PC and from product qualification. Research collection is retained in the sibling `work/research` workspace; see its `plan.local-model.json`, `EVIDENCE.md`, cached pages and hash-chained fetch ledger. No credentials belong in this document or the repository.

## Current implementation boundary

Installed version 0.5 connects D1 hardware inspection and explicit local-runtime readiness. The application reports measured host RAM, adapter capacities, unavailable telemetry, runtime reachability, discovered model identities and qualification status. A successful connection or model listing does not establish coding quality, backend identity, memory fit or cancellation correctness.

D2's source backend now implements trusted signed activation metadata validation, pinned runtime and model/blob identities, streaming verification, bounded archive extraction, interrupted-download recovery and atomic activation. Its real portable Ollama archive and owned startup/Stop were checked on 27 September; see [managed artifact evidence](managed-artifacts.md). Production signing inputs, setup UI and reference-aware storage management remain open. D3 needs actual retained lab-quality evidence and separate machine receipts. D4's [scheduler core](managed-scheduler.md) now implements inference lease fencing and maintenance, with native process and real-runtime queue checks; production managed-provider integration remains. No download or automatic candidate selection stands in for these requirements.

## Windows hardware facts

- `GlobalMemoryStatusEx` reports physical and virtual memory information. Its available-memory result is a changing observation, not a permanent capacity guarantee. Failures must remain explicit. [Microsoft API reference](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex)
- DXGI adapter descriptions expose vendor/device identity, an adapter LUID and `SIZE_T` dedicated/shared memory capacities. Preserve full-width values; shared capacity is not independent dedicated VRAM. [DXGI_ADAPTER_DESC](https://learn.microsoft.com/en-us/windows/win32/api/dxgi/ns-dxgi-dxgi_adapter_desc)
- `IDXGIAdapter3::QueryVideoMemoryInfo` reports the calling process's budget and usage. It must not be presented as global free VRAM. [Microsoft process-budget reference](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/nf-dxgi1_4-idxgiadapter3-queryvideomemoryinfo)
- NVML provides device UUID/PCI identity and memory queries, including unsupported/error results. Match observations to the physical adapter rather than enumeration order; absent, unsupported or ambiguous observations remain unknown. NVIDIA documents Windows WDDM and operating-system memory accounting limitations. [NVIDIA device-query reference](https://docs.nvidia.com/deploy/nvml-api/api/group__nvmlDeviceQueries.html)

Implementation decisions: bound native helper execution and output; exclude software adapters; validate integer precision; retain unknown free VRAM as `null`; include CPU class, adapters, driver and runtime identities in qualification fingerprints, while excluding fluctuating free-memory values. Hardware inspection failure must not prevent API profile use.

## Ollama integration facts

Ollama documents a standalone Windows amd64 ZIP for embedding/service use, with separate ROCm and MLX packages when applicable. Its Windows requirements start at Windows 10 22H2. Inspect the exact pinned archive's backend inventory before claiming support. [Official Windows integration instructions](https://docs.ollama.com/windows)

The official release page resolved to v0.34.4 during this review. The expanded asset list reports `ollama-windows-amd64.zip` at approximately 1.36 GB and SHA-256 `535193f38f3344e5b08f5d1c171c31ce11aa17f0124ff69ae26d8ec7fe06fa62`; the separate ROCm ZIP is approximately 244 MB. This records upstream published identity; no archive was downloaded or inspected during this research, and an upstream checksum is not Moonzila signed activation metadata. [Pinned release](https://github.com/ollama/ollama/releases/tag/v0.34.4), [official asset identities](https://github.com/ollama/ollama/releases/expanded_assets/v0.34.4)

Pinned source confirms environment controls for host binding, model directory, cloud disablement, concurrency, loaded-model count, queue and keep-alive. The managed runtime design uses loopback on an owned port, an owned model directory, `OLLAMA_NO_CLOUD=1`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, and `OLLAMA_KEEP_ALIVE=0`, plus bounded queueing and explicit request context/output limits. Version 0.34.4 enables Vulkan by default when discovered; package contents and actual backend use still need inspection. [Pinned environment implementation](https://raw.githubusercontent.com/ollama/ollama/v0.34.4/envconfig/config.go)

`GET /api/tags` lists local model identities and details. `GET /api/ps` reports loaded models, including digest, size, VRAM size and context length. These responses support readiness display; `size_vram` alone does not prove CUDA versus Vulkan or identify the actual adapter. [Model inventory](https://docs.ollama.com/api/tags), [running models](https://docs.ollama.com/api/ps)

The native chat API supports explicit tools, streaming, model options, keep-alive and thinking control. Thinking choices are model-specific and must be discovered/tested rather than assumed. Qualification must count terminal completion correctly and retain actual response/performance evidence. [Native chat API](https://docs.ollama.com/api/chat)

## Candidate investigation for an 8 GiB Windows PC

The official Qwen3 tag list reports these candidate download sizes: `0.6b-q4_K_M` about 523 MB, `1.7b-q4_K_M` about 1.4 GB, and `4b-instruct-2507-q4_K_M` about 2.5 GB. These are possible investigation candidates, not qualified recommendations. A model's download size is not its peak inference memory. [Official Qwen3 catalogue](https://ollama.com/library/qwen3/tags)

An initial experimental sequence can try the smallest candidate for load/protocol behavior, then the 1.7B candidate for actual quality. A larger candidate is conditional on measured headroom. Use an explicit 2K–4K context and one request at a time initially. Preserve the plan's host reserve of the larger of 2 GiB or 15% of physical RAM. This sequence is an engineering proposal, not an external source claim or proof that any candidate will meet the product threshold.

The approved qualification targets remain: all 20 structured tool cases pass; ten coding fixtures repeated three times achieve at least 85% verified completion; no unauthorized side effects or writes after cancellation; load at most 90 seconds; first token at most 30 seconds; at least four generated tokens per second; no OOM; and the host reserve remains available. Only actual retained evidence can establish these results.

## Ownership, integrity and remaining unknowns

- User-owned runtimes are inspected or used through an explicit profile; Moonzila must not kill, upgrade or remove their models as part of managed lifecycle actions.
- Managed runtime processes need ownership through the existing Windows Job Object supervisor, a verified dedicated loopback endpoint and an owned model directory. A listening port alone is not ownership proof.
- HTTP cancellation is not sufficient proof that inference stopped. Keep the lease fenced until terminal completion/unload is confirmed or the owned process tree has exited; never use a lease heartbeat timeout to authorize overlapping inference.
- Stream artifact hashing; pin manifest and blob identities instead of relying on mutable pull tags. Validate resumed-range identity, actual destination disk space, archive paths/links/expansion and atomic activation recovery. Preserve the previous working activation on failure.
- This research did not measure this PC's GPU, free memory, local-model quality or throughput. It did not inspect runtime archive contents, validate Authenticode signatures, or establish model licensing for redistribution. Those require later artifact and machine qualification.
- If no candidate passes, report local coding unavailability and keep API operation available. Do not silently lower quality thresholds or fall back to cloud inference.

Anonymous GitHub release API access was rate-limited during research. Official GitHub release HTML provided the pinned asset facts; no credential was required to complete this review.

The documentation lookup for `/api/version` returned a page-not-found capture. The pinned server routes instead confirm `GET /api/version` with a JSON version string and `GET /api/tags` for inventory. [Ollama v0.34.4 server routes](https://raw.githubusercontent.com/ollama/ollama/v0.34.4/server/routes.go). Collector evidence E-19 is the authoritative capture; E-18 records the failed documentation lookup.

## Measured Windows integration, 2026-09-27

The actual native probe reported 8,515,145,728 bytes physical RAM, Intel Pentium 4405U, four logical processors and Intel HD Graphics 510. DXGI reported 134,217,728 bytes dedicated adapter memory and driver 31.0.101.2111. Free GPU memory remains null; no shared-RAM estimate is substituted. Available host RAM varied around 1.0-1.2 GiB during development, below the plan's 2 GiB system reserve. These observations do not qualify any model.

An initial restricted DXGI load failed with Windows error 577 despite the System32 DLL's valid Authenticode status. The Windows system library now loads only from its absolute, non-reparse System32 path with restricted DLL search; third-party NVML retains signed-target enforcement. This fixed hardware discovery on this machine. NVML exact adapter mapping remains unavailable and therefore cannot provide free-VRAM claims in this checkpoint.
