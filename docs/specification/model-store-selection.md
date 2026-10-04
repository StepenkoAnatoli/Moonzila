# Verified model storage and local selection

This source stage connects model materialization to the activation store and implements deterministic local eligibility. It does not issue qualification receipts or enable automatic local inference in the installed 0.5 application.

## Model storage

`materializeModels` consumes pinned manifest and blob identities from a verified activation. It creates an absent private staging destination, validates exact manifest coverage, accepts local GGUF configurations, and copies each distinct file with streamed SHA-256 and size verification. The complete manifest bytes are preserved: Ollama identifies the manifest by the hash of those bytes. Shared blobs occupy one copy per activation store; no hardlinks connect the mutable download cache to the installed files.

The model name is `moonaliza/<manifest-sha256>:verified`. Its authoritative files are `manifests/registry.ollama.ai/moonaliza/<manifest-sha256>/verified` and `blobs/sha256-<blob-sha256>`. File identities, supported media types, local configuration, directory inventory and regular-file/link restrictions are checked again on reopening. The activation pointer remains the publication boundary. A failed or cancelled copy removes its own partial store and preserves the previous activation and download cache. Lab receipt quantization must equal the installed configuration's `file_type`.

Ollama's `metadata/` directory is derived cache data. The pinned runtime can load its JSON metadata without validating it against a fresh blob hash. Moonzila validates all cache paths first and clears bounded regular cache files before launching the owned runtime; it never treats metadata as identity or qualification evidence. Stop waits for startup preparation to settle so an earlier preparation cannot keep deleting cache files after the next holder starts.

The implementation supports local GGUF manifests at this stage. Other formats, remote model configuration, extra authoritative files, ambiguous descriptors, hardlinks and link directories are rejected. App-owned path checks do not replace the planned native handle-relative defense against hostile same-account filesystem changes. Activation stores and the download cache currently retain their data conservatively; reference-aware collection and relocation remain separate work.

Pinned primary sources, captured as E-26–E-30 in the sibling research corpus:

