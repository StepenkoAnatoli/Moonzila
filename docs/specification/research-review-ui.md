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
| `approved` | "Checking the reviewed package" until the reader answers; then one of three terminal states: "Ready: approved by the Research Kit gate" and the reviewed package digest (first 12 characters) when the reply has `verified: true`; "Unverified: the reviewed package is missing or no longer matches" when the reply has `verified: false` (spec Q6); "Cannot check the reviewed package now" with the error's public message when the call is rejected (validator or redaction unavailable; nothing is known, so it is neither Ready nor Unverified) | **Start review** is not offered; the reader; **Check again** after "Cannot check" |
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
  - `source`: `'collected' | 'workspace' | 'reviewed'`;
  - `verified`: true only when the bytes come from a package the validator verified in this call; always false for `workspace`.
  - `truncated`: true when the redacted text was longer than 262,144 bytes, whether the original document was longer or redaction made it longer.
- Outcomes. Each has one result or one code; no case maps to two.

| Case | Outcome | Public message (new, reader-specific) |
|---|---|---|
| status with nothing to read; a workspace that exists without the document | `DOCUMENT_NOT_AVAILABLE` | "There is no brief or evidence table to read for this research yet." |
| `approved`: the reviewed package is missing, or its bytes no longer verify | result `verified: false`, `text: ''`, `source: 'reviewed'` | none (the panel shows "Unverified") |
| `collected`, or the collected fallback: the package is missing or no longer verifies | `DOCUMENT_UNVERIFIED` | "This document no longer matches what was collected, so it is not shown. Start a new collection." |
| a link, junction, second hard link or replaced file in the workspace | `DOCUMENT_UNSAFE` | "The review workspace changed in a way Moonzila will not read through. Start the review again." |
| the validator cannot run | `RESEARCH_KIT_UNAVAILABLE` | the existing message (install or repair the kit) fits and is reused |
| redaction cannot run (the vault throws `REDACTION_UNAVAILABLE`) | `DOCUMENT_REDACTION_UNAVAILABLE` | "Moonzila cannot check this document for saved keys right now, so it is not shown. Try again after restarting Moonzila." |
| the whole document is larger than 4 MiB | `DOCUMENT_TOO_LARGE` | "This document is too large to show safely." |

- Mapping from the adapter: `verifyRetained` throws `STALE_VERIFICATION` for a missing or non-verifying package (the "missing or no longer verifies" rows) and `INSTALLATION_INVALID` when this machine's kit is at fault (`RESEARCH_KIT_UNAVAILABLE`). `CANCELLED` is not a reader outcome: the reader passes no signal that the panel can abort.
- `STALE_VERIFICATION`, `PATH_OUTSIDE_PROJECT` and `ENCRYPTION_UNAVAILABLE` are never returned by the reader: their messages ("Start a new collection", "The credential was not saved") describe other operations.

**Source, by job status (main decides):**
- `approved`: the retained reviewed package, validated in this call under the binding its approval recorded (the reviewed package's `boundRevision` with the job's journaled verification). The text is extracted only from the buffer the validator returned (`verifyRetained` returns the verified bytes), never by reading the file again. When the package is missing or does not verify, the reply is `verified: false` with empty `text`; that is "Unverified" in section 1. A validator that cannot run is `RESEARCH_KIT_UNAVAILABLE`, never "Unverified".
- `reviewing`, `packaging`, `not_ready`: the review workspace file (`research/BRIEF.md` or `research/EVIDENCE.md`), `verified: false`. It falls back to the collected package only when the workspace folder does not exist; any containment failure is `DOCUMENT_UNSAFE`, never a fallback.
- `collected`: the retained collected package, validated in this call under the job's journaled binding (`research.review.context` `verification`), text from the returned buffer.
- Any other status: `DOCUMENT_NOT_AVAILABLE`.
- No receipt cache: every call validates. The validator runs once per call, and the panel calls it only when a reader opens or an `approved` job is shown.

