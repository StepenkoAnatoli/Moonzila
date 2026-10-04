# Research review UI and research switch (Task 5, Phase 4)

The renderer side of the research review ([research review](research-review.md)) and the switch that turns research on for a project. The user approved this design on 2026-10-04. The engine and main sides are built (Phases 1-3); this phase adds no new job states, edges or kit behaviour.

Three choices frame it (user, 2026-10-04):
- **Panel plus conversation.** The Research panel starts, follows, cancels and explains a review. The model's work and the approval of its edits stay in the review conversation, "Review: <topic>", which Phase 3 already creates.
- **A reader** for the brief and the evidence table.
- **The research switch lives in the Research panel.** Its confirmation offers only `public-technical`, as decided on 2026-10-03.

## What exists (read on 2026-10-04)

- **The Research panel** (`src/renderer/ResearchPanel.tsx`):
  - It is opened from the details pane in a modal (`src/renderer/App.tsx`, `researchDialog`).
  - It takes job notices from `onResearch` and lists jobs with `research.list`.
  - It explains collection failures only (`src/renderer/research-text.ts` `RESEARCH_FAILURES`).
  - It shows a placeholder for evidence and brief reading.
  - When research is off it shows dead-end text.
- **Approvals** (`src/renderer/ChangesPanel.tsx`):
  - A card shows "Review edit · <path>", the current and proposed text in full, and Decline / Approve. These call `approval.decide`.
  - It is mounted for the open conversation's active run.
  - `RunSchema.mode` (`src/shared/contracts.ts`) includes `research`.
- **Renderer methods:**
  - `research.review.start {researchId, profileId}` is main-owned.
  - `ResearchSchema` carries `reviewSessionId`, `reviewRunId`, `reviewedPackageDigest` and `failure`.
  - Nothing reads a job's documents.
- **Policy:** `project.policy.update {inference, research}` exists, but no UI sets `research`.

## 1. Panel: the review flow

The panel shows the current job (the first active one, otherwise the newest), as today, with these additions by status:

| Status | Shows | Actions |
|---|---|---|
| `collected` | "Collected" and the reader (section 3) | **Start review**, with a model picker |
| `reviewing` | "Under review" | **Open review**, **Cancel review** |
| `packaging` | "Packaging the review" | **Cancel review** |
| `approved` | "Checking the reviewed package" until a live verification answers; then "Ready: approved by the Research Kit gate" and the reviewed package digest (first 12 characters) only if it verified, otherwise "Unverified: the reviewed package no longer verifies" (spec Q6) | **Start review** is not offered; the reader |
| `not_ready` | the failure explanation (below) and the reader | **Start review** (a retry, continued where the workspace verifies) |

**Model picker**
- It lists the existing model profiles.
- When the project allows local inference only, cloud profiles are shown disabled, with the reason, rather than letting the engine refuse with `CLOUD_NOT_ALLOWED`.

**Start errors**
- Start errors (`REVIEW_NOT_AVAILABLE`, `RUN_ACTIVE`, `REVIEW_WORKSPACE_TOO_LARGE`, `STALE_VERIFICATION`, `RESEARCH_KIT_UNAVAILABLE`, `CLOUD_NOT_ALLOWED`, `PATH_OUTSIDE_PROJECT`, `ENGINE_UNAVAILABLE`) show the public message the bridge already maps.

**Readiness is never shown from status alone.** The durable `approved` status is not enough (review spec: "ready" only while main holds a live verification). When the panel shows an `approved` job it calls `research.document.read` for the brief at once. It shows "Ready" only when that reply has `verified: true`. Each reply is matched to the job's `researchId`, `revision` and `reviewedPackageDigest`; a reply for anything else, or arriving after the job changed, is discarded.

**Open review**
- It closes the modal and opens the conversation `reviewSessionId` in the workbench.

**The cancel button**
- Its label follows the status: "Cancel collection" for `queued`, `dispatching` and `collecting`; "Cancel review" for `reviewing` and `packaging`.