- [Ollama 0.34.4 manifest parsing and digest](https://raw.githubusercontent.com/ollama/ollama/v0.34.4/manifest/manifest.go)
- [Manifest and blob paths](https://raw.githubusercontent.com/ollama/ollama/v0.34.4/manifest/paths.go)
- [Model naming](https://raw.githubusercontent.com/ollama/ollama/v0.34.4/types/model/name.go)
- [Local and remote model configuration](https://raw.githubusercontent.com/ollama/ollama/v0.34.4/types/model/config.go)
- [Derived GGUF metadata cache](https://raw.githubusercontent.com/ollama/ollama/v0.34.4/server/gguf_metadata.go)

## Selection policy

`planProbeCandidates` and `selectLocal` are pure policy functions. Their caller must obtain candidates from verified activation metadata, retain actual lab and machine evidence, and measure hardware using the exact runtime archive digest as `runtimeIdentity`. Parsing a receipt does not establish its provenance. Recheck the active set and current resources under the inference lease immediately before use.

A probe candidate requires a matching `moonaliza-coding-v1` lab receipt, quality at least 0.85, successful tool cases, zero unauthorized effects, zero writes after cancellation, a non-future qualification date, a supported backend and enough context. A machine receipt additionally binds the full configuration, lab receipt, activation, hardware fingerprint and actual adapters. Its observed backend must match. Machine evidence must be no more than 30 days old, no earlier than the lab qualification and not in the future. This 30-day freshness interval is an initial Moonzila policy; it is not a runtime guarantee.

Eligible machine metrics are load at most 90 seconds, first token at most 30 seconds, throughput at least four tokens/second, quality at least 0.85, tool success and positive measured RAM demand. Current host memory must accommodate that demand plus `max(2 GiB, ceil(15% of physical RAM))`. CPU receipts have no GPU adapters and zero or unknown VRAM demand. GPU receipts require unique matching adapters, known current free VRAM and positive measured VRAM demand. As current receipts contain total VRAM demand without placement per adapter, every selected adapter must individually have that headroom. Capacities are never summed or inferred from shared system memory. Production GPU attestation is still required before a GPU backend may enter `supportedBackends`.

Selection considers the newest matching machine measurement. A newer failed measurement supersedes an older success; conflicting measurements at the same instant cannot select a model. Among eligible receipts within two percentage points of the best measured quality, prefer an installed configuration, then higher quality, lower first-token latency, higher throughput, lower load latency and a stable ID tie-break. A selected configuration that is absent reports `installationRequired: true`; callers must install and revalidate it before use.

Without eligible machine evidence, probe planning prefers installed configurations, then smaller artifacts, then lab quality and ID. For CPU probes, artifact bytes must fit current host headroom as a conservative admission filter. This is not a peak-memory estimate; only an actual monitored probe can establish required RAM. GPU probes require known free memory on the expected adapters. The qualification runner must still monitor resource limits and safely stop a failing probe, then try a smaller qualified candidate. Missing hardware, insufficient reserve and no eligible candidates remain explicit local unavailability. This module has no cloud fallback or privacy-policy mutation.

## Reproducing the storage check

Run `node --import tsx scripts/check-model-store.ts` on Windows x64 after building the native helper. This opt-in check uses the production downloader, materializer, owned runtime and connection verification. It downloads roughly 523 MB of pinned Qwen3 0.6B artifacts when uncached. It can reuse the previously extracted, fully reverified 0.34.4 runtime; otherwise it obtains the pinned archive and extracts a temporary runtime. The extracted-file identity list itself has a fixed digest in the verifier.

The check compares exact manifest bytes and the runtime's model name, digest, quantization and size. It verifies no model is loaded, confirmed owned Stop, queued port reuse, post-Stop store integrity and removal of its temporary store. Cached downloads remain for later work. It saves `.build/managed-artifact-check/model-store-verification.json`. It does not load model weights for inference, create a lab/machine receipt, change the active production catalogue, or change a project's cloud policy.

The public registry served this manifest by tag but returned 404 for the observed manifest-digest route. The verifier therefore fetches `qwen3:0.6b` while requiring its pinned 858-byte SHA-256 identity. Any future tag change fails verification rather than changing the tested model silently. The exact blob redirect hostname is separately allowlisted and no provider credentials are sent.

Real lab qualification and monitored machine probes, production trust inputs, main/engine/setup integration, GPU attestation and storage lifecycle remain required. The user-reported privacy/provider guidance and context-budget usability also remain scheduled in Stage C; these storage changes do not resolve those messages.

## Recorded real check, 28 September 2026

The production path passed in **86.09 seconds**, including uncached model transfers. The exact manifest SHA-256 is `7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435` (858 bytes); its five distinct blobs total **522,653,767 bytes**. Ollama reported the expected private model name, the identical manifest digest, `gguf` format and `Q4_K_M` quantization. All 82 runtime files were reverified and Windows reported valid Ollama Inc. Authenticode. Runtime revalidation/readiness took **26.29 seconds**; this is not model load latency.

Cloud-disabled status, connected-socket ownership, empty loaded-model inventory, owned process exit, follow-up lease port reuse, post-Stop model-store integrity and temporary directory removal passed. The original cached model artifacts remain in ignored development storage. No qualification or activation was performed. The hardware measurement reported **1,235,644,416 bytes** available host RAM (about 1.15 GiB), below the 2 GiB reserve; free GPU memory remained unknown. No model inference was attempted.

The initial verifier attempt stopped on HTTP 404 for the manifest-digest URL, before model copying or runtime launch, and removed its scratch directory. Its failure report is retained separately. Fetching the supported tag route with the same pinned digest/size made the completed check reproducible without weakening verification.

The [retained successful runtime report](../evidence/model-store-runtime.json) records the artifact identities, measured hardware, checks and cleanup results. It is a developer verification report, not a model qualification receipt.
