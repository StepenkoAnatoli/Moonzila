# Review of two proposals (2026-10-10)

**What was checked.** Two documents the owner uploaded on 2026-10-10. Unchanged copies are in `reports/inputs/`:

1. "Moonzila advisory UI design note - stored-preview vs generate-path", from the SmartRouter project (`inputs/2026-10-10-advisory-ui-design-note.txt`).
2. "Moonzila Maintenance - proposed plan", a self-check proposal (`inputs/2026-10-10-maintenance-selfcheck-plan.txt`).

Both were checked against:
- Moonzila `main-axuse` at 71436b5. That is two research-document commits after b490e50; `src/`, `scripts/`, `tests/`, `e2e/` and `.github/` are identical to b490e50.
- SmartRouter at 9b4bd68, the commit the note names, and at its head ac59658.

**How.** Each document was split into single claims: citations of SmartRouter, facts about Moonzila's code, design rules and proposals. Each claim was checked by trying to refute it from the files, and was given one verdict:
- **VERIFIED**: the cited files say it.
- **PARTLY**: the core holds, but a part that matters does not.
- **WRONG**: the files contradict it.
- **NOT-CHECKABLE**: it depends on something no repository shows.
- **MISSING**: used where a document states a requirement on Moonzila rather than a fact about it; Moonzila does not have the required piece today.

Each document was then read through two design lenses:
1. Does it fit Moonzila's code and invariants?
2. Does it fit Moonzila's work queue and the user's recorded decisions?

Nothing was built or run. Statements about runtime behaviour come from reading the code.

**Bottom line.**
- **Advisory UI note.** It restates four real SmartRouter rules correctly, but it is not ratified, it has several citation errors, and it assumes host pieces Moonzila does not have. Recommendation: do not adopt it as an implementation spec; take its four rules into More models direction 3 as constraints, at the Mandate.
- **Maintenance plan.** Its picture of Moonzila is mostly accurate and its principles fit Moonzila's rules. As a build plan, though, it conflicts with recorded user decisions, and from stage 2 on it needs pieces Moonzila lacks (its first two Quick-check items wait for Stage F). Recommendation: once you approve their wording, record its principles as your decisions, and split the work across Stage F2 diagnostics, a GitHub-run Full check, Self-unblocking and missions.

**How to read the citations.**
- Moonzila paths are relative to the repository root.
- `jobs-plan:N` is line N of `docs/superpowers/plans/2026-10-02-research-jobs.md` as committed in the same pull request as this review (the version with the 2026-10-05 correction under "More models").
- `SR plan:N` is line N of SmartRouter `docs/DEVELOPMENT_PLAN.md` at 9b4bd68. At ac59658 the file differs in two lines only (`git diff --stat`: 2 insertions, 2 deletions), none of them cited here.
- `SKILL.md:N` and `gates.md:N` are SmartRouter `skills/smart-router/SKILL.md` and `skills/smart-router/references/gates.md` at 9b4bd68. Nothing under `skills/` changed up to ac59658.
- `note:N` is line N of the uploaded advisory-note copy. `mplan:N` is line N of the uploaded maintenance-plan copy.
- `wire BRIEF`, `shortlist BRIEF` and `pricing BRIEF` are the `research/BRIEF.md` files of `docs/research/2026-10-05-provider-wire-formats`, `docs/research/2026-10-05-coding-model-shortlist` and `docs/research/2026-10-02-model-pricing-and-ranking`.

---

## 1. Advisory UI design note (SmartRouter, Phase 6)

**What it proposes.** There are two ways to show a SmartRouter routing recommendation in Moonzila:
- **Path A** shows a stored recommendation with no new model call.
- **Path B** generates a fresh recommendation, and only with explicit permission and accounting.

A stored recommendation becomes stale when any revision it was bound to changes. Records never carry secrets.

### What holds

**Provenance**
- **The note is a SmartRouter document. VERIFIED.**
  - It is inside the committed release zip `tools/release/SmartRouter-v1.0.0-pilot.zip`, as `docs/MOONZILA_ADVISORY_UI.md` (9,879 bytes). The zip was added in 1d3b9b6 and is present at ac59658.
  - The zip's SHA-1, 920007b8af24a3fc02430257fbe39ad37d5f47ec, matches SmartRouter `docs/PROJECT_COMPLETION.md:74`.
  - SmartRouter's handoff points to it (`docs/HANDOFF_MOONZILA.md:18-20`, `docs/PROJECT_COMPLETION.md:28`).
  - It is in no git tree: not at 9b4bd68, not at ac59658, and not in the v1.0.0-pilot tag tree (26 files, no zip).
  - The upload is a rendered copy of the zip's text. The differences are rendering artifacts ("text / Copy" at note:29-30) and one shortened section name: "[Boundaries]" at note:73, where zip line 134 reads "Boundaries with sibling skills".
- **9b4bd68 is SmartRouter's "pinned main". VERIFIED.** It is the PR #5 merge ("Merge pull request #5 from StepenkoAnatoli/amend/phase3-ratification"), and SmartRouter's own text calls it pinned main (`tools/patch_phase3_tasks_and_seeds.py:33-34` at ac59658). Ancestry is covered in section 4.
- **SKILL.md is SmartRouter's canonical routing skill. VERIFIED.** See SKILL.md:3 ("Canonical fail-closed model-routing policy") and :8 (`authority: canonical`).

**Plan text the note quotes correctly**
- **The six "First advisory UI" fields and the three rules. VERIFIED.** The fields, plus "Display stored previews without inference; generate only with explicit permission/accounting; stale authority invalidates recommendations", match SR plan:346 word for word (note:15).
- **The display/generate split comes from finding F5, "preview versus generation". VERIFIED** (SR plan:42; note:17). The plan never says "stems from"; that link is a fair reading.
- **Fixture S13. VERIFIED** (SR plan:172). It shows a stored recommendation with zero new model calls, blocks Generate before egress, and keeps separate display and generation event traces. The fixtures are written specifications, not executed tests (SR plan:151).
- **"Advisory correctness does not excuse an unauthorized effect". VERIFIED.** V06 establishes it (SR plan:301), with SR plan:106. V05 (SR plan:300) is the contrasting acceptable case.
- **Gate 1 runs before any transmission. VERIFIED.** Gate 1 (permissions, privacy, workflow) runs before any fetch, cache write, embedding or transmission (SKILL.md:33-34), and fixtures S03, S17a and S17b exercise it (gates.md:19-20).
- **Gate 4 blocks strict caps on unknown fees. VERIFIED.** "Unknown/unbounded fees block strict caps" (SKILL.md:40-42).
- **S15a, S15b and S15c are revision flips. VERIFIED.** They flip the authorization/privacy, price and verifier revisions respectively (SR plan:174-176).
- **Receipt rules. VERIFIED.** "No API keys/raw prompts/private bodies/authorization headers/credential URLs. Keep opaque pinned references" (SR plan:133).
- **Plan §12 is the Research-Kit section. VERIFIED** (SR plan:334-336).
- **The plan's §7 outcome classifier covers generating an advisory recommendation. VERIFIED** (SR plan:102-106).
- **The four structural rules all trace to the plan. VERIFIED.** The rules are: separate paths, no inference on display, stale invalidation, and no secret-bearing records. Sources: SR plan:42, :76, :133, :172, :346, :364.

**About Moonzila**
- **Moonzila has a user-approved roadmap, and the note defers to it. VERIFIED.** See `docs/superpowers/plans/2026-09-24-moonaliza.md:9` and jobs-plan:455-457. SmartRouter's plan says the same: "Respect its approved roadmap/research/memory/mission priorities" (SR plan:346).
- **Moonzila has no SmartRouter code, test or spec. VERIFIED.**
  - `git grep -i -E 'smart.?router'` finds nothing in the tracked tree, nor in any of the repository's 55 refs.
  - `git grep` does not see untracked files. The untracked `docs/orchestration/2026-10-05-more-models/RUN.md:27`, the input copy and this review mention SmartRouter; none of them is code, a test or a spec.
  - `src/skills` does not exist.

### What is wrong or unsupported

**Wrong**
- **"Skill-packaging work ... already separately reviewed" (note:10). WRONG.**
  - The only review record is the author's own validation: "it is not an independent review, is not an approval, and does not close Phase 2" (SmartRouter `docs/PHASE2_REVIEW_RECORD.md:4-5` at 9b4bd68).
  - SmartRouter's README still requires "a separately designated non-author review" (`README.md:22-23`).
  - Both files are unchanged at ac59658.
- **`policy=d7c00f9a…` in the UI example (note:38). WRONG as a revision.**
  - No SmartRouter object has that prefix: `git cat-file -t d7c00f9a` fails. The real pin is `d7c00f96…` (SKILL.md:7).
  - That pin is a plan commit with no `skills/` folder, so on its own it cannot identify the skill's bytes.
  - Nobody should copy this string as a real revision.

