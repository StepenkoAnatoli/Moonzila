# Offline Research Kit consumer

This stage implements the backend boundary from the [integration review](research-kit-integration-review.md). It does not add research jobs, renderer controls or Build gating. Ordinary project conversations retain their behavior. [Folder-free chat](folder-free-chat.md) is the recommended next user-facing phase before research jobs and review UI.

## Contract and trust

`src/adapters/research-kit` owns Moonzila's strict job binding, report, receipt and result types. The external validator owns the full `research-kit-artifact` schema. Moonzila reads a projection of relevant manifest fields only after the real validator checks the whole package. It does not introduce a second artifact format.

The supported validator revision is `fcde0e6c4e9ba585454f81262d695609ef0af474` (re-pinned from `5588ce3def50e7e3702e5f84251bfd3d445f3df0` on October 2 for the collector's `--run-id`; the validator, ZIP reader and CLI entry are byte-identical between the two), with actual major-1 and major-2 producer fixtures, still the `5588ce3` and `1a0337b` producer outputs. A trusted main-process configuration supplies an external kit directory, Node executable and its expected SHA-256, native helper path and private application storage. These are not renderer inputs. The reviewed inventory pins every copied bin/lib/schema file to exact Git bytes; extra installation files are not copied or executed. There is no runtime download, shell launch or Research Kit redistribution in the application.

Main or a future job owner supplies the expected project/job revisions and complete dispatch identity: clientRef, repository, ref, commit, workflow, run ID and attempt. These claims must come from recorded dispatch state when Stage 2 wires IPC. The current backend must not be exposed as an arbitrary renderer path/identity validator.

`PASS` means the package and requested identity are consistent. `researchReady` additionally requires the approved state and consistent review/gate fields. Neither result grants application tool permission. Reviewer names and hashes are declarations/corruption checks, not signatures. Existing project privacy, trust, recovery and exact operation approval remain independent.

## Bytes, process ownership and storage

Read the source archive once through a bounded handle, then use the captured buffer for archive inspection, hashing, staging and retention. Before launch, the Windows helper locks the staged archive, copied validator files, Node executable and their ancestor directories against replacement. The owner rehashes while those locks are held and only then admits the child. Validation uses fixed CLI arguments, no shell and a minimal environment containing SystemRoot and private home/temp directories. It never inherits provider keys or Node injection variables. Stop, timeout and output overflow terminate the owned process tree.

Input is limited to 32 MiB; the consumer inspects at most 5,000 entries, 16 MiB per entry, 64 MiB declared expanded bytes and a 200:1 ratio above 1 MiB. Manifest JSON is limited to 256 KiB. The real validator independently checks structural consistency, actual sizes, hashes, duplicate JSON keys, file inventory, provenance and citations. CLI output is capped at 256 KiB and execution/admission each at 60 seconds. Direct internal diagnostic inspection uses the pinned validator's own expansion limits; normal import adds the stricter consumer bounds first.

Successful imports retain only a content-addressed ZIP outside project instruction discovery, under a 128 MiB storage ceiling. Imported AGENTS, skills and hooks are not extracted or activated. Receipts bind exact bytes, validator/runtime identity and job/project revision. `readVerified` returns a rehashed buffer, never an unchecked pathname. Readiness receipts are process-local: after restart the trusted job owner must run validation again. Retained ZIPs alone cannot restore permission or readiness. The future job stage owns lifecycle/eviction UI; this stage fails when its storage ceiling is reached.

This guards the validation-to-read interval. It does not claim protection against an administrator or arbitrary code already running as the same user, nor authenticate an upstream workflow. A future Build gate must present the current authoritative job revision and recheck the other application permissions at each effect.

## Development and verification

Run `node scripts/prepare-research-kit.mjs` before tests. It checks out the public external Git source into ignored storage, exports the recorded commit's exact bytes and compares the resulting inventory. Missing or changed tool bytes fail tests rather than silently skipping real validation. CI performs this same step. See [fixture provenance](../../tests/fixtures/research-kit/README.md) for explicit regeneration; ordinary tests never rewrite goldens.

The optional verifier accepts four arguments:

```powershell
npx tsx scripts/verify-research-kit.ts --config trusted-installation.json --artifact package.zip --binding expected-job.json --output new-report.json
```

Configuration fields are `kitRoot`, `nodePath`, `nodeSha256`, `storageRoot` and `helperPath`; paths are absolute. Establish the runtime hash from a trusted installed runtime, not from an artifact's claim. Keep storage in the app's private data directory. Binding fields are `projectId`, `projectRevision`, `jobId`, `jobRevision`, `clientRef`, `repository`, `ref`, `commit`, `workflow`, `workflowRunId`, `runAttempt`. Revisions, run ID and attempt are positive integers. Config/binding files are each limited to 64 KiB. The verifier writes a new sanitized report, closes its owned runtime, and exits 0 for a valid package even when research is not ready. No credentials are needed.

This is an opt-in backend verifier, not a completed Research Kit product interface or a new installer release. The current published installer remains `v0.6.0-dev.1` until a later user-facing phase is delivered.
