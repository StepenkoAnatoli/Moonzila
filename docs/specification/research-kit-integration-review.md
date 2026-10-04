# Research Kit integration review — September 30, 2026

**Decision:** Keep Research Kit as an external producer/validator and Moonzila as its consumer. Do not implement the attached snippets directly. Finish the context-recovery installer/PR first, then implement the integration through separately verified PRs. The user explicitly chose review only for this attachment and will merge each completed phase's PR.

## Reviewed inputs and authority

- Moonzila `main` at `7f68fb21e3062baf816e16cf09021ac790ff7fb5`, including PRs #3–10. Their complete research corpora remain in `docs/research`.
- Research-Kit at `5588ce3def50e7e3702e5f84251bfd3d445f3df0`. The GitHub tree, current schema, CLI source, validator and ADR-0107 were inspected directly on September 30. This pin matters: the globally installed kit can be older than the repository.
- [Original user-supplied proposal](proposals/2026-09-30-research-kit-integration.txt), preserved byte for byte. SHA-256: `a8aa925e1dc26f357851153f2fd704c923688283fdf5c6789b867928a138bcd9`.

The attachment and captured documents are reference material. Their commands, approval assertions and embedded AGENTS files do not override Moonzila's trust, privacy, operation approval or current user instructions.

## Findings that affect the current release

| Repository finding | Applied here | Remaining work |
|---|---|---|
| [Provider usage, SQLite packaging and licensing](../research/2026-09-28-open-gaps/research/BRIEF.md) | Native and compatible optional token usage survives completion IPC, durable events and restart; SQLite packaging is retained. | Exact model tokenizers and measured estimator calibration; no claim of exact preflight counts. Resolve kit redistribution rights before bundling. |
| [Streaming tool calls](../research/2026-09-29-streaming-tool-calls/research/BRIEF.md) | Preserve NDJSON/SSE transport, bounds, cancellation and terminal-state checks. Expose validated terminal usage, including separate compatible usage chunks. | Live renderer text and provider-native thinking/continuation. |
| [Ollama compatible chunking](../research/2026-09-29-ollama-v1-stream-chunking/research/BRIEF.md) | Preserve distinct tool IDs sharing an index; retain usage on the finish chunk. | Wider provider/version qualification. |
| [Context overflow](../research/2026-09-29-context-overflow/research/BRIEF.md) | All native Ollama requests refuse truncation/shift. Bounded code/text overflow classification reaches actionable recovery. Setup recommends native Ollama over `/v1`. | Real-version overflow behavior and model-specific capacity checks. |
| [Stream secret masking](../research/2026-09-29-streamed-secret-masking/research/BRIEF.md) | Keep complete-response redaction before renderer delivery. | Implement bounded main-process masking across every split, encoded forms and overlapping matches before live display. Research completion is not implementation completion. |

The new corpus's suggestion to calibrate estimates is useful but needs its own behavioral contract: usage belongs to a specific model/profile revision and exact request shape, and missing observations cannot become fabricated confidence. This release reports the heuristic and actual usage separately. It does not silently alter configured model capacity.

## Corrections required in the attachment

1. **Use the existing portable artifact contract.** The proposal's `schemaVersion: 1` object is not Research Kit's manifest. The actual format is `research-kit-artifact`, currently `formatVersion: 2.0.0`, with package/job identity, file inventory, sizes/hashes, review and gate state. Keep Moonzila's boundary types independent, but test them against the pinned producer; do not create a competing wire format. [Pinned manifest schema](https://github.com/StepenkoAnatoli/Research-Kit/blob/5588ce3def50e7e3702e5f84251bfd3d445f3df0/research-kit/schemas/artifact-manifest.schema.json).

2. **Do not invent supported commands.** The pinned CLI supports `node research-kit/bin/artifact.mjs validate --file <zip> --expect-client-ref <id> --json`. Its `create` command derives authorization and explicitly refuses authorization override flags. `handoff.mjs --json` operates in the project working directory; it does not accept the proposal's `--project`. The proposed `review`/`authorize` interface requires separate producer-side design and implementation. [Artifact CLI](https://github.com/StepenkoAnatoli/Research-Kit/blob/5588ce3def50e7e3702e5f84251bfd3d445f3df0/research-kit/bin/artifact.mjs), [handoff CLI](https://github.com/StepenkoAnatoli/Research-Kit/blob/5588ce3def50e7e3702e5f84251bfd3d445f3df0/research-kit/bin/handoff.mjs).