**Partly right, with a part that matters wrong**
- **Section and phase names. PARTLY.**
  - "Phase 13" (note:12) does not exist. §13 is a section; phases are numbered 0-8 in §14 (SR plan:354-366).
  - The plan calls Phase 6 "optional app advisory" (SR plan:364). The name "First advisory UI" comes from §13 (SR plan:346) and from SmartRouter's later handoff documents (`HANDOFF_MOONZILA.md:18`, `PROJECT_COMPLETION.md:28`).
  - "§13 stage 2" (note:71) does not exist either. That stage is Phase 7 (SR plan:365; `HANDOFF_MOONZILA.md:29`).
- **"Plan §13's first advisory stage is recommendation display only" (note:71). PARTLY.**
  - The stage is advisory and does not execute.
  - It does include a permission-gated generation path: "Authorized generation and inference-free stored display" (SR plan:364; also SR plan:346).
  - The note's own Path B contradicts "display only".
- **The out-of-scope list (note:9). PARTLY.**
  - The first six items are §13's next stage (SR plan:348).
  - "Shared reservations/bounded concurrency" belongs to a later, third stage (SR plan:350).
  - "Engine hosting" is not a stage item. The plan says only that "A hosted engine is not the inevitable endpoint" (SR plan:350).
- **The acceptance gates (note:86). PARTLY.**
  - The six items match SR plan:352.
  - "Assertively, not by description" appears in no SmartRouter file.
  - SR plan:352 closes all of §13, not Phase 6. Phase 6's own exit gate is only "Separate paths; stale preview invalidation; no egress without permission" (SR plan:364). The cancellation, restart and replay checks are Phase 7's (SR plan:365).
  - Read as written, the note loads Phase 7 tests onto a display feature.
- **F5's "premise" (note:68). PARTLY.** The note says a preview must "never substitute for a user-visible authorization". F5 contains no such sentence (SR plan:42); it is the note's own rewording of "must be separately authorized".
- **§4's account of S13 (note:68). PARTLY.**
  - The note says Generate is blocked "when the stored data is local-only".
  - In S13 the stored recommendation is the thing that may be shown. What is local-only is S03's private file, which Generate would send (SR plan:161, :172).
  - The note's own §2 states it correctly.
- **Gate 4 and "auxiliary inference", cited to S06/S07 (note:48). PARTLY.**
  - S06/S07 cover the planner and reviewer roles of a dispatch (SR plan:164-165).
  - The rule that generating a recommendation first needs a cost basis is SR plan:74.
- **"The skill's fresh-binding gate" (note:65). PARTLY.**
  - The skill has exactly five gates ("All five gates must pass", SKILL.md:15).
  - Binding and freshness are handled in step 4, "Reassess" (SKILL.md:47-50), and in a section of `gates.md` that is not a gate (:72-83).
  - The skill defines no fingerprint algorithm and no field list.
- **"Fingerprint composition changes between the S15 revisions and content" (note:79). PARTLY.**
  - The plan defines one fingerprint over content plus every revision (SR plan:88).
  - S15 changes a revision and S16 changes the content. The fingerprint value differs in both cases; how it is built does not.
- **"Revocation always wins (B02c)" (note:58). PARTLY.**
  - The rule itself is SR plan:76 and gates.md:84.
  - B02c (SR plan:297) is a dispatch-time fixture in which a destination is revoked just before sending. It is not about displaying a stored preview.
- **The binding is cited as "plan §5/§7" and includes a conversation revision (note:56). PARTLY.**
  - The binding is in §5 and §6 (SR plan:76, :88), not §7.
  - The conversation revision appears only as a §13 display field (SR plan:346).
  - The note leaves out §5's requirement to record a timestamp and owner-set freshness limits.
- **"No inline 'can dispatch now' assertion" (note:53). PARTLY.**
  - SmartRouter does require a fresh recheck right before dispatch (SR plan:76).
  - §13 lists "actual dispatch availability" as a required UI field (SR plan:346).
  - The workable reading: show availability as a dated observation, never as permission.
- **Profile tuple `(local-L, local, model-L@1, cfg-tools@1)` (note:32). PARTLY.**
  - This is synthetic fixture profile L (SR plan:153).
  - The tuple's second field is the provider, not the locality (SR plan:98). "local" just happens to be L's provider value.
  - Moonzila must not treat a provider field as a privacy class.
- **The stored-record fields (note:51). PARTLY.**
  - They come from the skill's output format (SKILL.md:54-62).
  - The skill records calls as used/limit, not used/remaining. It also requires an Uncertainty field that the note leaves out.
  - The example values ($0.02, six calls) are synthetic fixture defaults (SR plan:155), although the header says "no rate/cost claims" (note:2).
- **Path A's terminal outcome is "n/a (no attempt started)" (note:66). PARTLY.** An advisory answer the user asked for is an artifact with its own outcome even when no new call ran (SR plan:106; V05 at SR plan:300).
- **The advisory-only rule is cited to the skill's "[Boundaries]" section (note:73). PARTLY.**
  - The rule is real: SKILL.md:20-24 and gates.md:86-87.
  - The "Boundaries with sibling skills" section (SKILL.md:90-97) is about sibling skills.
- **"RATIFIED as structure" (note:89) next to "not ratified" (note:2). PARTLY.**
  - Only the four plan-derived rules carry the plan's authority.
  - No owner action ratifies the note. SmartRouter's handoff asks the Moonzila owner to approve it (`HANDOFF_MOONZILA.md:18-20, :26`).
  - The handoff came "via the codebuff agent" (`HANDOFF_MOONZILA.md:4`), and SmartRouter's own rule is that "an agent cannot self-ratify" (`docs/PHASE3_PREREGISTRATION.md:27-28` at 9b4bd68).
  - Safe reading: nothing in the note is approved for implementation.

**What the note assumes about Moonzila**

The note states most of these as requirements, chiefly of Path B, rather than as claims that Moonzila already has them, and its §8 leaves every concrete Moonzila design choice PENDING (note:90). The verdicts below judge whether Moonzila has each piece today.
- **A host accounting path with "full per-call accounting" (note:47, :64). MISSING.**
  - Moonzila has no money accounting, price or cap.
  - It records token usage only after a call (`src/engine/application.ts:363`).
  - Its architecture forbids "an invented exact preflight count" (`docs/ARCHITECTURE.md:7`).
  - `HANDOFF.md:45` lists "provider-specific exact accounting" as still required.
- **A price list or cost basis with a revision (note:15, :80). MISSING.**
  - `ProfileSchema` has no price field (`src/shared/contracts.ts:26`).
  - Prices exist only in a dated research table (pricing BRIEF:86-110).
- **A way to run the skill's semantics (note:48). MISSING.** Moonzila has no skill runtime. `skill.list` is declared (`src/shared/params.ts:139`) but falls through to `NOT_IMPLEMENTED` (`src/engine/application.ts:265`).
- **Explicit permission at call time for a model call (note:47). PARTLY.**
  - Call-time approval exists only for file edits and commands. It is bound to the input hash and to the policy and trust revisions (`src/engine/policy.ts:35-41`).
  - Model calls are admitted by a standing project or conversation policy that is re-checked every step (`src/engine/policy.ts:77`; `src/main/index.ts:90`). That is exactly the "prior consent" the note rules out.
- **Authority/privacy, catalogue, verifier and price revisions (note:56, :80). PARTLY.**
  - Only authority/privacy revisions exist, and every run pins them (`src/shared/contracts.ts:28`).
  - A catalogue revision exists only in code with no production caller (`src/models/catalogue.ts:12, :46`).
  - No verifier or price revision exists.
- **Workspace and conversation revisions to pin and show (note:38). PARTLY.** They exist as integer policy counters pinned to each run (`src/shared/contracts.ts:28`; `docs/ARCHITECTURE.md:17`). They are not content revisions, and the UI never shows them.
- **A "key-value store" or "revision ledger" (note:83). PARTLY.**
  - Moonzila has a strict relational SQLite schema at version 4 (`src/engine/migrations.ts:3`).
  - Policy content is overwritten in place and only the counter moves (`src/engine/application.ts:187, :224`), so a past policy cannot be recovered from its number.
- **A privacy destination (note:15). PARTLY.**
  - Locality is derived from the endpoint's host name (`src/main/inference.ts:18-20`), so a loopback Ollama serving cloud models is labelled "local" (wire BRIEF:45-46).
  - The fail-closed fix is proposed (wire BRIEF:522-523), not built.
- **Actual dispatch availability (note:15). PARTLY.**
  - No function returns it.
  - Only `openai-compatible` and `ollama` run (`src/main/inference.ts:143`).
  - The only live reachability check, `profile.test`, sends a prompt (`src/main/index.ts:271-279`).