**Workspace read (main helper, B11).** It cannot reuse the engine's `FileReader`, which requires a running run.
- Before opening: the workspace root and every folder from the data folder down to it is a real directory (lstat, no link or junction), and `realpath(root)` equals the expected path (case-insensitive on Windows). This is the same rule as main's `containedFolder` (review spec "Phase 3 as built").
- The document path is fixed (`research/BRIEF.md` or `research/EVIDENCE.md`), and every component below the root is lstat-checked: no link, no junction.
- Open, then `fstat` the handle: a regular file with one link (`nlink` 1), whose identity (device and inode, or Windows file id) matches the lstat taken before opening.
- Read the whole document from that handle, at most 4 MiB plus one byte; more is `DOCUMENT_TOO_LARGE`. The whole document is needed because redaction runs before the cut (below).

**Redaction, then the cut.** The order is fixed: decode the whole document, redact it, then cut it.
1. Decode the whole document (at most 4 MiB) as UTF-8.
2. Pass the whole text through the vault redactor (the same `redact` main applies to preflight findings). A secret can therefore never straddle the cut: no bounded read happens before redaction, so no secret is split before it is matched. Lookahead was set aside because replacements that shrink the text can move an unmatched secret prefix from past the window to before the cut.
3. Cut the redacted text to at most 262,144 UTF-8 bytes at a character boundary. `truncated` is true when the redacted text was longer, including when redaction itself expanded it past the cap (a secret shorter than `[redacted]`). The cap is checked on the final text, after redaction.
4. If redaction is unavailable, the call fails with `DOCUMENT_REDACTION_UNAVAILABLE` and returns no text.

Results carry only redacted text. Error messages and error data never carry document text.

Exact-match redaction cannot catch a fragment of a secret that the document itself holds (for example its first half). That is the vault redactor's existing limit everywhere it is used, not this reader's; it is recorded, not changed here.

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

**Never while other work runs (user, 2026-10-04).** `project.policy.update` cancels every active run in the project (`src/engine/application.ts:222`, `cancelProject`), so switching could end an unrelated Ask, Plan or Build run. Main stops runs even earlier: before forwarding the update to the engine, its route (`src/main/index.ts`, `handle`) aborts every active run's capability signal in the project, revokes their vault contexts and holds the collector and review supervisors. A guard in the engine alone would refuse after those runs were already stopped. So the refusal happens in main, before anything is stopped (unit B8e):
1. **One project lock.** Main takes a per-project lock for `project.policy.update`. Main's `run.start` route takes the same lock for the run's project, so no run can be admitted between the check and the stop. `research.review.start` (a `research` run) does not need it.
2. **Check first.** Under the lock, before any abort, revoke or hold, main reads the project's current policy and active runs from the engine. If the update changes only `research` and an active run's mode is not `research`, main returns `RUN_ACTIVE` and touches nothing: no signal aborted, no vault context revoked, no supervisor held, no run cancelled, the policy unchanged.
3. **Then stop and forward.** Otherwise main aborts, revokes and holds as today, forwards to the engine, and releases the lock when the engine answers.
4. **The engine re-checks.** The engine applies the same rule in `project.policy.update` and refuses with `RUN_ACTIVE` before `cancelProject`, so a caller other than main's route cannot bypass it.
- An update that changes `inference` keeps today's behaviour: it stops every run, as the 2026-10-03 decision requires.
- The panel shows the refusal as "Finish or stop the running task first" and does not retry.
- Turning research off while a review run is active is allowed, because stopping research is the point of it.

**What it cannot stop.** Both confirmations say that a collection already started on GitHub keeps running there; Moonzila stops following it and does not use its result.

**Never offered:** `private-connected`. An untrusted project shows the existing "Trust this project" text and no switch.

## 5. Units, contracts and tests