**Failure texts**
- `RESEARCH_FAILURES` gains one actionable entry for each of:
  - every review failure in `REVIEW_FAILURES` (`src/engine/review-contract.ts`);
  - the admission codes a review can end in (`POLICY_CHANGED`, `TRUST_CHANGED`, `RESEARCH_NOT_ALLOWED`, `PROJECT_UNTRUSTED`, `PROJECT_NOT_FOUND`);
  - `RESEARCH_KIT_UNAVAILABLE`.
- Each entry says what happened and what to do next; for most, that is starting the review again.
- A test keeps the map complete against `REVIEW_FAILURES`, as one already does for collection.

**No decision controls**
- The panel never offers an "authorize" or "approve" control. Readiness is derived by the kit and the validator (plan Task 6).
- The current panel test forbids any button whose text matches review, approve or authori[sz]e. It changes to:
  - allow exactly **Start review**, **Open review** and **Cancel review**;
  - keep forbidding "authorize" and "approve".

## 2. Approval card in a review run

- **Label:** when the card's run has `mode` `research`, its label reads "Research workspace · <path>" instead of "Review edit · <path>". A review edit never reads like an edit to the user's project.
- **Unchanged:**
  - buttons, text and `approval.decide`;
  - review edits are already excluded from the project's change list, undo and recovery (review spec "The review run").

## 3. Reader: brief and evidence

**Contract (lead, before the builders):** a main-owned method `research.document.read`.
- Params: `{researchId, document: 'brief' | 'evidence'}`. The renderer never names a path.
- Result:
  - `text`: string, valid UTF-8 of at most 262,144 bytes (256 KiB), cut at a character boundary, never inside one;
  - `truncated`: true when the document was longer than that;
  - `source`: `'collected' | 'workspace' | 'reviewed'`;
  - `verified`: true only when the bytes come from a package the validator verified in this call; always false for `workspace`.
- Errors: `REVIEW_NOT_AVAILABLE` for a status with nothing to read; `STALE_VERIFICATION` when a retained package is gone; `PATH_OUTSIDE_PROJECT` for a containment failure; `RESEARCH_KIT_UNAVAILABLE` when the validator cannot run; `ENCRYPTION_UNAVAILABLE` when redaction cannot run.

**Source, by job status (main decides):**
- `approved`: the retained reviewed package, validated in this call under the binding its approval recorded (the reviewed package's `boundRevision` with the job's journaled verification). The text is extracted only from the buffer the validator returned (`verifyRetained` returns the verified bytes), never by reading the file again. When it does not verify, the reply is `verified: false` with empty `text`. That is "Unverified" in section 1.
- `reviewing`, `packaging`, `not_ready`: the review workspace file (`research/BRIEF.md` or `research/EVIDENCE.md`), `verified: false`. It falls back to the collected package only when the workspace folder does not exist; any containment failure is a refusal, never a fallback.
- `collected`: the retained collected package, validated in this call under the job's journaled binding (`research.review.context` `verification`), text from the returned buffer.
- Any other status: `REVIEW_NOT_AVAILABLE`.
- No receipt cache: every call validates. The validator runs once per call, and the panel calls it only when a reader opens or an `approved` job is shown.

**Workspace read (main helper, B11).** It cannot reuse the engine's `FileReader`, which requires a running run.
- Before opening: the workspace root and every folder from the data folder down to it is a real directory (lstat, no link or junction), and `realpath(root)` equals the expected path (case-insensitive on Windows). This is the same rule as main's `containedFolder` (review spec "Phase 3 as built").
- The document path is fixed (`research/BRIEF.md` or `research/EVIDENCE.md`), and every component below the root is lstat-checked: no link, no junction.
- Open, then `fstat` the handle: a regular file with one link (`nlink` 1), whose identity (device and inode, or Windows file id) matches the lstat taken before opening.
- Read at most 262,145 bytes from that handle, so truncation can be detected.

**Redaction.** Before any text leaves main it passes through the vault redactor (the same `redact` main applies to preflight findings). If redaction is unavailable, the call fails with `ENCRYPTION_UNAVAILABLE` and returns no text. Neither results nor error messages ever carry document text.