- **A profile identity tuple, "not just the model name" (note:78). PARTLY.**
  - A profile has an id, kind, endpoint, model name and an immutable revision id (`src/shared/contracts.ts:26`).
  - It has no model revision and no tool-configuration revision; tools are chosen by run mode (`src/engine/application.ts:339-340`).
- **"Moonzila in this stage does not dispatch" (note:71). PARTLY.**
  - Nothing is SmartRouter-driven.
  - Moonzila does dispatch its own user-picked runs (`src/main/index.ts:95`), with Stop and restart recovery.
  - An advisory UI would sit next to a live dispatch path.
- **No runtime gates have run (note:91). PARTLY.**
  - This is true for a SmartRouter path, because none exists.
  - Moonzila already has no-send and Stop tests for its own runs: `tests/application.test.ts:74`, `tests/provider-transport.test.ts:88`, `e2e/recovery.spec.ts:9`.
- **The S24 condition applies: no selection tool, actual identity unknown (note:73). PARTLY.**
  - No tool lets an agent pick a profile, and Moonzila never reads back which model answered (`src/main/inference.ts:40-41`).
  - Each run is bound to a known profile revision the user picked (`src/renderer/App.tsx:236`; `src/engine/application.ts:235`).
  - Advisory-only still applies to Moonzila, through SR plan:76.
- **Phase 6 is not on Moonzila's roadmap (note:92). PARTLY.**
  - True: no committed Moonzila plan mentions SmartRouter.
  - Overlapping selection work is approved, though: More models direction 3, "Smarter selection" (jobs-plan:410), and the mission planner that picks a profile per agent (jobs-plan:385-390).

### How it would map onto Moonzila

| The note asks for | Moonzila today | Missing |
|---|---|---|
| Requested profile | Each run binds a profile id and revision (`contracts.ts:28`; `application.ts:235`); profile picker (`App.tsx:236`) | Model revision, tool-configuration revision |
| Gate reasons | One host gate, the privacy-policy check (`policy.ts:68-79`), plus `run.start` refusals (`application.ts:228-234`) | Gates 2-5 |
| Cost basis and unknowns | Token usage after the call (`application.ts:363`) | Price, cost basis, accounting |
| Privacy destination | Profile locality from the host name (`inference.ts:18-20`) | Verification; the fail-closed rule (wire BRIEF:522) |
| Actual dispatch availability | Supported kinds (`inference.ts:143`); credential present (`application.ts:134`) | A function that needs no prompt |
| Pinned revisions | Project and conversation policy counters and the trust counter (`contracts.ts:17-21, :28`) | Content revisions; a SmartRouter policy revision |
| Path A, zero new calls | Engine reads touch only the database; all network traffic is in main (`main/index.ts:85-122`) | Anything to display |
| Stale invalidation | Compare-on-use for runs and approvals (`policy.ts:35-41, :75-76`); the live profile pointer, `getProfile` (`store.ts:166`) | Price, catalogue and verifier revisions. A check bound to `profileRevisionId` must compare with the live pointer, `getProfile`, never with `getProfileRevision`, which resolves any superseded revision (`store.ts:167`) |
| No secrets in records | Main-only vault and redaction (`main/vault.ts:183-195`); credential-free URLs (`contracts.ts:10-12`) | Protection for private task text in free-text fields |
| Path B, per-call grant | Approvals exist for read/write/command/research operations, and each needs a project (`migrations.ts:61-62, :71`). Methods carry `authorization` labels such as `user-confirmed` (`params.ts:89-91`), but nothing in `src/` enforces them (problem 4) | A grant kind for inference; enforcement of method authorization labels |
| Path B, skill semantics | None | A skill runtime |
| Separate display and generation events | A run-scoped event log (`migrations.ts:54-55`) | A place for an event that has no run |
| Plan §7 outcome classifier | A single run status (`contracts.ts:15`) | Verification and accounting axes |
| Storage | SQLite schema v4 (`migrations.ts:3`); v5 is reserved for project memory (`docs/specification/project-memory.md:128`) | A new table, and so a later schema step |

### Problems and recommendations (blocking first)

**Blocking**

1. **A second model-selection authority.**
   - SmartRouter's own plan says: "Conflicting selection authorities stop work until explicitly reconciled" (SR plan:50).
   - Moonzila already has or has approved:
     - G08, automatic model selection (`docs/specification/source-plan.md:110`);
     - the selector in `src/models/select.ts`;
     - the mission planner (jobs-plan:385-390);
     - direction 3 (jobs-plan:410).
   - *Recommendation:* decide at the More models Mandate. Make Moonzila's deterministic selector the single authority, and use SmartRouter's five gates as a checklist for the reasons it shows.

2. **Gate 1 cannot run "before any transmission" if the skill is model prompt text.**
   - Prompt text is the only way Moonzila could use a skill: planned Task C3 (`source-plan.md:2177-2205`), with "Skills cannot change permissions" (:2205).
   - The model would judge privacy after the data had already been sent.
   - *Recommendation:* every gate whose inputs the host can see runs as Moonzila code, before any call. Model text is never a gate verdict (G10, `source-plan.md:112`).

3. **Path A cannot work as written.**
   - Nothing produces stored previews.
   - Its validity test compares price, catalogue and verifier revisions that do not exist (note:21). Read strictly, every preview is stale; read loosely, the check is empty. The other way out is a builder inventing constant revisions, and `AGENTS.md:8` forbids manufactured evidence.
   - *Recommendation:* replace stored previews with an eligibility-and-reasons view recomputed on every display from current state, with no model call. The note allows re-deriving (note:83). With nothing stored, nothing goes stale.

4. **"Explicit permission at call time" has no carrier for a model call** (see the table).
   - Method authorization labels are not enforced either. The `authorization` field of `MethodSpec` (`src/shared/params.ts:89-91`) has no reader in `src/`: main routes on `.owner` only (`src/main/index.ts:197`), and the only other reader is a test that checks a label is present (`tests/contracts.test.ts:59`).
   - For example, `session.policy.update` is labelled `user-confirmed` (`params.ts:104`), yet the engine applies it after only an `expectedRevision` check (`src/engine/application.ts:184-187`).
   - So a builder who labels a new generation-grant or standing-approval method `user-confirmed` gets no enforcement from the label (see also section 2, problem 3, and decision 11).
   - *Recommendation:* no model-generated recommendations in the first stage.
   - If they are built later, use a single-use grant bound to the session, the profile revision, an input fingerprint and the policy and trust revisions, checked by code in main before the call, not by a label. That is a new contract and a schema step.

**Important**