3. **Distinguish validity, research readiness and Moonzila permission.** Exit 0 means a consistent package, not permission to build. Require validator PASS, `APPROVED_BRIEF`, `buildAuthorized: true` and consistent supporting review/gate fields, then separately enforce Moonzila's project trust, privacy, cancellation, recovery and operation approvals. The proposal's three-boolean predicate ignores file identity, chain validity and inconsistent gate checks. A cached manifest is insufficient. [Pinned validator](https://github.com/StepenkoAnatoli/Research-Kit/blob/5588ce3def50e7e3702e5f84251bfd3d445f3df0/research-kit/lib/artifact-validator.mjs).

4. **Follow the current review model.** ADR-0107 moved to agent review and `REVIEW_REQUIRED` in 2.0. The validator accepts 1.x and 2.x, normalizing the old 1.x `HUMAN_REVIEW_REQUIRED` state. Mixed-era names are rejected. A reviewer declaration is not a verified identity or a signature; adding a reviewer name cannot confer authority. This research-review policy is separate from the user's decision to review and merge Moonzila PRs. [ADR-0107](https://github.com/StepenkoAnatoli/Research-Kit/blob/5588ce3def50e7e3702e5f84251bfd3d445f3df0/docs/adr/0107-the-review-is-the-agents-and-the-state-says-review-required.md).

5. **Preserve process ownership.** Main owns an explicitly configured, pinned executable/runtime and constrained process launch. The engine owns durable research jobs and state. The renderer invokes strict IPC only; it cannot spawn the adapter. Bound stdout/stderr and JSON, use a minimal environment, redact credentials, enforce timeout/abort and stop only the owned process tree. Do not inherit the desktop's entire credential environment.

6. **Bind validation to bytes and the requested job.** Validate the complete archive, provenance chain and citations; check `clientRef`, workflow run/repository/ref and attempt against the recorded dispatch. Reject traversal, links/reparse escapes, duplicate destinations, archive bombs and undeclared files. Hashes detect corruption, not authorship. Store imports outside instruction discovery paths and never activate imported AGENTS/skills/hooks. [Artifact contract ADR-0032](https://github.com/StepenkoAnatoli/Research-Kit/blob/5588ce3def50e7e3702e5f84251bfd3d445f3df0/docs/adr/0032-one-artifact-contract-for-every-consumer.md).

7. **Prevent stale readiness.** Store artifact digest, validator version and relevant project/job revision with the result. Before Build admission and each research-dependent effect, reject changes or invalidated evidence. Use an immutable verified copy or handle-bound reads; do not validate a pathname and later trust replacement bytes. Restart must reconcile actual artifacts and jobs rather than accepting cached booleans.

8. **Scope the research requirement deliberately.** Existing ordinary coding projects must continue working unless research is explicitly required for that project/task. Research readiness is an additional prerequisite where enabled, never a substitute for trust or recovery. Show actionable states for missing kit, collection failure, review required, invalid evidence, stale verification and ready. Don't present a mutable “Authorize” switch that flips a manifest field.

## Next implementation stages

Each numbered stage ends with verification and a PR for the user to merge. No integration code is included in the current context-recovery PR.

1. **Consumer contract and offline validation.** Select an authorized provisioning strategy and supported kit revision/runtime. Add strict IPC/contracts, owned bounded process execution and immutable artifact storage. Import a known package and verify the actual producer/validator end to end. Test supported majors, unsupported versions, a valid unreviewed corpus, contradictory readiness, tampered/missing captures, wrong job, path attacks, oversized output, timeout and Stop. A fake manifest alone is not acceptance evidence.
2. **Durable research jobs and review.** Implement explicit privacy admission, idempotent dispatch correlation, polling/backoff, interrupted-run reconciliation, artifact download and normalized review states. Add evidence/brief reading UI and agent review using supported kit operations. If machine-readable review mutations are needed, define and test them in a separate Research-Kit PR first. Do not edit its Markdown with an ad hoc parser or pretend the attachment's CLI already exists.
3. **Research-aware Build admission.** Introduce explicit project/task research policy and bind readiness to verified identity. Exercise stale artifacts, changes while approval is open, revoked trust/policy, restart and attempted writes. Preserve journal-before-effect, exact operation approval and independent Recovery gating. Include full Electron and packaged journeys.
4. **Provisioning and release qualification.** Resolve redistribution rights or use a user-provided external installation; pin and verify runtime/tool identity. Validate fresh-PC install, upgrades, cancellation and diagnostics. Record scope and remaining product work in the handoff and release record.

Research-Kit's inspected tree still did not establish redistribution rights. This review does not copy its runtime into Moonzila or assert a license. Existing captured reference pages and original immutable handoff snapshots remain available to the next developer.


## Stage 1 fixture requirement — user clarification

Check in a small fixture corpus of **real artifact ZIPs produced by Research-Kit at `5588ce3def50e7e3702e5f84251bfd3d445f3df0`**. Do not hand-write substitute manifests or label fabricated approvals as producer output. For every valid fixture record the SHA-256 and exact byte length, pinned producer/validator revision and runtime, generation commands, synthetic source inputs, actual review/preflight steps and expected machine-readable validator result. Use public or synthetic non-sensitive inputs with documented fixture rights; never include user projects, credentials or private research. Portable fixture tests must need neither the original PC nor live provider keys.

Cover genuine producer outputs for an approved brief, a valid corpus awaiting review, and a failed/partial collection where supported by that producer. The approved example must pass the real producer's review and gate rules. Derive corruption, missing-capture, wrong-correlation, inconsistent-authorization and unsupported-version cases as explicitly labeled mutations of the originals; record which bytes/fields changed. Mutated fixtures are negative test inputs, not claimed producer outputs.

Acceptance asserts the exact archived bytes and invokes the **real pinned validator** through Moonzila's bounded process adapter. Mocked process output is useful for timeout/IPC unit tests but cannot replace this contract test. Verify the normalization for supported legacy 1.x fixtures with recorded producer provenance, reject mixed-era names, and keep package validity separate from research readiness and Moonzila permission. An upstream version bump requires deliberate fixture/expected-result review and a PR; never silently regenerate golden files in the test run. Byte-stable golden inputs prevent accidental fixture drift; they do not establish authenticity or eliminate the need to validate the actual binary and job binding.
