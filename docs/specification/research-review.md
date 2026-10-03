# Research review process

This is the design contract for reviewing a collected corpus (plan Task 5, decision D3 option (a)). Nothing here is implemented yet. It is written at the depth of [research collection](research-collection.md) so that the implementation can be checked against it line by line. Where a choice belongs to the user, the design states the recommended option and lists it under [Open questions](#open-questions); nothing is implemented for such a choice until it is answered.

## Purpose and scope

A collected job (`collected`) holds a verified package whose state is `REVIEW_REQUIRED`, `REVIEW_IN_PROGRESS` or `PREFLIGHT_BLOCKED` (Task 4). It is never research-ready: a collected package is never `buildAuthorized`. Readiness exists only when the kit's own `artifact.mjs create` derives `APPROVED_BRIEF` from a reviewed project, and Monnzila then validates the exact bytes of that new package.

Review therefore has four parts:

1. Materialise the verified corpus into a private research workspace outside every project folder.
2. Run an agent review in that workspace. Every change is an exact edit approval, journaled like a Build edit. The agent may run the kit's preflight and ask the kit to draft the brief.
3. Freeze the workspace, run `artifact.mjs create` over it through the guarded runner, and validate the new package with the job's recorded binding.
4. Record `approved` only from that validation, behind a digest-gated SQL rule.

Monnzila never parses or rewrites the corpus Markdown itself. The model proposes edits, the user approves exact bytes, and the kit derives every review and gate field. This follows the integration review's rule against an ad hoc Markdown parser.

## Research Kit facts this design depends on

Read from the pinned export `.build/research-kit-external/research-kit` at `fcde0e6` (the revision in `src/adapters/research-kit/runtime-inventory.json`). Rows marked *ran* were reproduced on October 3 on Linux with Node 24.21.0, in a copy of `tests/fixtures/research-kit/collected.zip`'s `project/` folder, with an environment of only `HOME`, `TEMP`, `TMP`, `TMPDIR` and `USERPROFILE`.

| Fact | Source |
| --- | --- |
| `preflight.mjs` takes no project argument; the project is the working directory. Flags: `--check <name>` (repeatable), `--checks`, `--strict`, `--json`, `--quiet`, `--show-pass`, `--help`. | `bin/preflight.mjs` lines 4–6, 16, 41 |
| An unknown flag exits 2 (`refuseUnknownFlags`, default exit 2); an unknown `--check` exits 2. *Ran.* | `bin/preflight.mjs` 16, 48; `lib/core.mjs` `refuseUnknownFlags` |
| `--json` prints one pretty-printed (multi-line) object `{pass, counts{pass,warn,fail}, evidencePolicy, findings[{severity, check, rule, detail}]}` and exits 0 when `pass`, 1 otherwise. It is printed before the "not gated" check. *Ran.* | `bin/preflight.mjs` 52–60 |
| An uncaught exception also exits 1, with nothing on stdout, so exit 1 alone does not mean "gate failed". | Node's default for an uncaught ESM top-level error |
| The verdict reads the machine config from `RESEARCH_KIT_CONFIG`, else `RESEARCH_KIT_HOME`, else `<home>/.agents/research-kit.config.json`. Absent means defaults: `evidencePolicy: pluralist`, `maxAgeDays: 180`. | `lib/machine.mjs` `configPath`, `DEFAULTS`, `readMachineConfig` |
| `git` runs only when the project holds `.git` (`localHooksPathOverride`). | `lib/machine.mjs` `isGitRepo`, `localHooksPathOverride` |
| `unknown-closure` compares retrieval dates with today against `maxAgeDays`, but evidence older than that is only a `warn` (`stale-evidence`). Only `--strict`, which this design never passes, turns a warning into a failure; `evidencePolicy: strict` promotes only `transport-provenance`, `capture-completeness` and `corroboration`. Under the defaults an aged corpus still passes, with that warning. | `lib/checks.mjs` `unknownClosure` 300–337; `lib/preflight.mjs` 22, `promote` 49–56 |
| `brief.mjs` flags: `--force`, `--state`, `--help`; unknown flag exits 2. Not gated exits 2. A refused draft (already edited, `legacy`) exits 1 with a reason. A write failure exits 2. Success exits 0 and rewrites only `research/BRIEF.md` (plus `BRIEF.md.bak-<date>` under `--force` over a judged brief). *Ran.* | `bin/brief.mjs` 12, 43–66; `lib/brief.mjs` `renderBrief` 320–331 |
| A drafted brief ends with a stamp holding a hash of its inputs: the topic, intent, every unknown, every evidence row including its Finding, the map rows and the ledger length. When those change after the draft, preflight warns `hygiene/brief-stale` (a warning, so `create` still approves) and the kit's remedy for an edited brief is `brief.mjs --force`. *Ran:* drafting, then rewriting E-01's Finding gave `APPROVED_BRIEF` with the old Finding text still in the brief; rewriting first, then drafting, gave no `brief-stale`. | `lib/brief.mjs` `briefInputsHash` 90–101, `renderBrief` 330; `lib/checks.mjs` 702–711 |
| `briefState` is `authored` only when the text carries the drafter's `_Auto-drafted` marker and neither judged section (`contradictions`, `decision`) contains `**TODO**`. A hand-written brief without the marker is `legacy` and never counts as reviewed. | `lib/brief.mjs` `briefState`, `JUDGED_SECTIONS`, `TODO_MARK` |
| `Reviewed by: agent` is a declaration read into `review.by`; it is not an approval condition. | `lib/brief.mjs` `reviewedBy`; `lib/artifact.mjs` 255–257 |
| `artifact.mjs create` requires `--repository --ref --commit --workflow --run-id`; optional `--root` (default `.`), `--output`, `--client-ref`, `--run-attempt` (default 1), `--run-url`, `--html-url`, `--api-version`. Any other flag exits 3; `--build-authorized` and nine similar names are refused "forever". *Ran.* | `bin/artifact.mjs` 75–91, 104–117, 157–167 |
| `create` exits 0 when the written package re-validates, 1 or 2 when it does not, 3 when blocked (missing flag, bad client ref, identity rejected by the manifest schema, an unpackageable name, a link outside the project, an old Node). *Ran:* a capture edited after its fetch gave exit 1; `--repository=x` gave exit 3. | `bin/artifact.mjs` 6–9, 157–205; `lib/runtime.mjs` `requireRuntime` |
| On exit 1 or 2 the invalid package is **left on disk**. *Ran.* | `bin/artifact.mjs` 175–201; `lib/artifact.mjs` `writeArtifact` |
| `create` exits 0 for a valid package whatever its state. *Ran:* an unknown set to `OPEN` gave exit 0 with `state PREFLIGHT_BLOCKED, gate FAIL, build NOT authorized`. Exit 0 is never readiness. | `bin/artifact.mjs` 193–204 |
| `create` derives state by running the gate with `env = {}`, so the ambient environment cannot switch the gate off; the config path still falls back to the process's home folder. | `lib/artifact.mjs` `deriveState` 227–249; `lib/machine.mjs` `agentsHome` |
| Approval is `gatePass && mapClassified && briefReviewed && findingsReviewed`, where `gatePass` also needs `verifyHandoff(...).ok`. `findingsReviewed` is false while any Finding cell equals the extractor's own output. States: `COLLECTION_FAILED`, `APPROVED_BRIEF`, `REVIEW_IN_PROGRESS` (gate passes, review incomplete), `PREFLIGHT_BLOCKED`, `REVIEW_REQUIRED`. | `lib/artifact.mjs` `deriveState` 248–268, `findingsReviewState` |
| `create` packages `AGENTS.md`, `START_HERE.md`, `.gitattributes`, `.gitignore`, and everything under `research/` and `docs/`, except the machine-local files (`.usage.jsonl`, `.diagnostics.jsonl`, `.failures.jsonl`, `.fetches.lock`, `overrides.log`, `GATE_OFF`), `.env*`, `.git`, `node_modules`, `.firecrawl`, `*.pem`, `*.key` and `.gitkeep`. A FIFO, a folder cycle, a case collision or a name the consumer would refuse is an error. | `lib/artifact.mjs` `EXCLUDED`, `EXCLUDED_NAME`, `collectProjectFiles` |
| `createdAt` is the current time and feeds `packageId`, so two runs over identical bytes give different packages and different digests. | `lib/artifact.mjs` `createArtifact` 498, 566 |
| The validator checks container, manifest digest, every file's hash, secrets, authorization consistency and the provenance chain. It does **not** re-run the gate: it trusts a manifest whose fields agree with each other. The gate is applied once, by `create`. | `lib/artifact-validator.mjs` 300–352, `authorizationProblems` |
| The drafted brief embeds a kit command line built from the corpus's own `research/kit.json`, so it can carry the collector machine's path. It is untrusted text. *Ran.* | `lib/brief.mjs` `renderBrief` (`documentCommand`) |

## Ownership

- The engine owns job state, review runs, approvals and the edit journal. It never runs the kit.
- Main owns the workspace on disk, every kit child, the verified package bytes and receipts, and the decision to commit `packaging`, `approved` and packaging's `not_ready`.
- The renderer only calls `research.review.start {researchId, profileId}`, `research.cancel`, `approval.decide` and the existing readers. It never supplies a path, an executable, an identity field or a decision.

Proposed modules (names are suggestions):

- `src/main/review.ts` (`ReviewSupervisor`): start, freeze, packaging, recovery adoption, cancel.
- `src/main/review-workspace.ts`: materialisation, the tree inventory and the expected-tree fold. Pure apart from file I/O; no process launch.
- `src/adapters/research-kit/adapter.ts`: `prepareReview()` beside `prepareCollector()`, sharing `guardedRun`.
- `src/engine/research-review.ts`: `research.review.begin/context`, the review tool set, root resolution and the run-end transitions.
- `src/engine/migrations.ts`: schema v4.

Engine controls (`src/engine/control.ts` `ControlSchema`):

- new `research.review.begin {requestId, researchId, profileId, workspace}` and `research.review.context {researchId}`;
- `research.transition` gains `to: packaging | approved | not_ready` and the patch fields `reviewDigest` and `reviewedPackage`;
- `ResearchRecoverySchema` gains `freeze` and `packaging` lists.

The engine asks main to run a kit tool with a new port message pair, `research.tool {runId, name}` and its result or error, shaped like `command.prepare/execute` (`src/engine/control.ts` `FromEngineSchema`, `ToEngineSchema`).

## Job states and edges

v4 adds one status, `packaging`, and one actor, `engine` (a run outcome recorded in the same transaction as the run's terminal event). `packaging` joins `ACTIVE_RESEARCH`, so a project holds one active job through review and packaging. `collected` and `not_ready` stay inactive: a new collection may start beside them, and a retry is then refused with `RUN_ACTIVE` until it ends.

| From | To | Actor | Requires | Allows | Cause |
| --- | --- | --- | --- | --- | --- |
| collected | reviewing | user | `reviewRunId`, `reviewSessionId`, `workspace` | | `REVIEW_STARTED` |
| not_ready | reviewing | user | `reviewRunId`, `reviewSessionId`, `workspace` | | `REVIEW_RETRY` (`continued`) or `REVIEW_RESTARTED` (`fresh`) |
| reviewing | packaging | main | `reviewDigest` | | `WORKSPACE_FROZEN` |
| reviewing | not_ready | engine, main, recovery | `failure` | | see vocabulary |
| reviewing | cancelling | user | | | `CANCEL_REQUESTED` (exists) |
| packaging | approved | main | `reviewedPackage` | | `KIT_APPROVED` |
| packaging | not_ready | engine, main, recovery | `failure` | `reviewedPackage` | see vocabulary (`engine` only for `REVIEW_STOPPED`) |
| packaging | cancelling | user | | | `CANCEL_REQUESTED` |
| cancelling | cancelled | main, recovery, engine | | `workflowRunId`, `failure` | `REVIEW_CANCELLED`, `NO_OWNED_WORK` |

`approved` has no outgoing edge. `not_ready → reviewing` is the only retry edge, and it starts a new review run; nothing returns to `collected`. A job leaves `reviewing` only when its review run is terminal, or (to `packaging`) when the run is `awaiting_review`.

`workspace` is `fresh` when the workspace was rebuilt from the verified package and `continued` when the previous review's edits were kept and verified. `reviewedPackage` is `{sha256, validatorRevision, boundRevision}`: the digest of the reviewed ZIP, the validator revision of its receipt, and the job revision the receipt's binding carried.

`research.cancel` gains `packaging → cancelling`. For `reviewing` it also aborts the review run inside the same request.

## Schema v4

SQLite cannot change a `CHECK` constraint, so v4 rebuilds `research` and `research_events` the way v2 rebuilt `sessions` and `runs` (`migrateChat` in `src/engine/migrations.ts`): create the new tables, copy every row, drop the old ones, rename, then create indexes and triggers. v3 is not a precedent for this: `migrateResearchJobs` set the v2 rows aside in `research_legacy` and created the v3 tables empty, so v4 is the first rebuild that must copy `research` and `research_events` rows with their CHECK constraints and triggers in force. Triggers are created after the copy, because `research_events_step` would refuse historical rows. The v3 DDL stays in the file as v3's stable source definition, as `initialSchema` is for v1. If Task 4 lands its own migration first, this becomes v5 (open question Q5).

New `research` columns, all nullable:

- `review_session_id TEXT`, `review_run_id TEXT`. No foreign key: an `ON DELETE SET NULL` would be an unjournaled update and `research_update_journaled` would abort it. The engine refuses `session.delete` for a session that a job in `reviewing`, `packaging` or `not_ready` references (`RUN_ACTIVE`).
- `review_digest TEXT`, 64 lowercase hex.
- `reviewed_package_sha256 TEXT` (64 hex), `reviewed_validator_revision TEXT` (40 hex), `reviewed_bound_revision INTEGER`.

New table checks:

```sql
CHECK(status NOT IN ('reviewing','packaging') OR (review_run_id IS NOT NULL AND review_session_id IS NOT NULL)),
CHECK(status <> 'packaging' OR review_digest IS NOT NULL),
CHECK(status <> 'approved' OR (review_digest IS NOT NULL AND reviewed_package_sha256 IS NOT NULL
  AND reviewed_validator_revision IS NOT NULL AND reviewed_bound_revision IS NOT NULL AND failure IS NULL)),
CHECK(status <> 'reviewing' OR (review_digest IS NULL AND failure IS NULL))
```

`research_events.actor` gains `'engine'`. Both status lists gain `'packaging'`; `research_active` gains it too.

`research_readiness_reserved` is dropped and replaced by:

```sql
CREATE TRIGGER research_readiness_digest BEFORE UPDATE OF status ON research
  WHEN NEW.status = 'approved' AND (
    OLD.status IS NOT 'packaging'
    OR NEW.review_digest IS NOT OLD.review_digest
    OR NEW.reviewed_package_sha256 IS NULL
    OR NEW.reviewed_package_sha256 IS <the collected package digest column from Task 4>
    OR NOT EXISTS(SELECT 1 FROM research_events WHERE research_id = NEW.id AND revision = NEW.revision
      AND from_status = 'packaging' AND to_status = 'approved' AND actor = 'main' AND cause = 'KIT_APPROVED'
      AND json_extract(detail, '$.reviewedPackage.sha256') = NEW.reviewed_package_sha256))
  BEGIN SELECT RAISE(ABORT, 'RESEARCH_READINESS_UNVERIFIED'); END;
```

A further trigger makes the reviewed columns immutable once `OLD.status = 'approved'` (no edge leaves `approved`, so this guards a direct write). The rule cannot prove that a validation happened. It does pin `approved` to one edge, one actor, a frozen review digest and a package that is not the collected one, and the engine sends that edge only from main's validated reply.

The store writes review columns explicitly per edge, not with `COALESCE`: `not_ready → reviewing` must clear `failure`, `review_digest` and the reviewed package fields, or the new checks abort it.

`recoverInterrupted` keeps a run that is `awaiting_review` when a job in `reviewing` or `packaging` names it as `review_run_id`; that run holds no engine work. Every other active run is interrupted as today.

## Starting a review

`research.review.start {researchId, profileId}` keeps its renderer shape, but its owner moves from `engine` to `main` (open question Q2): the workspace must exist before the engine admits a run that edits it, and only main can read verified bytes. Main serializes starts per job and does:

1. Read `research.review.context`. The status must be `collected` or `not_ready`, otherwise `REVIEW_NOT_AVAILABLE`. The review admission must be null (see Q1).
2. Obtain verified bytes of the collected package: `readVerified` with a live receipt, or else a fresh `validate` of the retained file with the recorded binding (Task 4). Failure refuses the request with `STALE_VERIFICATION`. A missing installation refuses with `RESEARCH_KIT_UNAVAILABLE`.
3. Prepare the workspace: `fresh` when the job is `collected`, when no workspace exists, or when the existing one does not verify; otherwise `continued`. A `fresh` workspace replaces the previous one.
4. Send control `research.review.begin {requestId, researchId, profileId, workspace}`. Before its transaction the engine reconciles `unknown` write operations of earlier review runs against the workspace (`observeRecovery`): `applied` becomes `completed`, `not-applied` becomes `failed` with a recorded observation, and `conflict` refuses with `REVIEW_WORKSPACE_CHANGED`, after which main rebuilds `fresh` and sends a new begin. In one acceptance transaction the engine then checks the job's status and revision, the project's trust and research policy, the profile and `assertConversationPolicy`, and that the project has no active run. It creates the job's review session on the first review (reused afterwards, so history carries over), creates a run in mode `research` whose user message is Monnzila's fixed review instruction, records the edge, and appends `run.started`, `message.created` and `research.status`. It returns `{research, run}`.
5. Main installs the run capability, as for `run.start`, and replies `{research}`.

`ResearchSchema` gains optional `reviewSessionId`, `reviewRunId` and `reviewedPackageDigest`, so the renderer can open the review conversation. `packageDigest` stays the collected package's digest (Task 4).

## The private workspace

### Location

`<userData>/research-kit/storage/review/<researchId>/`, with `project/` (the workspace), and per attempt `staging-<uuid>/`, `scratch-<uuid>/`, `out-<uuid>/` and `temp-<uuid>/`. It is outside every project folder and inside the app's protected data folder. Main and the engine derive the path from `userData` and the job id; it never crosses IPC from the renderer. Clean-up is in two steps, because the first runs before the engine exists (`src/main/index.ts` calls `researchKit.sweep()` before `new Engine(...)`) and so cannot know any job's status. `ResearchKit.sweep()` gains `review` handling that needs no job state: it keeps every `review/<id>/project` and removes leftover `staging-*`, `scratch-*`, `out-*` and `temp-*`. Whole job folders are removed later, at recovery: main lists the folder names under `review/` (at most 1,000 per start; the rest wait for the next one) and passes them to `research.recover`, which returns `reviewDiscard`, the names whose job is absent or not `collected`, `reviewing`, `packaging` or `not_ready`. Main then removes exactly those, under the same storage lock as `sweep`. A folder is removed only when the engine has named it, so a truncated listing delays clean-up and never deletes a live workspace.

### Materialisation

From the verified bytes, never from the file on disk again: open the buffer with the same limits as `inspectArchive` (`src/adapters/research-kit/archive.ts`: at most 5,000 entries, 16 MiB per entry, 64 MiB uncompressed, ratio cap, `safeArtifactPath`, regular files only, no case duplicates). Take only `project/` entries. Each name, without `project/`, must also pass `validateRelativePath` and must not be one `create` would exclude. Write each with `wx` into `staging-<uuid>/project`, check its SHA-256 against the manifest's `files[]` entry, and require the two sets to be equal. Then remove the old `project/` and rename `staging-<uuid>/project` into place. A crash leaves either the old folder or a stray staging folder, never a half-written `project/`.

The **base inventory** is the manifest's `project/` entries as `{path, sha256}`. `ManifestProjection` gains a strict `files[]` projection for this; the validator has already checked every hash.

At most 1,900 files (`maxWorkspaceFiles`): the helper takes at most 2,048 read locks (`src/tools/commands.ts`, `INVALID_GUARDS`), and packaging locks Node, the 100 staged kit files and every workspace file. A larger corpus refuses with `REVIEW_WORKSPACE_TOO_LARGE`.

### The expected tree

`expected = fold(base inventory, review changes)`. The review changes are the `completed` write operations of the job's review runs since its latest `fresh` edge, in creation order (one write is in flight at a time per run, and one run at a time per project). Each sets `path → afterHash`, or removes the path when `content` is null. `research.review.context` returns them as `{operationId, runId, path, status, beforeHash, afterHash}`, without contents.

The workspace **verifies** when its tree (every regular file, as `{path, sha256}`; any link, hard link, FIFO or other entry fails) equals `expected` exactly, after main has deleted the edit journal's own temporary files (`.moonaliza-<uuid>.tmp`, `src/tools/files.ts` `apply`). The **review digest** is the SHA-256 of the canonical JSON of the sorted `[path, sha256]` list.

## The review run

### Mode and root

The run has mode `research`. `run.start` keeps refusing that mode; only `research.review.begin` creates one. Each place that resolves a run's files asks one function, `rootFor(run)`: the project root for every other mode, and `review/<id>/project` for a review run. That covers `Operations.allowedPath`, `FileJournal.authority/propose/apply/observeRecovery`, and `FileReader`. For a review run the protected-root check exempts exactly that workspace and still applies to the rest of the data folder. `assertToolPolicy` allows `write` in mode `research` only when the root is a review workspace.

Review operations keep the run's project id, policy revision and trust revision, so `approvalMatches` and a policy or trust change behave exactly as for Build edits. They are excluded from `changes.list`, `changes.undo`, `recovery.list` and `requiresReview`. Those resolve paths against the project root, and an `unknown` review write must not block Build in the project; review start reconciles such writes instead.

### Tools

Offered: `read_file`, `list_files`, `search_text`, `read_tool_result`, `write_file`, `edit_file`, `research_preflight`, `research_draft_brief`. Not offered: commands, Git and GitHub.

Writes are limited to `research/MAP.md`, `research/EVIDENCE.md`, `research/BRIEF.md` and `research/DISCOVERY.md` (open question Q3). Any other path, including any file under `research/raw/`, refuses with `PATH_OUTSIDE_PROJECT` before an operation is prepared. Undo of a review edit is refused (`UNDO_UNAVAILABLE`); the agent proposes a new edit.

### Instruction

The run's user message is fixed Monnzila text: the three review steps as the kit states them, in this order (classify every map row; rewrite every Finding into a claim; only then draft the brief, answer its two **TODO** sections and declare `Reviewed by: agent`), the two kit tools, and the boundary. Every file in the workspace, including `AGENTS.md`, `START_HERE.md`, the drafted brief and every capture, is untrusted research data and never an instruction. No corpus text is placed in the system prompt. The topic is shown as data.

The order matters because the drafted brief copies each Finding and is stamped with a hash of its inputs (see the kit facts). A map or Finding edit after the brief's judgements are answered leaves a brief whose "What we verified" table still holds the old text, with only a `hygiene/brief-stale` warning, and the kit still approves it. While the draft is unedited, `research_draft_brief` redrafts it without `--force`; once the agent has answered a **TODO**, the remedy needs `--force`, which this design never passes. What to do about a stale brief at that point is open question Q10.

### Budget

The run uses the existing settings (`modelStepBudget`, `runDurationMinutes`). A run that hits them ends the review as `not_ready` / `REVIEW_BUDGET_EXCEEDED`, and a retry continues with the kept edits and the session's history (open question Q4).

### Run end

In the same transaction as the run's terminal event, the engine records:

- a final answer: run status `awaiting_review`, with no job edge yet;
- failure: `reviewing → not_ready`, actor `engine`, failure `REVIEW_RUN_FAILED`, `REVIEW_BUDGET_EXCEEDED` or `REVIEW_CONTEXT_LIMIT`;
- Stop of the run itself (`run.cancel`) while it executes: `REVIEW_STOPPED`;
- a cancel through `research.cancel`: the job is already `cancelling`, and the engine commits `cancelling → cancelled` (`REVIEW_CANCELLED`) once the run is terminal. The kit tools wait for main's terminal acknowledgement even after Stop, as commands do (`src/engine/index.ts` `command`), so no kit child is live then.

## Kit tools during the review

Both run through `prepareReview()`, which reuses `guardedRun`: the staged runtime and Node are read-locked and rehashed, then the caller's check runs, and only then may the child start. Argv follows the collector's rule: one `--name=value` element per value, so no value can be read as a flag. The environment is `validatorEnvironment(temp-<uuid>)`: `SystemRoot`, plus `TEMP`, `TMP`, `TMPDIR`, `HOME` and `USERPROFILE` pointing at the private temp folder. That means no machine config is found and the defaults apply. Node runs with `--max-old-space-size=256`. Main redacts output through the vault and checks the run capability, the run context (mode `research`, the job `reviewing`, `review_run_id` equal to this run) before and after the child.

### `research_preflight` (no arguments, no approval)

```
--max-old-space-size=256 <runtime>/bin/preflight.mjs --json
```

The working directory is `review/<id>/project`, and each workspace file is read-locked. Bounds: 60 s, 256 KiB, `stopOnOutputLimit: true`. The whole output must parse as the shape above, with exit 0 when `pass` and 1 when not; anything else (exit 2, a crash's exit 1 with no JSON, truncation, timeout) is a tool failure `REVIEW_TOOL_FAILED` that the agent sees. The result passed to the model is `{pass, counts, evidencePolicy, findings}`, with at most 200 findings and each `detail` cut to 1,024 characters, labelled as untrusted text. No approval is needed: the step only reads, with fixed arguments, no network, pinned bytes and no project path. The verdict is the agent's guide only. It decides nothing.

### `research_draft_brief` (no arguments, then an exact approval)

Main copies the workspace into `scratch-<uuid>/project` and runs, with that copy as the working directory:

```
--max-old-space-size=256 <runtime>/bin/brief.mjs
```

Bounds: 60 s, 64 KiB output. `--force` is never passed. On exit 0 main reads `research/BRIEF.md` from the copy (at most 1 MiB, strict UTF-8, no NUL) and deletes the copy. The engine then prepares an ordinary `write_file` operation for `research/BRIEF.md` with exactly that content, which the user approves or declines like any edit. Exit 1 returns `BRIEF_NOT_DRAFTED`: the brief already holds judgements, so the agent edits it directly. Anything else is `REVIEW_TOOL_FAILED`. Running in a copy keeps every workspace change inside the journal, which the expected tree depends on.

## Packaging

Main's supervisor sees the review run's `run.status awaiting_review` event, or adopts the job at recovery.

1. **Freeze.** Read `research.review.context`, delete journal temp files, and verify the workspace against `expected`. A mismatch commits `reviewing → not_ready` / `REVIEW_WORKSPACE_CHANGED`. Otherwise commit `reviewing → packaging {reviewDigest}`. From here the review run accepts no tool calls, because it has ended.
2. **Create.** In `out-<uuid>/`, with the working directory `temp-<uuid>/`:

   ```
   --max-old-space-size=256 <runtime>/bin/artifact.mjs create --root=<review/<id>/project>
   --output=<out-<uuid>/reviewed.zip> --client-ref=<clientRef> --repository=<r> --ref=<ref>
   --commit=<sha40> --workflow=<w> --run-id=<id> --run-attempt=<n>
   ```

   Every identity value comes from the job's verified binding (Task 4), never from settings or the renderer. The read locks cover Node, the staged kit and every workspace file. The guarded run's check (`beforeStart`) rehashes every locked workspace file and lists the folders. It refuses the start with `REVIEW_WORKSPACE_CHANGED` unless the tree still equals the frozen inventory, and it re-reads the job, which must still be `packaging` with the same revision and a null admission. Bounds: 120 s, 64 KiB output, `stopOnOutputLimit: true`. The kit's text output is never parsed; only the exit code is read.
3. **Exit.**
   - 0: continue.
   - 1 or 2: delete the output, `not_ready` / `REVIEW_PACKAGE_INVALID`, cause `KIT_CREATE_EXIT_<n>`.
   - 3: `REVIEW_PACKAGE_BLOCKED`, cause `KIT_CREATE_EXIT_3`.
   - A start refused by the check: that check's code.
   - Timeout, helper failure or truncation: one more attempt from step 2, then `REVIEW_PACKAGING_FAILED` with cause `OWNED_TIMEOUT`, `HELPER_FAILED` or `KIT_OUTPUT_LIMIT`.

   Repeating is safe because packaging is local: nothing remote can run twice.
4. **Validate.** `ResearchKit.validate(out/reviewed.zip, binding)` with the job's binding and `jobRevision` equal to the `packaging` revision. Any status other than `PASS` (including `INPUT_LIMIT` for a package over 32 MiB) gives `REVIEW_PACKAGE_INVALID`, and `IDENTITY_MISMATCH` gives the same failure with that cause.
5. **Inventory.** The new manifest's `project/` entries must equal the frozen inventory exactly: same paths, same hashes, nothing added. Otherwise `REVIEW_PACKAGE_MISMATCH`. This catches a file added or changed while `create` ran, which read locks on existing files cannot prevent.
6. **Outcome.** `researchReady` gives `packaging → approved {reviewedPackage}`. Otherwise `packaging → not_ready {failure, reviewedPackage}`: `REVIEW_GATE_FAILED` for `PREFLIGHT_BLOCKED`, `REVIEW_INCOMPLETE` for `REVIEW_IN_PROGRESS` or `REVIEW_REQUIRED`, and `REVIEW_PACKAGE_INVALID` for anything else. The engine re-checks the job's revision and the review admission in the transaction. A changed admission gives `not_ready` with the admission code instead.

Commits follow the collector's rules: one random request id per planned command, kept until the engine answers, and `ENGINE_UNAVAILABLE` waits and resends the same id. Out folders are deleted after the commit. The reviewed ZIP stays content-addressed under `storage/artifacts/` through the existing retention. After `approved` or `cancelled`, `review/<id>` is deleted.

The renderer shows "ready" only while main holds a live receipt for `reviewed_package_sha256` with the stored binding. After a restart main re-validates the retained reviewed package before showing it (open question Q6).

## Streaming `research.status`

Every transition of a job that has a `review_run_id` appends `research.status {researchId, status}` to that run in the same transaction, while the run exists. This includes `reviewing` at begin, `packaging`, `approved`, `not_ready`, `cancelling` and `cancelled`. Main's own commits do the same through `research.transition`. When packaging ends and the run is still `awaiting_review` (a Stop has not already finished it, see *Cancel, Stop, trust and policy*), the same transaction appends `run.completed` (approved) or `run.failed` (not ready, with the failure as a public error code). If the run was interrupted, only `research.status` is appended. The job notice on the `research` engine message continues for every transition, as for collection.

## Cancel, Stop, trust and policy

- `research.cancel` on `reviewing` gives `cancelling` and aborts the run. On `packaging` it gives `cancelling`, and main stops the `create` child; local, so stopping is safe. Main then commits `cancelling → cancelled` with cause `REVIEW_CANCELLED`.
- Stop on the review run (`run.cancel`) ends only the run: `not_ready` / `REVIEW_STOPPED`. The job can be retried.
- Stop on a review run in `awaiting_review` needs its own branch in `run.cancel`. Today `run.cancel` aborts the active execution and appends `run.status cancelling` (`src/engine/application.ts`, `run.cancel`). An `awaiting_review` run has no active execution, so nothing would ever finish it, and the project's `RUN_ACTIVE` check would refuse every later run. The engine therefore commits it directly, in one transaction: `run.cancelled` (status `cancelled`, never `cancelling`), and the job edge for the state it is in. `reviewing` (final answer given, not yet frozen) goes to `not_ready` / `REVIEW_STOPPED`, actor `engine`. `packaging` goes to `not_ready` / `REVIEW_STOPPED`, actor `engine`. Main sees the transition on the job notice and stops the `create` child; a freeze or packaging commit main sends afterwards carries the old revision and is refused, and main then deletes its `out-*` folder and any validated ZIP that no job references (as for Q7). A Stop on a review run whose job is already `cancelling` only finishes the run.
- `project.revokeTrust` and `project.policy.update` already abort the project's runs, so a review run ends `REVIEW_STOPPED`. During `packaging`, `hold(projectId)` stops the child and the supervisor re-reads admission at release.
- Quit: the review run is interrupted with every other run, and `close()` stops a `create` child. The job is recovered at the next start.

## Recovery and restart

`research.recover` (`src/engine/research.ts`) changes as follows for jobs not in the owned list:

- `reviewing` whose run is terminal: `reviewing → not_ready`, actor `recovery`, failure `REVIEW_INTERRUPTED`.
- `reviewing` whose run is `awaiting_review`: returned in a new `freeze` list.
- `packaging`: returned in a new `packaging` list.
- The `review/` folder names main passes: returned in a new `reviewDiscard` list, as in *Location* above.

Main calls `research.recover` once, with the union of the collector's and the review supervisor's owned ids, and passes `freeze` and `packaging` to the review supervisor, which runs packaging from step 1. A `packaging` job first re-verifies the workspace against its stored `review_digest`. The collector's `FINISHED` sets (`src/main/collector.ts`, `src/main/collector-plan.ts`) gain `packaging`.

### Crash windows

| Crash between | State found | Result |
| --- | --- | --- |
| Materialisation and `begin` | `collected`/`not_ready`, a stray `staging-*` | sweep removes it; the next start materialises again |
| `begin` committed and the run's first step | `reviewing`, run interrupted | `not_ready` / `REVIEW_INTERRUPTED`; retry `continued` |
| Edit rename and its `completed` write | `reviewing`, write `unknown` | `not_ready`; at retry, `begin` reconciles the write against the workspace |
| Run final answer and the freeze | `reviewing`, run `awaiting_review` | `freeze` list; main freezes and packages |
| `packaging` commit and `create` | `packaging` | re-verify against `review_digest`, then create |
| `create` running | `packaging`, a stray `out-*` | the Job Object ended the child; sweep; create again |
| Validation retained the ZIP and the `approved` commit | `packaging`, an unreferenced retained ZIP | create again (new digest); the orphan counts toward the 128 MiB store until purge (open question Q7) |
| `approved` commit and the reply | `approved` | nothing; readiness is shown after re-validation |
| Engine-only restart during `reviewing` | the engine interrupts the run at its start | `not_ready` / `REVIEW_INTERRUPTED` |
| Engine-only restart during `packaging` | main's child keeps running; commits wait for `ready` | finishes; owned, so recovery does not touch it |

## Tampering

| When | Caught by | Failure |
| --- | --- | --- |
| While the app is closed, between reviews | retry verification; rebuild `fresh` | `REVIEW_RESTARTED` cause; the earlier edits stay in the journal only |
| After the run's final answer, before the freeze | freeze verification | `REVIEW_WORKSPACE_CHANGED` |
| After the freeze, before `create` starts | `beforeStart` rehash under the read locks | `REVIEW_WORKSPACE_CHANGED` |
| A file added or swapped while `create` runs | inventory equality | `REVIEW_PACKAGE_MISMATCH` |
| The reviewed ZIP after validation | `readVerified` digest check | `STALE_VERIFICATION`; not shown as ready |
| A capture or ledger edited through the review | path allowlist; the kit's own capture hashes | refused; or `create` exit 1 (`CAPTURE-HASH-MISMATCH`) |

## Failure and cause vocabulary

Every value matches `^[A-Z][A-Z0-9_]{1,63}$`.

- Job failures (`not_ready`): `REVIEW_INTERRUPTED`, `REVIEW_STOPPED`, `REVIEW_RUN_FAILED`, `REVIEW_BUDGET_EXCEEDED`, `REVIEW_CONTEXT_LIMIT`, `REVIEW_WORKSPACE_CHANGED`, `REVIEW_PACKAGE_BLOCKED`, `REVIEW_PACKAGE_INVALID`, `REVIEW_PACKAGE_MISMATCH`, `REVIEW_PACKAGING_FAILED`, `REVIEW_GATE_FAILED`, `REVIEW_INCOMPLETE`, `RESEARCH_KIT_UNAVAILABLE`, and the admission codes.
- Causes: `REVIEW_STARTED`, `REVIEW_RETRY`, `REVIEW_RESTARTED`, `WORKSPACE_FROZEN`, `KIT_APPROVED`, `KIT_NOT_APPROVED`, `KIT_CREATE_EXIT_<n>`, `IDENTITY_MISMATCH`, `INVENTORY_MISMATCH`, `OWNED_TIMEOUT`, `HELPER_FAILED`, `KIT_OUTPUT_LIMIT`, `REVIEW_CANCELLED`, `CANCEL_REQUESTED`, `RECOVERED`, `NO_OWNED_WORK`.
- Request errors from `research.review.start` (added to `ErrorCodeSchema`): `REVIEW_NOT_AVAILABLE`, `REVIEW_WORKSPACE_TOO_LARGE`, `STALE_VERIFICATION`, `RESEARCH_KIT_UNAVAILABLE`, plus the existing `RUN_ACTIVE`, `PROFILE_NOT_FOUND`, `CLOUD_NOT_ALLOWED`, `PROJECT_UNTRUSTED` and `RESEARCH_NOT_ALLOWED`.
- Tool results seen by the agent: `REVIEW_TOOL_FAILED`, `BRIEF_NOT_DRAFTED`, and the existing edit failures.

## Tests

The plan's four scenarios use the real Store, `ResearchJobs`, `Operations` with real approvals, a scripted model that issues tool calls, and the real pinned kit. `ResearchKit` is built with a runner that does what the helper does before `CreateProcessW` (take the read locks, run `beforeStart`, report the child) and then executes the real kit with `child_process`, as `tests/research-kit-collector-launch.test.ts` does. They start from `tests/fixtures/research-kit/collected.zip` (`REVIEW_IN_PROGRESS`, gate already passing; binding `moonaliza-fixtures/synthetic`, ref `fixture`, workflow `fixture-generation`, run 1, attempt 1, commit `5588ce3…`, client ref `moonaliza-fixture`).

1. **Passing review.** The model rewrites E-01's Finding, then drafts the brief (`research_draft_brief`, approved), answers both **TODO** sections, writes `Reviewed by: agent` and ends. The test also asserts that the brief carries the rewritten Finding and that preflight reports no `hygiene/brief-stale`. The expected result is `approved`, with a reviewed digest unlike the collected one, a live receipt with `researchReady: true`, `research.status` events `reviewing → packaging → approved` on the run, then `run.completed`. This sequence was reproduced by hand on October 3: `create` exit 0, `APPROVED_BRIEF`, validator `PASS`; with the rewrite first, preflight showed only `corroboration/single-source` as a warning.
2. **Failing gate.** The same, but one approved edit sets U-1 to `OPEN`. Expected: `create` exit 0 with `PREFLIGHT_BLOCKED`, then `not_ready` / `REVIEW_GATE_FAILED` with `reviewedPackage` recorded, and no `approved`. A second case ends without rewriting the Finding: `REVIEW_INCOMPLETE`.
3. **Tampering between review and packaging.** Three cases: (a) a byte of `research/EVIDENCE.md` changed on disk after the final answer, which the freeze refuses; (b) a change made inside the injected runner's `beforeStart`, before the rehash; (c) a file added under `research/` while the child runs, which the inventory check refuses. None reaches `approved`, and the store's trigger refuses a forged `approved` without the journal row.
4. **Restart mid-review.** Close the store with a write awaiting approval, reopen it (`recoverInterrupted`) and recover: the job is `not_ready` / `REVIEW_INTERRUPTED`, and the prepared write has failed. Retry: the workspace verifies (`continued`), earlier applied edits are kept, and the review completes. A restart during `packaging` re-runs packaging from the stored digest.

Also: the migration from a v3 fixture dumped from unmodified code, all rows kept and the trigger replaced; edges and actors (each refusal); the path allowlist; `run.start` refusing mode `research`; review operations excluded from `changes.list`, `undo` and `requiresReview`; preflight output classification (exit 2, a crash with empty stdout, truncation); argv with `--name=value` only; the token and the user's environment absent from every child environment; cancel during `packaging`; Stop on an `awaiting_review` review run before the freeze and during `packaging` (the run ends `cancelled`, the job `not_ready` / `REVIEW_STOPPED`, and a later `run.start` in the project is accepted); `reviewDiscard` naming only folders of absent or finished jobs; the 1,900-file bound.

Each new test is proven able to fail by a named mutation. Examples: accept `approved` from `reviewing`; skip the inventory comparison; let preflight's exit 1 without JSON pass as a verdict; write the brief directly in the workspace; drop the `beforeStart` rehash; resolve review writes against the project root.

## Rejected alternatives

1. **Review inside the user's project folder.** Imported `AGENTS.md`, skills and hooks would sit in instruction discovery, and the corpus would mix with the user's code and Git.
2. **A Research-Kit review API first (D3 option b).** Narrower, but it needs new kit design and tests. The user chose (a).
3. **Monnzila editing the Markdown itself** (classifying rows, rewriting cells). This is the ad hoc parser the integration review forbids, and it would make Monnzila the author of the review.
4. **A "Package" or "Mark reviewed" button that sets state.** This is the mutable Authorize control (correction 8). Packaging starts only from the review run's end, and its outcome is the kit's.
5. **Running `brief.mjs` in the workspace.** Its write would bypass approval and the journal, and the expected-tree check would then fail by design.
6. **Trusting `create`'s exit code or its printed state line.** Exit 0 includes `PREFLIGHT_BLOCKED`; only validation of the bytes counts.
7. **Running preflight before `create` as a gate.** `create` runs the same gate and records it; a second gate adds a disagreement window and no authority.
8. **Rebuilding the workspace by replaying journaled contents.** Exact, but it needs every write's content across the process boundary and a second code path used only after tampering. Starting `fresh` is simpler, and the journal still records the lost edits.
9. **A separate review table.** Review identity belongs to the job, and the journal already orders every change.
10. **`ON DELETE SET NULL` for the review run.** It would be an unjournaled update, which the v3 trigger aborts.
11. **Keeping `reviewing` through packaging.** A crash could then not tell an unfrozen review from a frozen one, and the digest-gated rule would have no frozen digest to compare.

## Decisions (October 3, 2026)

The open questions are settled here. The user decided the product questions; the lead decided the rest from the code maps and three Research-Kit corpora, each with a passing gate: [SQLite table rebuild](../research/2026-10-03-sqlite-table-rebuild/research/BRIEF.md), [Windows file semantics](../research/2026-10-03-windows-file-semantics/research/BRIEF.md) and [Electron fuses](../research/2026-10-03-electron-fuses/research/BRIEF.md). An external fact below names its corpus and evidence row.

- **Q1, review admission (user).** An inference-only policy edit no longer ends research jobs. `researchAdmission` compares the research setting (`off` / the job's `research_level`) and the trust revision, not the whole policy revision. This applies to collection and review alike. The verification's `projectRevision` binding is unchanged: it stays the job's admitted policy revision.
- **Q2.** `research.review.start` moves to main ownership.
- **Q3.** The review may edit `research/DISCOVERY.md` but not `research/SOURCES.md`. The write allowlist is MAP, EVIDENCE, BRIEF and DISCOVERY, checked before an operation is prepared.
- **Q4.** No new setting. The run uses `modelStepBudget` and `runDurationMinutes`, a budget end is `REVIEW_BUDGET_EXCEEDED`, and a retry continues with the kept edits.
- **Q5.** One migration, v4. Task 4 put the verification in the journal, not a column, so `research_readiness_digest` compares `reviewed_package_sha256` with the collected digest read from that job's `collecting → collected` event (`json_extract(detail, '$.verification.artifactSha256')`).
- **Q6.** After a restart, an `approved` job whose retained reviewed bytes no longer validate shows "stale". There is no `approved → not_ready` edge.
- **Q7 (user).** `research.purge` deletes only retained ZIPs, including unreferenced ones from repeated packaging. The job and its journal stay, and only finished jobs are purged.
- **Q8.** `create` carries `runUrl`, `htmlUrl` and `apiVersion` from the collected manifest when present, as the kit's own `repackageArgs` does. Otherwise the kit's defaults apply.
- **Q9.** It is not documented whether a directory guard stops new entries being created in that directory ([Windows file semantics](../research/2026-10-03-windows-file-semantics/research/BRIEF.md), U-03: KNOWN-UNKNOWN). The design keeps relying on inventory equality (packaging step 5). A Windows CI test, `tests/guarded-fs-semantics.test.ts` ("Q9: records whether a new file and subfolder can be created inside a guarded folder"), records the actual behaviour as its day-one check and prints it; it asserts only that the outcome is one of the two, so the design does not depend on it.
- **Q10.** (a) and (b) together. `research_draft_brief` may take `force: true`, run only in its scratch copy and offered as an exact approval that replaces the brief. The freeze runs `preflight.mjs --json` and refuses packaging with `REVIEW_INCOMPLETE` while `hygiene/brief-stale` is reported.

Corrections from the code maps and the research, which this design must honour:

- **Migration (SQLite corpus).** Follow the documented order: E-01 (rebuild steps), E-02 and E-03 (`PRAGMA foreign_keys` is a no-op inside a transaction; `foreign_key_check` reports violations), E-04 (`DROP TABLE` removes the table's indexes and triggers), E-06 (better-sqlite3 transactions).
  - Create `new_research` and `new_research_events` (the latter referencing `research`), copy with explicit column lists, drop the old tables, then rename the new ones. Never rename the old tables away first.
  - Recreate every index and trigger. Assert the schema list and row counts before setting `user_version`.
  - v3 rows in `reviewing` or `approved` cannot exist: no v3 edge reaches either, and `research_readiness_reserved` refuses `approved`. The migration refuses with `MIGRATION_RESEARCH_STATE` if it finds one, rather than guessing a mapping.
  - Day one: `select sqlite_version()` under Electron must be at least 3.26.0 (corpus U-08).
- **Restart.** `recoverInterrupted` interrupts every `awaiting_review` run today. It must keep a run that a `reviewing` or `packaging` job names as `review_run_id`, as this spec says.
- **Cancel.** `run.cancel` of an `awaiting_review` run has no active execution. It needs its own branch, or the run stays `cancelling` and blocks the project with `RUN_ACTIVE`.
- **Protected root.** Writes (`Operations.allowedPath`) and reads (`FileReader`) both treat the whole data folder as protected. Reads report `CONTEXT_PATH_EXCLUDED`, writes `PATH_OUTSIDE_PROJECT`. Both must exempt exactly the review workspace, and `undoAuthority` (which hard-codes `build` and the project root) must use `rootFor(run)`.
- **Budget cause.** Today the step budget and the time limit both end as `BUDGET_EXCEEDED` with no detail. `REVIEW_BUDGET_EXCEEDED` covers both, and the event detail names which one ran out.
- **Kit (code map of the pinned kit).**
  - `artifact.mjs create` can exit 3 after writing its output, so packaging deletes the output on every non-zero exit.
  - The brief's input hash also covers the capture count.
  - Every kit argument is one `--name=value` element.
- **Retained bytes (Windows corpus U-04, U-07, U-10).** Node's rename is `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`. It is not documented as crash-atomic and fails while the destination is open. Describe it as "replace by rename". The re-validation after restart (Q6) and the torn-file replacement in `validate` are the guarantees.

Added to this cycle (user, October 3): packaged builds turn off Electron's code-loading fuses, per the [Electron fuses](../research/2026-10-03-electron-fuses/research/BRIEF.md) corpus.
- Fuses set: `runAsNode`, `enableNodeOptionsEnvironmentVariable` and `enableNodeCliInspectArguments` off; `onlyLoadAppFromAsar` and `enableEmbeddedAsarIntegrityValidation` on. Source: E-01 to E-05.
- A packaged-build check reads them back.
- With these fuses, the e2e `-r` preload cannot be active in a packaged build: `-r` is not an Electron switch (E-03), and `NODE_OPTIONS` is refused (E-01, E-02).

## Schema v4 as built (unit B0, October 3)

Schema v4 follows "Job states and edges" and "Schema v4" above, as amended by Q5. Where the build is stricter than the text, it says so here:

- `research_readiness_digest` also refuses when the job's `collecting → collected` step journaled no package digest, so a missing digest never passes the comparison.
- The `reviewing` check also requires `reviewed_package_sha256` to be null, which is what makes `not_ready → reviewing` fail unless the reviewed fields are cleared. Further checks: `review_run_id` and `review_session_id` are set together, the three reviewed columns are set together, digests are 64 lowercase hex, the validator revision 40 lowercase hex, and `reviewed_bound_revision` is positive.
- `research_reviewed_immutable` freezes the status as well as `review_digest`, the reviewed columns and the review run and session of an `approved` row.
- The store refuses `collected → reviewing` unless `workspace` is `fresh`, and a `reviewedPackage` whose `boundRevision` is not the job's `packaging` revision.
- The store itself refuses `collected → reviewing` and `not_ready → reviewing` with `RUN_ACTIVE` while another job of the project is active, so every caller gets the domain code rather than the `research_active` index's constraint message.
- The store enforces "a job leaves `reviewing` only when its review run is terminal" for every actor: a `reviewing` or `packaging` job moves to `not_ready` or `approved` only while its run is terminal, absent or `awaiting_review` (main's freeze and packaging outcomes); a `queued`, `running`, `awaiting_approval` or `cancelling` run refuses the step with `RUN_ACTIVE`. The engine therefore appends a run's terminal event before the job's edge in the same transaction. Not yet built: ending an `awaiting_review` run when main's step leaves the review (`run.completed` / `run.failed`, *Streaming `research.status`*), which needs a public error code for each job failure.
- `research.transition` refuses `reviewing → packaging` while the review run is not `awaiting_review`. A review step refused by admission is journaled with cause `ADMISSION_CHANGED`; a refused `approved` still records `reviewedPackage`.
- `research.recover` lists a `reviewing` job whose run is terminal or absent in `reviewing`, after moving it to `not_ready` / `REVIEW_INTERRUPTED`.

## Out of scope

- The renderer panel, the approval card's "research workspace" label and the failure text (Task 6).
- Build admission from research readiness (Stage 3).
- Kit changes: a machine-readable review API, a deterministic `createdAt`, a `--json` for `create`.
- Desktop journeys and Windows CI (Task 7).