**Lead contract first**
- `research.document.read` in `src/shared/params.ts`: the method, its owner `main`, and the params and result schemas.
- The new public codes and messages in `src/shared/errors.ts` and `src/main/bridge.ts`: `DOCUMENT_NOT_AVAILABLE`, `DOCUMENT_UNVERIFIED`, `DOCUMENT_UNSAFE`, `DOCUMENT_REDACTION_UNAVAILABLE`, `DOCUMENT_TOO_LARGE`.

**Units**

| Unit | Owns | Pre-mortem: how it most likely fails review |
|---|---|---|
| B11 reader | `src/main/` reader and wiring, tests | Reads the workspace without the containment and file-identity checks, or with a path from the request. Calls bytes "verified" without validating in this call, or extracts from a second read of the file. Lets text through unredacted. |
| B4 panel | `ResearchPanel.tsx`, `research-text.ts`, `App.tsx` (Open review), tests | Offers Start review in a status the engine refuses. The failure map drifts from `REVIEW_FAILURES`. Renders reader text as markup. |
| B4b card label | `ChangesPanel.tsx`, tests | Labels by session title instead of run `mode`. |
| B8 switch | `ResearchPanel.tsx` switch section (after B4), tests | Sends `inference` changed or `private-connected`. Turns research off without the confirmation. Retries after `RUN_ACTIVE`. |
| B8e policy guard | main's route for `project.policy.update` and `run.start` (moved from `src/main/index.ts` into a testable module, for example `src/main/policy-route.ts`, with the engine, vault, active runs and supervisors injected), the engine re-check in `src/engine/application.ts`, tests | Checks in the engine only, after main already aborted signals and revoked grants. Checks without the lock, so a run starts between check and stop. Refuses a change that also changes `inference`, or lets a research-only change through while a Build run is active. |

**Tests**
- Each unit's renderer tests use the existing jsdom bridge pattern (`tests/research-panel.test.tsx`).
- B11 runs against the real pinned kit with the collected fixture package, and covers:
  - each source;
  - a tampered reviewed package (Unverified);
  - tampering between validation and extraction, where the text must still come from the verified buffer;
  - an absent workspace (fallback) against a junctioned or hard-linked workspace file (refusal);
  - a synthetic vault secret in `BRIEF.md`, redacted in the result and absent from errors;
  - a secret straddling byte 262,144: no prefix of it appears in the result;
  - a document under the cap that redaction expands past it (many short secrets): the result is at most 262,144 bytes and `truncated`;
  - redaction unavailable: `DOCUMENT_REDACTION_UNAVAILABLE`, no text;
  - an approved package deleted, and one tampered: `verified: false`, empty text, no error;
  - a collected package deleted: `DOCUMENT_UNVERIFIED`; a validator that cannot run: `RESEARCH_KIT_UNAVAILABLE`; neither carries document text;
  - a document over 4 MiB: `DOCUMENT_TOO_LARGE`;
  - multibyte text at the 262,144-byte boundary (valid UTF-8, `truncated`).
- B4 tests "Checking", then each of "Ready", "Unverified" and "Cannot check" (a rejected call), and discarding a stale reply.
- B8e tests, through main's real route module (not the engine alone):
  - a research-only change during a Build run is refused, and afterwards the run's signal is not aborted, its vault context is not revoked, neither supervisor was held, the run is still running and the policy is unchanged;
  - a `run.start` issued while a policy update holds the lock is admitted only after it, so the check cannot miss it;
  - a research-only change during a review run goes through; an inference change still stops every run;
  - the engine re-check refuses the same change sent to the engine directly.
- One new e2e journey: turn research on through the confirmation, then read the brief of a collected job.
- Every new test fails with the guard it names removed.

## Out of scope

- A diff view for edits; the full current and proposed text stays.
- Showing the review run's progress inside the panel; it is in the conversation.
- `private-connected` research.
- `research.purge` (Phase 5).