**Display**
- Untrusted plain text in a scrollable `<pre>`, through `displayText` (direction controls removed).
- No links, no markdown rendering, no HTML.
- The source and the verification state are shown above the text.

## 4. Research switch

**When research is off**
- The panel shows **Allow research** in place of the dead-end text. It opens a confirmation that says:
  - the topic, queries and URLs of a collection are sent to the user's collector repository on GitHub and are readable there;
  - only public web pages are fetched;
  - no project files are sent.
- Buttons: **Cancel** and **Allow public research**.
- The second calls `project.policy.update` with the current `inference` unchanged and `research: 'public-technical'`.

**When research is on**
- A small **Turn research off** opens a confirmation warning that waiting and running research jobs, collections and reviews, stop.
- It calls `project.policy.update` with `research: 'off'`.

**Never while other work runs (user, 2026-10-04).** `project.policy.update` cancels every active run in the project (`src/engine/application.ts`, `cancelProject`), so switching could end an unrelated Ask, Plan or Build run.
- The engine refuses a policy update that changes only `research` with `RUN_ACTIVE` while the project has an active run whose mode is not `research` (unit B8e).
- The panel shows the refusal as "Finish or stop the running task first" and does not retry.
- Turning research off while a review run is active is allowed, because stopping research is the point of it.

**What it cannot stop.** Both confirmations say that a collection already started on GitHub keeps running there; Moonzila stops following it and does not use its result.

**Never offered:** `private-connected`. An untrusted project shows the existing "Trust this project" text and no switch.

## 5. Units, contracts and tests

**Lead contract first**
- `research.document.read` in `src/shared/params.ts`: the method, its owner `main`, and the params and result schemas.
- Its public errors already exist.

**Units**

| Unit | Owns | Pre-mortem: how it most likely fails review |
|---|---|---|
| B11 reader | `src/main/` reader and wiring, tests | Reads the workspace without the containment and file-identity checks, or with a path from the request. Calls bytes "verified" without validating in this call, or extracts from a second read of the file. Lets text through unredacted. |
| B4 panel | `ResearchPanel.tsx`, `research-text.ts`, `App.tsx` (Open review), tests | Offers Start review in a status the engine refuses. The failure map drifts from `REVIEW_FAILURES`. Renders reader text as markup. |
| B4b card label | `ChangesPanel.tsx`, tests | Labels by session title instead of run `mode`. |
| B8 switch | `ResearchPanel.tsx` switch section (after B4), tests | Sends `inference` changed or `private-connected`. Turns research off without the confirmation. Retries after `RUN_ACTIVE`. |
| B8e engine guard | `src/engine/application.ts` (`project.policy.update`), tests | Refuses a change that also changes `inference`, or lets a research-only change through while a Build run is active. |

**Tests**
- Each unit's renderer tests use the existing jsdom bridge pattern (`tests/research-panel.test.tsx`).
- B11 runs against the real pinned kit with the collected fixture package, and covers:
  - each source;
  - a tampered reviewed package (Unverified);
  - tampering between validation and extraction, where the text must still come from the verified buffer;
  - an absent workspace (fallback) against a junctioned or hard-linked workspace file (refusal);
  - a synthetic vault secret in `BRIEF.md`, redacted in the result and absent from errors;
  - redaction unavailable (refusal);
  - multibyte text at the 262,144-byte boundary (valid UTF-8, `truncated`).
- B4 tests "Checking", then "Ready", then "Unverified", and discarding a stale reply.
- B8e tests a research-only change refused during a Build run and allowed during a review run, and an inference change unaffected by the rule.
- One new e2e journey: turn research on through the confirmation, then read the brief of a collected job.
- Every new test fails with the guard it names removed.

## Out of scope

- A diff view for edits; the full current and proposed text stays.
- Showing the review run's progress inside the panel; it is in the conversation.
- `private-connected` research.
- `research.purge` (Phase 5).