5. **The order is backwards.** Each §13 field depends on More models work not yet done:
   - the privacy destination needs the fail-closed locality rule (wire BRIEF:522, scheduled in the brief's decision step 4 at :570);
   - availability needs the cloud presets and their U-06 tool-call runs (shortlist BRIEF:408-413);
   - the cost basis needs a price source.
   - *Recommendation:* any advisory display goes inside direction 3, after those.

6. **The "Fetched: 0 new calls, 0 egress" counter cannot observe egress** (note:39-40).
   - The renderer is sandboxed, and all network traffic happens in main (`src/main/index.ts:303`). The counter would always read 0.
   - *Recommendation:* drop it. Prove "no inference on display" with a test that spies on main's inference and fetch hooks, as `tests/application.test.ts:74` already does for policy.

7. **A display event has nowhere to live.** Every event needs a run (`src/engine/migrations.ts:54-55`).
   - *Recommendation:* display writes nothing. Generation, if ever built, is a normal run with its own events.

8. **Path B would be a model call, so it has to be a Moonzila run**: journal before effect, Stop, restart recovery and the project lock (`AGENTS.md:8`; jobs-plan:391).
   - The one run-less precedent, `profile.test`, skips the policy check (`src/main/index.ts:271-279`).
   - *Recommendation:* if built, make it a run in a mode with no tools, admitted through `run.start`.

9. **Accounting.** As written, Path B can never run, because Moonzila has no accounting.
   - *Recommendation:* the owner decides whether "token count only, cost unknown" is acceptable for an advisory call (decision 8). Never seed the UI or tests with the note's sample values ($0.02, "2/6").

10. **Private content.** The free-text reason fields are model output about the task, so they can quote private input. Redaction removes only stored credentials (`src/main/vault.ts:183-195`).
    - *Recommendation:* store reasons as codes produced by host code wherever possible. Previews belong to their conversation.

11. **The generating call discloses new data.**
    - It would send Moonzila's profile inventory (endpoints, model names, whether a credential is stored) to a model.
    - The cloud consent text covers only "prompts, selected project contents and tool results" (`src/renderer/App.tsx:247`).
    - No local model fits on the user's PC (shortlist BRIEF:335-342), so a local-only project could never generate one.
    - *Recommendation:* keep inventory-dependent checks in host code.

12. **The skill pin is ill-formed, and fetching a skill at runtime is not how Moonzila uses external tools.** The precedent is `scripts/prepare-research-kit.mjs`: pinned by revision plus a reviewed byte inventory.
    - *Recommendation:* if the skill is ever used, vendor it under a reviewed inventory, pinned by content digest plus SmartRouter commit, with its MIT licence recorded (SKILL.md:4).

13. **SmartRouter's own plan argues against approving Phase 6 now.**
    - Its future phases are "options, not commitments": "Simplify/stop if direct is cheaper, fixed rules equally effective, accounting/dispatch absent" (SR plan:368). Moonzila has no money accounting, and exact accounting is still listed as required (`HANDOFF.md:45`).
    - §13's acceptance requires "measured benefit" (SR plan:352). SmartRouter has measured none. Its pilot was non-live, with "real rate-sheet economics unproven" (`docs/PHASE4_PILOT_REPORT.md:55-56` at ac59658). Costs, latency and effort were not measured for the comparison arms, and the report calls its matrix "a coverage ledger, not a comparative measurement" (:90-92).
    - *Recommendation:* this is the strongest support, from inside SmartRouter, for decisions 1(b) and 4.

14. **SmartRouter's decision suite is not evidence for a Moonzila gate.**
    - SmartRouter offers `tests/smart_router_decisions.py` (79 assertions) as validation "on the Moonzila host" (`HANDOFF_MOONZILA.md:31-36`). The file is not at 9b4bd68; the lines below are at ac59658.
    - S13 asserts constants it has just set: `display_calls = 0`, then `expect("S13", display_calls, 0, ...)` (`tests/smart_router_decisions.py:305-309`).
    - S17a and S17b observe no send or fetch. S17a checks a returned route value; S17b compares a null path with a grant (:350-358).
    - `classify_terminal` (:195-211) returns "recommendation only" for every advisory case with no violation and no Stop, and ignores `verification_status` on that path. The plan says a denied generation call yields blocked and unchecked advisory output yields unverified (SR plan:106), so the suite mislabels both.
    - *Recommendation:* treat an exit 0 from this suite as no evidence for any Moonzila gate. Moonzila's own tests must observe its main-process inference and fetch hooks (problem 6). Report the defects back (decision 12).

**Minor**

15. **`run.start` trims the prompt** (`src/shared/params.ts:108`), so leading and trailing whitespace is lost before any fingerprint. That weakens the S16 rule. Fingerprint the raw input, or record the trim as a declared normalization.
16. **Stored observations are shown in the present tense** (note:37). In Moonzila they could only describe the generating run, because the step budget is per run (`src/engine/application.ts:355`). Show them as "as of <time>".
17. **The "RATIFIED" label has no force in Moonzila.** Historical documents "never grant new permissions" (`AGENTS.md:7`).
18. **Folder-free chats have no project, and approvals need one** (`src/engine/migrations.ts:71`). Simplest choice: offer the advisory display in project conversations only.
19. **Two of the skill's routes have no Moonzila meaning yet.** The skill's Route values include `delegate` and `recommend-escalation` (SKILL.md:56). Moonzila cannot act on either before missions, and a local-only project never switches to cloud automatically (G06, `source-plan.md:108`). A display built from the four rules should not show those routes until missions provide an approved path.
20. **"Policy revision" means two things.** SKILL.md:28's "host policy revision" is the host's own policy; the note's "policy revision" (note:78) is the skill's pinned spec revision and commit. Name them differently, for example "SmartRouter skill pin" and "Moonzila policy revision", so a builder does not confuse them.

### Decisions for you

1. **Approve the note?**
   - (a) As-is. That opens a SmartRouter Phase 6 track.
   - (b) Adopt only its four plan-backed rules, as constraints on More models direction 3.
   - (c) Decline it.
   - *Recommendation: (b), answered at the More models Mandate, where `RUN.md:27` already holds the question. SmartRouter's own plan supports it: stop while accounting is absent, and accept only on measured benefit, which SmartRouter has not measured (problem 13).*
2. **Which component is the single model-selection authority?**
   - (a) The SmartRouter skill.
   - (b) Moonzila's deterministic selector, later the mission planner.
   - (c) Both, reconciled in a written decision.
   - *Recommendation: (b).*
3. **Store recommendations, or recompute on display?** *Recommendation: recompute, using no model call. Moot if you take 1(b) and 4: without Path B nothing produces a recommendation to store.*
4. **Model-generated recommendations (Path B) in the first stage?** *Recommendation: no. SmartRouter's own stop rule applies while Moonzila has no accounting (SR plan:368; problem 13). Revisit after missions, only if a measured need appears, and with the grant from problem 4.*
5. **If generation is ever built, are the gates host code or skill text in a prompt?** *Recommendation: host code. Skill text may inform only the difficulty judgement. Moot now if you take 4.*
6. **Source for the cost basis?**
   - (a) The dated pricing research table, labelled as an estimate with its retrieval date.
   - (b) Always "unknown".
   - *Recommendation: (a). Show "unknown" wherever a row is missing, and re-collect quarterly as that brief requires (pricing BRIEF:116). Whether (a) is usable at all depends on decision 7.*
7. **Strict spend caps?** Under SmartRouter's Gate 4, a strict cap with unknown or unbounded fees blocks, and a statement accepting the uncertainty does not waive it (SKILL.md:40-42; S06 and S07 at SR plan:164-165). With strict caps, a dated estimate from 6(a) is not a reliable bound, and Reservations would always read "unknown/blocked".
   - (a) Disclosure only: show the estimate and its date, and enforce no cap.
   - (b) Strict caps now.
   - *Recommendation: (a) now; revisit caps with missions.*
8. **Is "token count only, cost unknown" acceptable for an advisory call?** (problem 9) Moonzila records token usage only after a call (`src/engine/application.ts:363`). *Recommendation: decide only if Path B is ever built; moot now if you take 4.*
9. **How to label the privacy destination until the fail-closed locality rule exists?** *Recommendation: "endpoint on this computer (not verified as local inference)". Never show "local" as a guarantee.*
10. **May a displayed recommendation pre-fill the profile picker?** *Recommendation: only from Moonzila's own deterministic eligibility display. Never pre-fill from SmartRouter output or model-generated text: model output and skills cannot grant permissions (G10, `source-plan.md:112`), and a local-only project never switches to cloud automatically (G06, :108). Send stays the only way to dispatch, and the existing policy re-checks still apply (`src/main/index.ts:90`; `src/engine/application.ts:230`).*
11. **Record the unenforced method authorization labels as a known gap or as a defect?** (problem 4) *Recommendation: as a defect, recorded before any method that grants inference or a standing approval is added. Until it is fixed, no new method may rely on its label for enforcement.*
12. **Report the citation errors back to SmartRouter?** *Recommendation: yes, as a short list:*
    - "already separately reviewed";
    - `d7c00f9a`;
    - "Phase 13" and "stage 2";
    - "display only";
    - "[Boundaries]";
    - tuple field 2 is the provider;
    - the Phase 6 versus Phase 7 acceptance scope;
    - `HANDOFF_MOONZILA.md:18, :26` point to `docs/MOONZILA_ADVISORY_UI.md`, which is in no git tree, only inside the committed release zip;
    - Phase 2's status is inconsistent at ac59658: "Closed" in `PROJECT_COMPLETION.md:12`, but not independently reviewed in `README.md:19-23` and `PHASE2_REVIEW_RECORD.md:4-5`;
    - the decision-suite defects in problem 14 (S13, S17a/b, `classify_terminal`);
    - the note says it was prepared on 9b4bd68, but the release was tagged later, at b6e04fd after PRs #8 and #9 (`PROJECT_COMPLETION.md:13, :70`). The cited plan text and the skills are unchanged between the two (only two uncited fixture lines differ), so nothing in this review changes, but the note's provenance line is out of date.

*Rough size, for comparison (reviewer estimates, not measured):*
- an inference-free eligibility display: 6-9 files, 1-2 contracts, 0-1 schema steps, 3-4 test files;
- Path A as the note describes it: 10-14 files, and still nothing to show;
- Path A plus Path B: 25-35 files, 5-7 contracts, 2 schema steps, 10+ test files.

---

## 2. Maintenance self-check plan

**What it proposes.** A Maintenance section that checks Moonzila on a schedule. It has two kinds of check:
- an installed-app check: files, startup health, diagnostics, updates;
- a developer self-test in a source checkout: the CI steps, break-tests, and AI-proposed patches.

The default is report-only. Patches are never merged or installed automatically. Delivery comes in six stages, with trusted repair and updates last.

### What holds

**Facts about Moonzila**
- **The Windows CI workflow exists and contains every step the plan lists (mplan:40). VERIFIED.** All are in `.github/workflows/windows.yml`:
  - dependency setup (:14-17, :20-21);
  - native helper (:22);
  - pinned Research-Kit validator (:23-24). It provisions the validator and checks its bytes; it does not run it on a corpus;
  - typecheck (:25), lint (:26), tests (:27), build (:28);
  - runtime check (:29);
  - desktop journeys (:30).
  
  The packaging, fuse and packaged-app steps run only on manual dispatch (:31-53).
- **The repository has a Windows gate. VERIFIED.** See `AGENTS.md:42` ("Acceptance") and the merge rule at `AGENTS.md:19`. The list titled "Quality gate" (`AGENTS.md:48-58`) is a different list, run on Linux.
- **Break-test guidance exists but is not an in-app feature. VERIFIED.** It is a skill (`AGENTS.md:29`; `.claude/skills/break-test/SKILL.md`), and `src/` has no break-test code. In-app break-test is a recorded later decision (jobs-plan:462).
- **Diagnostics, updates, signing and broader installed-app qualification are listed as unfinished. VERIFIED** (`HANDOFF.md:48, :88`; `docs/development-status.md:172`). The code agrees:
  - `diagnostics.export` is declared (`src/shared/params.ts:153`) but has no handler and falls through to `NOT_IMPLEMENTED` (`src/main/index.ts:298`);
  - `electron-updater` is a dependency (`package.json:30`) that nothing imports;
  - the installer is unsigned (`docs/releases/0.8.1-dev.1.md:11`).
- **No maintenance or self-check feature exists today (mplan:103). VERIFIED.** The word "maintenance" in the code means other things: the runtime-stop lease (`src/engine/scheduler.ts:29, :65-66`) and the undo/recovery busy set (`src/engine/operations.ts:37`).
- **No research exists on Windows scheduling, signing, updates or rollback. VERIFIED.** None of the 18 corpora under `docs/research/` covers them. The two fuse corpora list code signing as out of scope.
- **`src/engine/scheduler.ts` exists and is not a time-of-day scheduler. VERIFIED.** It is a bounded first-in-first-out lease queue with relative deadlines (`scheduler.ts:43, :83`).
- **An installed copy cannot run the test suite (mplan:12). VERIFIED.** The installer ships only `dist/**` and `package.json` inside an asar (`electron-builder.yml:5-9`), and loads only from it (:22).

**Principles that fit Moonzila's rules** (judged for fit, not as facts)
- **Separating the installed-app check from the developer self-test** matches the packaging facts above.
- **Report-only by default, and the AI never silently replaces, merges or publishes** (mplan:69). This matches "Moonzila never merges" (jobs-plan:425), G22 (`source-plan.md:124`) and `AGENTS.md:8`.
- **Keeping maintenance out of `scheduler.ts`** (mplan:73) is right. Its "maintenance" kind stops the model runtime and refuses inference (`scheduler.ts:65-71`), which would break the plan's own "do not interrupt inference" (mplan:95).
- **A closed app records the missed run and runs it at the next start** (mplan:25). This matches main's reconcile-at-start pattern (`src/main/index.ts:134-135`; `src/engine/index.ts:15`). It fits only with the limit in problem 13: one run for a missed due time, opt-in, never for an interrupted run.
- **Environment failures reported as Blocked, against a baseline** (mplan:44, :98). This matches `AGENTS.md:60-64`. It fits only under another name, because BLOCKED is taken (problem 18).
- **Research before choosing Windows mechanisms** (mplan:86). This matches Moonzila's research-first rule.

### What is wrong or unsupported

**Missing for the Quick check**

The plan does not claim these exist: it lists diagnostics, updates and signing as unfinished (mplan:103), and it holds trusted repair until the release path supports verification (mplan:91). But its first two Quick-check items (mplan:33-34) have no data source until Tasks F2 and F3, so a stage-2 Quick check (mplan:87) cannot do them.
- **Verifying files against a trusted release manifest, and asking whether a trusted official update is available (mplan:33, :9). MISSING until Tasks F3 and F1.**
  - Packaging uses `--publish never` (`package.json:23`), and `electron-updater` is unused (`package.json:30`).
  - Releases carry a `SHA256SUMS.txt` for the installer only, and are unsigned (`docs/releases/0.8.1-dev.1.md:9, :11`).
  - The update feed and the signing identity are external inputs that nobody has supplied yet (`source-plan.md:3812-3814`).
- **Checking whether the previous run or startup recorded a crash, and reading "saved diagnostics" (mplan:34, :9). MISSING until Task F2.**
  - No diagnostics are saved: `diagnostics.export` is not implemented.
  - `src/` has no crash reporter and no process-loss handler.
  - Engine restarts (up to three) are not recorded (`src/main/engine.ts:89-95`).
  - The nearest existing record: at each engine start, active runs become "interrupted" and started operations "unknown" (`src/engine/store.ts:382-399`). That record exists only if a run was active, and it cannot tell a crash from a shutdown.

**Partly right, with a part that matters wrong**
- **A local Full check that uses "the existing Windows CI workflow as the source of truth" (mplan:40). PARTLY.**
  - On Windows x64 with internet access, the commands can be replayed (`HANDOFF.md:111-127`).
  - But checkout and Node setup are GitHub actions (`windows.yml:13-17`), and `native:build` refuses anything but Windows x64 (`scripts/build-native.mjs:6`).
  - The repository says "A local pass is not a CI pass" (`AGENTS.md:11`).
  - The user decided that checks and break-tests run on GitHub Actions runners (jobs-plan:466).
- **"The exact Windows quality gate" (mplan:101). PARTLY.** There is no single list:
  - a push or pull request runs 14 steps;
  - a manual dispatch adds 5 more (`windows.yml:31-53`);
  - the merge rule has two parts: the Linux baseline comparison and a green Windows run on the exact head (`AGENTS.md:19, :63`).
- **`scheduler.ts` "coordinates inference/runtime work" (mplan:73). PARTLY.**
  - It does so only for the managed Ollama provider, which has no production caller (`docs/development-status.md:103`).
  - The shipped app calls the provider directly (`src/main/index.ts:95`).
  - So the scheduler cannot tell a maintenance feature whether inference is running.
- **"Developer mode" (mplan:36, :40). PARTLY.** The plan introduces it; nothing like it exists. The only switch is `app.isPackaged`, used for the helper path (`src/main/index.ts:51`).
- **"Build" as something distinct from inference (mplan:95). PARTLY.** Build is a run mode (`src/shared/contracts.ts:13`), and every turn of a Build run is an inference call.
- **"Settings → Maintenance" (mplan:16). PARTLY.**
  - There is no Settings screen to add a section to. Settings-like controls are sidebar buttons that open modals (`src/renderer/App.tsx:221`) and the details pane (:239).
  - The spec plans a sidebar "settings" entry (`source-plan.md:205`).
  - An engine settings record exists with no UI caller (`src/shared/params.ts:74, :145, :152`).
- **A durable record per run (mplan:77). PARTLY.**
  - No existing table fits: research and mission rows require a project (`src/engine/migrations.ts:78, :221`; the v4 rebuild of `research`), and runs require a session and a profile.
  - A new table needs a schema step, and v5 is reserved by project memory (`project-memory.md:128`).
  - The pattern to copy is the research job's run-less record plus append-only journal (`docs/ARCHITECTURE.md:21`).
- **A main-process coordinator (mplan:78). PARTLY.** None exists. The patterns to follow are the collector supervisor (`src/main/collector.ts:79-85`) and research recovery at each start (`src/main/index.ts:134-135`).
- **A supervised worker for allowlisted check commands (mplan:79). PARTLY.**
  - Exists: owned process trees with Job Object cleanup, timeouts and a filtered environment (`src/tools/commands.ts`; `docs/development-status.md:142`).
  - Missing: a standing allowlist. Each command needs its own approval inside an active Build run (`src/main/commands.ts:73, :107-112`).
  - Limits: a command may run 600 s and print 60,000 bytes (`src/shared/commands.ts:7, :12`), while the CI job allows 35 minutes (`windows.yml:11`).
- **A repair workspace that cannot write to the installation or the active project (mplan:81). PARTLY.**
  - Only the data folder is protected (`src/main/index.ts:68`), and only as a command's working folder (`src/main/commands.ts:84-85`).
  - The installation folder is per-user and its location can be changed (`electron-builder.yml:33-34`).
  - Owned processes run with the user's full rights: the Job Object sets only kill-on-close (`native/host.cpp:119-122`).
- **A separate worktree for the patch (mplan:64). PARTLY.** Moonzila's Git tools refuse linked worktrees (`src/tools/git.ts:14`).
- **Logs with secrets redacted (mplan:82). PARTLY.** Redaction replaces only values stored in the vault (`src/main/vault.ts:183-195`), and Moonzila has no log facility.
- **An explicit policy before code goes to a cloud model (mplan:82). PARTLY.**
  - The policy exists per project and per conversation (`src/engine/policy.ts:30, :77`).
  - A maintenance run on Moonzila's own source, outside any project, has no policy holder.
  - Any non-loopback endpoint counts as cloud (`src/main/inference.ts:18-20`).
- **Verifying installed files against a manifest (mplan:33). PARTLY.**
  - The version is readable (`app.getVersion()`, `src/main/index.ts:221`).
  - The asar integrity fuse checks `app.asar` at load (`electron-builder.yml:23`), but not the native helper outside it (:24-26).
- **The five statuses (mplan:80). PARTLY.** The vocabulary is new, and two of its words are taken:
  - "Needs review" already labels uncertain changes and recovery (`src/renderer/ChangesPanel.tsx:76`; `src/renderer/RecoveryPanel.tsx:32`);
  - BLOCKED is a Research-Kit verdict (`src/adapters/research-kit/contracts.ts:19`).
- **Trusted repair "with a way back to the previous working version" (mplan:91). PARTLY.**
  - Migrations are one-way, and an older build refuses a newer database (`src/engine/migrations.ts:110`). A way back therefore needs a verified pre-migration backup (Task F1, `source-plan.md:3356-3359`), which is not built.
  - The repository already specifies how updates may activate: G25 (`source-plan.md:127`) and the drain protocol (:927).
- **"A scheduled run does not interrupt Build, inference, or an active user operation" (mplan:95). PARTLY.**
  - Busy signals exist only per project or per process (`src/engine/operations.ts:41, :216`; `src/engine/store.ts:177`; `src/main/index.ts:43-45`; `src/main/collector.ts:108`).
  - There is no app-wide signal and no idle detection (no `powerMonitor` in `src/`).
  - Closing the window quits the app (`src/main/index.ts:320`), so "minimized" is the only background state.
- **"Tests do not modify user work or use their credentials" (mplan:97). PARTLY.**
  - Tests use fake services (G18, `source-plan.md:120`), and every desktop journey uses a temporary data folder.
  - But `npm ci` and the build rewrite folders in whichever checkout they run in (`scripts/build.mjs:5`).
  - The local-models journey queries the user's real Ollama (`e2e/local-models.spec.ts:18`, `src/models/local-runtime.ts:5`).
  - Child processes receive USERPROFILE and APPDATA (`src/tools/commands.ts:16`), so npm and git read the user's own configuration.
- **Detecting "Moonzila's source checkout" (mplan:10). PARTLY.**
  - Nothing detects one.
  - In an installed app, a checkout can enter only as a project the user picks in the native dialog and then trusts (`docs/ARCHITECTURE.md:19`).
  - The app must not search the disk for it.

Two claims were not checkable; see section 4.

### How it would map onto Moonzila

| The plan asks for | Moonzila today | Missing |
|---|---|---|
| Settings → Maintenance, schedule, Run now, Stop, history | Sidebar modals (`App.tsx:221`); a settings record with no UI (`params.ts:74`); Stop for owned processes (`src/tools/commands.ts`) | A Settings screen, scheduling, report history. The planned Tasks panel would carry status and Stop (jobs-plan:469) |
| Run a missed check at next start | Reconcile-at-start pattern (`main/index.ts:134-135`; `engine/index.ts:15`) | A due-time record |
| Wait until idle | Per-project and per-process busy checks | An app-wide signal; idle detection |
| Quick check: version and manifest | `app.getVersion()`; the asar fuse | A signed manifest (Task F3) |
| Quick check: crash record | Interrupted runs and unknown operations (`store.ts:382-399`) | Crash and exit recording (Task F2, `source-plan.md:3419`) |
| Quick check: environment | `hardware.read`, `runtime.inspect` (`main/index.ts:221-222`) | A check for Node, npm, Git and Windows x64 |
| Full check = CI workflow | `windows.yml` with manual dispatch (:5); a supervision pattern for a dispatched run: never re-dispatch (`src/main/collector.ts:79-85`), and resume the recorded run by its id (`src/adapters/research-kit/collector.ts:42-45`). The dispatch itself is done by the pinned Research-Kit child, for the kit's own collector workflow (`src/adapters/research-kit/collector.ts:6-7, :31-44`) | A dispatcher for `windows.yml` and a GitHub write path; Moonzila's own GitHub calls are GET-only (`src/main/github.ts:15`; `src/main/research-import.ts:41`) |
| Break-test in a disposable copy | A skill only | An in-app runner; containment |
| Patch in a worktree, diff, approval | Journaled edits, Changes panel, approval binding (`policy.ts:35-41`) | Worktree support; a PR path (jobs-plan:433) |
| Durable run record | Research record plus journal pattern | A new table, or main-owned files |
| Allowlisted check worker | Owned process trees; one approval per command | A standing approval bound to exact code |
| Repair workspace | Data folder protected as a working folder | Write containment at the operating-system level |
| Redacted logs | Vault-value redaction | A log facility; pattern-based redaction (Task F2) |
| Cloud policy for code | Per project and per conversation | A holder outside a project |
| Trusted repair and rollback | None | Tasks F1 and F3, plus external inputs |

### Problems and recommendations (blocking first)

**Blocking**

1. **It has no slot in the recorded order, and it arrives while another task is active.**
   - More models is ACTIVE, and its Mandate waits for the user (`RUN.md:5, :19`).
   - The user chose More models next (`RUN.md:42`).
   - The phase order is research, project memory, missions (jobs-plan:449, :457), and computer use after missions (jobs-plan:487).
   - Maintenance appears nowhere in that order. Stage F (diagnostics, updates, signing) is last in `HANDOFF.md:88`.
   - *Recommendation:* treat it as a proposal, not the next task. Build nothing before the More models Mandate. Once you approve their wording (decision 1), record the plan's principles as your decisions.

2. **A local, scheduled Full check contradicts recorded decisions.**
   - "Checks and break-test runs on GitHub Actions runners, so heavy and Windows-only checks do not depend on the user's PC" (jobs-plan:466).
   - "Running in the background never bypasses the existing exact command approval" (jobs-plan:470).
   - "A local pass is not a CI pass" (`AGENTS.md:11`).
   - The user's PC has about 1.2 GB of free memory, which is below the reserve (`RUN.md:59`).
   - *Recommendation:* make the Full check a manual dispatch of `windows.yml` (`workflow_dispatch` is already enabled, :5) on an exact pushed commit. Record the workflow run id, then read the result.
   - Moonzila does not dispatch any workflow itself today. Research collection's dispatch is done by the pinned Research-Kit child (`collect-remote`, driven through `dispatchArgs`, `src/adapters/research-kit/collector.ts:6-7, :31-44`) with the collector token, for the kit's own collector workflow. Moonzila's own GitHub calls are GET-only (`src/main/github.ts:15`; `src/main/research-import.ts:41`).
   - So dispatching `windows.yml` needs a new dispatcher, not reuse of the collector. Only the supervision pattern carries over: never re-dispatch, and recover by run id (`src/main/collector.ts:79-85`; `src/adapters/research-kit/collector.ts:42-45`).
   - It also needs a GitHub connection that may dispatch Actions; that is step 1 of the approved GitHub plan (jobs-plan:463-464), and decision 10.

3. **"Approved, allowlisted check commands" amounts to a standing approval to run whatever code the checkout holds.**
   - `npm test` runs every test file and config in the repository, and approval digests cover only the executable (`src/main/commands.ts:107-112`).
   - Reading the workflow file from the checkout to decide what to run would let repository content grant command execution, which G10 and G24 forbid (`source-plan.md:112, :126`).
   - Approval must be bound to the operation and its inputs (G13, :115).
   - A method labelled `user-confirmed` would not enforce such an approval either: nothing in `src/` reads the label (section 1, problem 4).
   - *Recommendation:* if local checks are ever wanted:
     - ship the check list inside the app, never parsed from the checkout;
     - bind any standing approval to the commit, a clean working tree, the lockfile hash and the check-list hash;
     - require a new approval after any change.

4. **Moonzila cannot keep a check or a patch away from the user's files.**
   - The Job Object sets only kill-on-close (`native/host.cpp:119-122`).
   - The protected folder is checked only as a working folder (`src/main/commands.ts:84-85`).
   - The installation folder is writable by the user (`electron-builder.yml:33-34`).
   - Stage 5 would run AI-written code with the user's full rights.
   - The project's own break-test has already leaked a write into the user's checkout. Its worktree's `node_modules` was a symlink to the user's, so "each gate run in the worktree ... rewrites that one cache file in the user's `node_modules`"; only throwaway clones with their own `npm ci` wrote nothing (`docs/evidence/2026-10-04-break-test.md:15`). That also argues against the plan's "separate worktree" (mplan:64).
   - *Recommendation:* treat isolation as an open research item. The user already chose sandbox-only for Operator mode (jobs-plan:481, :489), with Windows Sandbox or a Cua sandbox, and that could host it. Until then, verify patches only on GitHub runners. A local disposable copy, if ever used, must be a fresh clone with its own `npm ci`, never a worktree.

5. **A Full check in the folder Moonzila runs from would rewrite the running app.** This is expected from reading the code; it was not run.
   - The build deletes `dist/` (`scripts/build.mjs:5`).
   - A source run loads its engine from there (`src/main/index.ts:153`) and its native helper from `.build/native` (:51).
   - *Recommendation:* never run source-level checks in place. Use a fresh clone with its own `npm ci` (problem 4), or GitHub. Say this in §3 of the plan, not only for break-tests.

**Important**

6. **The installed-app Quick check depends on unbuilt Stage F work** (F1 updates and backups, F2 diagnostics, F3 signing) and on external inputs (`source-plan.md:3812-3814`). The user's installed copy is 0.7.0 (`HANDOFF.md:50`).
   - *Recommendation:* fold the installed-app check into Task F2. A report-only "Check now" can use the categories `diagnostics.export` already declares, add new crash and exit recording, and reuse the existing probes.

7. **Repair from an official release collides with one-way migrations** (`src/engine/migrations.ts:110`). With today's unsigned installers, an automatic restore would download and run unauthenticated code.
   - *Recommendation:* hide the repair opt-in until F1 (verified pre-migration backup) and F3 (signing) exist. Then adopt their specified design rather than a new one.

8. **The patch is verified by the run that wrote it** (mplan:65-66). Moonzila's decision 8 says verification "cannot self-certify" (`docs/specification/decisions.md:12`).
   - *Recommendation:* count a fix only when CI is green on the pull request's commit and an independent verifier agrees. The output is a draft pull request that Moonzila never merges.

9. **It re-plans three queued features without naming them:**
   - Self-unblocking: self-fix, then research, then a pull request, then notify (jobs-plan:418-434);
   - the break-test preset in missions, with each run approved by the user (jobs-plan:462);
   - background tasks: a Tasks panel, bounded output files, Stop, and never re-running silently (jobs-plan:468-473).
   - *Recommendation:*
     - adopt the plan's code-fix steps 1-5 (mplan:63-67) as the acceptance rule for Self-unblocking's self-fix step;
     - run any scheduled break-test as the missions preset;
     - build scheduling on background tasks.

10. **"Scheduled check, then prepare a patch" means unattended model calls**: cloud spend, and Moonzila's source sent out.
    - No local model fits on the user's PC (shortlist BRIEF:335-342).
    - No cloud preset is offered until its U-06 tool-call run passes (shortlist BRIEF:408-413).
    - *Recommendation:* a scheduled run never calls a model, never spends credits and never starts a break-test. Patch preparation starts only when the user clicks, with the cost and the destination vendor shown.

11. **A maintenance run has no policy holder and no root.**
    - Approvals and operations require a project (`src/engine/migrations.ts:61, :71`).
    - Commands are allowed only in Build or Mission mode (`src/engine/policy.ts:24`).
    - *Recommendation:* the developer self-test runs only inside a trusted project, the Moonzila checkout the user opened. That project's local/cloud policy then governs any patch.

12. **Storage collides with the schema plan.**
    - v5 belongs to project memory (`project-memory.md:128`).
    - Adding schedule fields to the strict settings schema (`src/shared/params.ts:74`) would make older builds fail at every run start, because the settings are parsed there (`src/engine/application.ts:157-159`).
    - *Recommendation:* use main-owned bounded files for a first report-only slice, or a schema step after memory.

13. **"Missed" versus "interrupted" is undefined.** Background tasks "show as interrupted and are never re-run silently" (jobs-plan:472), and G12 forbids automatic repeats after an ambiguous interruption (`source-plan.md:114`).
    - *Recommendation:* an interrupted check stays interrupted. Only a missed due time starts one new run, and only if the user turned that option on.

14. **No app-wide busy signal or idle detection exists** (see above).
    - *Recommendation:* add one admission gate in main that will not start a check while any run, command, collector job or research tool is active. User work may stop a check; a check never stops user work.

15. **Checking installed files from inside the app is self-attestation.** The checker sits in the same user-writable folder as the files it checks.
    - *Recommendation:* label it "corruption detection". Tamper resistance waits for signing (F3).

16. **Leak paths are wider than "redact the logs" covers.** Redaction covers vault values only, and child processes see the user's npm and git configuration (`src/tools/commands.ts:16`).
    - *Recommendation:* store structured results (test ids, statuses, exit codes) rather than raw output. Run checks with a private home and private npm and git configuration.

17. **Stage 1 research targets the wrong unknowns for a first slice.** Windows Task Scheduler matters only for closed-app runs, which the plan itself defers.
    - *Recommendation:* research what the first slice needs: GitHub's workflow-dispatch and run-status API, the token permission to dispatch Actions, Actions minutes cost for `windows-latest`, and Electron's idle API. Do it as one nested Research-Kit project.

**Minor**

18. **The names collide** with existing meanings of "maintenance", "Needs review" and "Blocked" (see above). For example: "Health check" with Passed / Failed / Could not run (environment) / Skipped / Unverified.
19. **"Run while minimized" is moot**, because closing the window quits the app (`src/main/index.ts:320`). Replace it with "pause scheduled checks while I am using Moonzila".

### Decisions for you

1. **When, and in what shape?**
   - (a) Start Maintenance now.
   - (b) Build it whole after More models.
   - (c) Split it: the installed-app check joins Task F2; the developer parts go into Self-unblocking and missions.
   - *Recommendation: (c). Build nothing before the More models Mandate.*
   - *Recording the plan's principles is also your call. An agent writing its own recommendations into the jobs plan as decisions would be the self-ratification this review faults in SmartRouter (`docs/PHASE3_PREREGISTRATION.md:27-28`). If you approve, record this wording, dated, in the jobs plan:*
     1. The installed-app check and the developer self-test are separate features.
     2. Checks are report-only by default. Moonzila never silently replaces the running app, merges a change or publishes a release.
     3. Maintenance does not use the model-runtime maintenance lease in `src/engine/scheduler.ts`.
     4. A check whose due time passed while Moonzila was closed may start one new run at the next start, and only if you turned that option on. An interrupted check stays interrupted and is never re-run silently.
     5. A check that cannot run because of the environment is reported as "Could not run (environment)", compared against a recorded baseline, and never reported as a Moonzila defect.
     6. Windows scheduling, signing, update and rollback mechanisms are researched with Research-Kit before any of them is chosen.
2. **Where does the Full check run?**
   - (a) Locally, replaying the workflow's commands.
   - (b) On GitHub, by dispatching `windows.yml` on an exact commit.
   - (c) Both.
   - *Recommendation: (b), which matches your October 2 decision (jobs-plan:466), on two conditions: the Actions-minutes cost of `windows-latest` runs, which nobody has researched yet (section 4), is acceptable to you, and a write credential exists (decision 10).*
3. **May a scheduled run call a model, spend credits or start a break-test while you are away?**
   - (a) Never; those start from the report when you click, with the cost and destination shown.
   - (b) A standing opt-in with a budget.
   - *Recommendation: (a), which matches "the user approves every break-test run, with its cost shown" (jobs-plan:462).*
4. **Where does a proposed fix go?**
   - (a) A diff inside the app only.
   - (b) A branch and draft pull request that Moonzila never merges.
   - *Recommendation: (b), built as part of Self-unblocking. It counts only when CI is green on that commit and an independent verifier agrees.*
5. **Which privacy policy governs sending Moonzila's own source to a cloud model?**
   - (a) The checkout's project policy; you open the checkout as a trusted project.
   - (b) A new app-wide maintenance policy.
   - *Recommendation: (a), and only to vendors in the shortlist's "offerable for private code" class (shortlist BRIEF:348).*
6. **Should a "Developer mode" exist?** *Recommendation: no. The developer self-test is available when you open the Moonzila checkout as a project. The app never searches the disk for it.*
7. **What may "repair the installed app" do before signed releases exist?** *Recommendation: report only, with a link to the release page, until F1 and F3. Decide the production signing inputs once, for both the installer and a release manifest; a missing production signing key also blocks More models' signed catalogue (`RUN.md:58`).*
8. **One scheduler or two?**
   - (a) A coordinator only for maintenance.
   - (b) A general "scheduled background task" capability in the background-tasks part of missions.
   - *Recommendation: (b), with maintenance as one of its first users.*
9. **Rename the feature and its statuses?** *Recommendation: yes. See problem 18.*
10. **Which GitHub credential may write, and how is it held?** Decision 2(b), Self-unblocking's pull requests and step 5 of the recommended order (section 3) all need a token that may dispatch Actions on MoonAliza and write contents and pull requests. Moonzila has only a collector token and read-only GitHub reading; pushing and opening a pull request "needs a write path, a token scope and its own vault handling" (jobs-plan:433).
    - *Recommendation: one least-privilege credential per repository in the vault, as GitHub step 1 already approves (jobs-plan:464), never entered in chat, with your approval for every write (jobs-plan:467). Settle its exact scopes when Self-unblocking is brainstormed, after the token-permission research in problem 17.*
11. **May the Quick check ask whether an official update is available?** That is new network traffic (mplan:9) to an update feed that does not exist yet (`source-plan.md:3814`). The project and conversation policy covers only inference (`src/engine/policy.ts:30, :77`), so no existing policy governs it.
    - *Recommendation: defer it with F1 and F3. The first report-only check makes no network request. When F1 exists, update checking is its own opt-in setting, separate from inference policy, as research and inference permissions already are (G07, `source-plan.md:109`).*

*Problems 12 and 13 need no separate decision now.* Storage (problem 12) is chosen in the designs that decision 1(c) assigns the work to: the report-only check and scheduling land in F2 and missions, after project memory takes schema v5, and Self-unblocking, whose place is still open (jobs-plan:420), settles its own storage when it is brainstormed. Missed versus interrupted (problem 13) follows from decision 8(b): background tasks never re-run an interrupted task silently (jobs-plan:472), and whether a missed due time may start one run is principle 4 under decision 1.

*Rough size (reviewer estimates, not measured):*
- a report-only health-check slice: 8-12 files, 0-1 schema steps, 4-6 test files and one desktop journey, about one research-jobs task;
- scheduling: 3-5 more files;
- a local disposable workspace: a new security design;
- patch proposals: the size of the Self-unblocking phase;
- trusted repair: Tasks F1 (updates and migrations), F3 (installer and signing) and F5 (release readiness) in `source-plan.md:3333, :3510, :3650`, plus external inputs.

---

## 3. How the two relate to the queued work, and a recommended order

| Queued work | Advisory UI note | Maintenance plan |
|---|---|---|
| **More models** (active, Mandate pending; `RUN.md:5, :19`) | Overlaps direction 3, "Smarter selection" (jobs-plan:410). Its fields need direction 2's locality fix and the cloud presets (wire BRIEF:522, :570; shortlist BRIEF:408). The approval question is already held for the Mandate (`RUN.md:27`). | Patch proposals (stage 5) need a usable model, so they wait for More models' first build step: cloud presets with U-06 passed. No local model fits on this PC (shortlist BRIEF:335). |
| **Self-unblocking** (jobs-plan:418-434) | SmartRouter §7's blocked / failed / unverified wording (SR plan:106) could define "cannot solve" (an open question, jobs-plan:429). | Same pipeline: fix, verify, draft pull request, never merge. Both need the GitHub write path (jobs-plan:433; maintenance decision 10) and GitHub steps 1-3 (jobs-plan:463-466). |
| **P4-23, linked parent above the data folder** (jobs-plan:414-416) | No direct link. | Any repair or break-test workspace under the data folder would inherit this guard defect. Direction 1 (model store and downloads) uses the same guarded paths (`src/models/artifact-files.ts:16`). |
| **Project memory** (schema v5; `project-memory.md:128`) | Persisted previews would need a later schema step. | Persisted maintenance runs would need a later schema step. Memory's lesson records could hold repeated check failures. |
| **Missions**, starting with background tasks (jobs-plan:468-473, :487) | The mission planner is a second selector to reconcile (jobs-plan:387). | Background tasks carry Run, Stop and history. The break-test preset lives here (jobs-plan:462). |
| **Stage F** (`HANDOFF.md:88`) | None. | The installed-app check belongs in F2. Trusted repair needs F1 and F3. |

**Recommended order.** Already decided by the user: More models first (`RUN.md:42`), project memory before missions (jobs-plan:449, :457), and missions starting with background tasks (jobs-plan:487). Self-unblocking's place relative to memory and missions is open (jobs-plan:420). Everything else below is this review's recommendation.

1. **Now, no code.** At the More models Mandate, answer advisory-note decision 1. If you approve the wording in maintenance decision 1, record the maintenance plan's principles as your dated decisions in the jobs plan.
2. **More models.** Do the requirements, design and Mandate.
   - All three directions stay in scope, and their order is the Mandate's (jobs-plan:407; `RUN.md:27`), as is the order of the wire brief's steps (wire BRIEF:557). That includes direction 1 (more one-click local models, jobs-plan:408) and the wire brief's native adapters: Anthropic (step 2), OpenAI Responses (step 3) and Gemini (step 5, once the Mandate picks generateContent) (wire BRIEF:565-580).
   - This review places only the pieces the advisory note depends on, in this order:
     - direction 2 groundwork (wire BRIEF:560);
     - cloud presets with U-06 (shortlist BRIEF:408);
     - the fail-closed locality rule (wire BRIEF:522, :570);
     - direction 3, including an inference-free eligibility display beside the profile picker. That display is the only part of the advisory note to build.
3. **P4-23**, before More models direction 1, wherever the Mandate places it, and before any local disposable workspace, because both use the guarded storage paths. It is not only a prerequisite: it already affects production, because `privateDirectory` also guards the Research Kit store (jobs-plan:416) that the shipped research review uses (`src/main/review.ts:259`).
4. **Project memory** (schema v5).
5. **Self-unblocking**, with the GitHub connection (maintenance decision 10). It should:
   - adopt the maintenance plan's code-fix rules (mplan:63-67);
   - make the Full check a GitHub dispatch;
   - produce draft pull requests only.
6. **Missions**, starting with background tasks. Add a general scheduled-task capability, with maintenance scheduling as one user, and the break-test preset.
7. **Stage F**: the report-only health check inside F2; F1 and F3 when the signing identity and update feed are supplied; trusted repair after that.
8. **Model-generated recommendations** (advisory Path B) only after missions, and only if a measured need appears.

---

## 4. Not checked

- **"The project's Research-Kit is not installed in the current workspace" (mplan:105). NOT-CHECKABLE.**
  - It describes the plan author's own machine.
  - Moonzila does not bundle the kit. It is installed per machine (`AGENTS.md:92`), plus a pinned validator fetched into `.build/` (`scripts/prepare-research-kit.mjs`), so a fresh clone has none.
  - On the machine this review ran on, the kit is installed.
- **"No code was changed for this plan" (mplan:105). NOT-CHECKABLE.**
  - What the repository does show:
    - `git diff b490e50 71436b5` touches only `docs/research/`;
    - the working tree changes only `AGENTS.md` and the jobs plan, plus the untracked `docs/orchestration/2026-10-05-more-models/`.
  - That does not prove the author changed nothing elsewhere.
- **Whether 9b4bd68 is an ancestor of SmartRouter's head: checked, it is.** With SmartRouter's full history fetched (52 commits, the clone no longer shallow), `git merge-base --is-ancestor 9b4bd687ac6bf24c1f437329b7dacfd60e18424b ac59658` exits 0, with 33 commits between them (lead, 2026-10-10). A reviewer briefly saw exit 1 because a later `--depth=1` fetch of the release tag had made the clone shallow at b6e04fd; that was a property of the local clone, not of SmartRouter.
- **Whether the GitHub release asset matches the committed zip.** The asset (`HANDOFF_MOONZILA.md:11`) was not downloaded. The committed zip's SHA-1 matches the value SmartRouter records (`PROJECT_COMPLETION.md:74`).
- **Correction to an established fact.** The note was described as existing nowhere in SmartRouter. It is absent from every git tree, but it is present inside the committed release zip (section 1, Provenance).
- **Runtime behaviour.** Nothing was built, installed or run.
  - Windows-only behaviour (the native helper, Job Object limits, desktop journeys) was read from code, not exercised.
  - The SmartRouter decision suite (`tests/smart_router_decisions.py`) was not run. It was read, and even an exit 0 from it would not be evidence for any Moonzila gate (section 1, problem 14).
  - The claim that an in-place build rewrites the running app is expected from the code, not observed.
- **External facts.** These were not researched, and would need a Research-Kit project before any design depends on them:
  - GitHub's workflow-dispatch API and the token permissions it needs;
  - Actions minutes cost;
  - Electron's idle-detection API;
  - electron-builder's default packaging of production dependencies;
  - Windows scheduling, signing, update and rollback mechanisms.
- **Size estimates** in sections 1 and 2 are the reviewers' estimates, not measurements.
