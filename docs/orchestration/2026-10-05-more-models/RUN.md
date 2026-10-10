# Run: more-models

| Field           | Value |
|-----------------|-------|
| Status          | ACTIVE |
| Started         | 2026-10-05 |
| Last checkpoint | 2026-10-10 - Stage 1 research DONE (both corpora pass); ideas review; phase PR |
| Engagement      | Full (provider adapters, downloads, signed catalogue, external services) |
| Working branch  | `main-axuse`, restarted from `main` @ `b490e50` (PR #37 merge) |
| Skills          | auto-build, lead-orchestrator, careful-coding, Research-Kit 0.9.5 |

## Auto-build stages
| Stage | Status | Artifact | Checkpoint |
|-------|--------|----------|------------|
| 0 Orient | DONE | this ledger; baseline below | 2026-10-05 |
| 1 Research | DONE: two corpora, preflight PASS and handoff OK each, briefs authored, adversarially verified | docs/research/2026-10-05-provider-wire-formats/research/BRIEF.md; docs/research/2026-10-05-coding-model-shortlist/research/BRIEF.md | 2026-10-10 |
| 2 Requirements | PENDING | - | - |
| 3 Design | PENDING | - | - |
| 4 Mandate | PENDING: architectural, waits for the user | - | - |
| 5 Build | PENDING | - | - |
| 6 Harden | PENDING | - | - |
| 7 Audit | PENDING | - | - |
| 8 Deliver and merge | PENDING | - | - |
| 9 Validate and report | PENDING | - | - |

## Next action
Stage 1 is finished and this phase stops here (user, 2026-10-05: "finish the phase. merge what needed, make sure no bugs and then stop"). Next run: Stage 2 requirements and Stage 3 design from the two briefs, then the Mandate, which waits for the user (architectural). Questions held for the Mandate: which vendor keys the user will provide for the day-one probes (wire-formats U-18); the order of the three directions; whether to approve the SmartRouter advisory UI note (see reports/2026-10-10-ideas-review.md).

## Task statement
User, 2026-10-04: "Can we add more models to moonzila?" then "add it as its own task after Task 5. Yes". User, 2026-10-05: "continue"; chose "More models" as the next task and "I'll add a new key" for research collection.

Plan entry (docs/superpowers/plans/2026-10-02-research-jobs.md, "More models"): three directions, all in scope, order decided at the brainstorm: (1) more one-click local models in the managed catalogue; (2) native profile kinds for providers that are not OpenAI-compatible (for example Gemini's own API); (3) smarter selection ranking cloud and local models by cost and quality per task. Research first: which coding models are worth adding, judged on tool-calling reliability, licence, size and hardware, and price; a curated, tested shortlist, not a count. Constraints: about 1.15 GiB free memory on the user's PC, so local models that do not fit are not offered; cloud models stay behind the project's inference policy.

## Baseline
`main` @ `b490e50` has the same tree as `7c1923c` (`git diff` empty), whose pinned Linux gate is `/home/user/task5-handoff/results/p5-final-7c1923c`: typecheck, lint, build pass; 1121 tests, 74 failed, the same names as `/home/user/task5-handoff/baseline-failing.json`, 0 files without results. Windows CI green on `7c1923c` (runs 37237635914, 37237639148).

## Research-Kit
Kit 0.9.5 at `$HOME/.agents/research-kit`, role collector. `doctor` on MoonAliza, 2026-10-05: 1 blocker, `firecrawl-auth: not authenticated` (the session's keys were shredded at the end of Task 5, as the user asked). Transport without a key: `firecrawl-cli-anonymous`; the user chose a new key, not the keyless transport.
2026-10-05, later: the user uploaded a new key as a file outside the repository; each collecting command reads it from there inline (never echoed, never copied into a repository or a brief). `doctor`: READY, `firecrawl-cli` authenticated, 642 credits. Collection budget for this task: at most 100 credits across all topics, each plan dry-run first; anything beyond goes to the user.

## Decisions and assumptions
- 2026-10-05: the user picked More models over P4-23 and Self-unblocking, and a new key over keyless collection.
- 2026-10-05: classified architectural (new provider kinds, catalogue changes and selection touch contracts, the signed catalogue and the inference policy); the Mandate waits for the user, as the auto-build default for architectural tasks.

## Research outcome (2026-10-05..10)
| Corpus | Unknowns | Gate | Verification |
|--------|----------|------|--------------|
| `docs/research/2026-10-05-provider-wire-formats` | 20: 18 CLOSED, 2 KNOWN-UNKNOWN (U-05 Gemini over-window status and body; U-18 live probes per vendor key) | preflight PASS (0 warnings), handoff OK, 38 ledger entries | three adversarial verifiers; 13 material issues, then 2 more after run 4; all resolved per a fresh checker |
| `docs/research/2026-10-05-coding-model-shortlist` | 20: 12 CLOSED, 8 KNOWN-UNKNOWN (U-04, U-06, U-09, U-10, U-15, U-17, U-18, U-20), each with a day-one step | preflight PASS (1 warning the contract accepts: U-18), handoff OK, 38 ledger entries | three adversarial verifiers; 6 material issues, all resolved per a fresh checker |

Credits: this task's collection spent about 80 (76 pages and 2 searches by the two ledgers: runs 1-2 68, run 3 10, wire run 4 2), within the 100-credit budget; measured 642 before and 564 after run 3. On 2026-10-10 `doctor` reports 391: about 171 more were spent outside this task's ledgers between 2026-10-05 and 2026-10-10, which nothing here records or can attribute (other use of the same account is the likely cause). A shortlist run 4 (4 owner pages) was declined by the user on 2026-10-05; nothing was fetched, the plan file the interrupted command had written was removed, and the corpus records the decision.

## Units
(none yet: no build in this phase)

## Discovery (reports/discovery-1.json, five mappers and a critic, 2026-10-05)
- Only `openai-compatible` and `ollama` run; `anthropic` and `openai-responses` are declared but throw NOT_IMPLEMENTED (`src/main/inference.ts:142-143`), and the profile form offers only the two that run (`src/renderer/App.tsx:266`). The plan's "already reaches many models through profiles (ollama, openai-compatible, openai-responses, anthropic)" overstates what works.
- The managed local stack (signed catalogue, activation, managed Ollama, selector) is tested source with no production caller; `model.*` IPC falls to NOT_IMPLEMENTED; no production signing key, shipped catalogue, catalogue producer or qualification harness exists (HANDOFF.md:85-86). "More one-click local models" first needs that path built.
- On the user's PC (about 1.2 GB available, reserve max(2 GiB, 15% RAM)) the selector answers `host-reserve` for every model size: no local model can be offered there under the current policy.
- Selection: the user picks a profile per run; no price, quality or capability is stored per profile or catalogue entry.
- Critic: locality is derived from the endpoint host (loopback = local), which a user-run Ollama serving cloud models would defeat; recorded as a research unknown.

## Findings
| ID | Source | Severity | Finding | Disposition |
|----|--------|----------|---------|-------------|
| MM-2 | lead | process | a command the user rejected had already written `plan-4.json` into the shortlist corpus before the rejection; no collection ran (ledger unchanged at 38 entries) | the file was removed on 2026-10-10 and the decision is recorded in the corpus |
| MM-3 | lead | process | two commit messages first stated wrong counts (17/3 instead of 18/2 unknowns; "four rows" instead of three rows and one half) | corrected before push from the contract's own rows |
| MM-1 | discovery | docs | the plan's "More models" entry says four profile kinds reach models; two are unimplemented | FIXED: dated correction under the entry, with pointers to the discovery and the two research projects |

## Log
- 2026-10-05: started. Branch restarted from `main` (`main-axuse` held only merged history). Discovery workflow launched: five read-only mappers (profiles, catalogue, selection, existing research, specs and tests) and a completeness critic.
- 2026-10-05: the user supplied a new Firecrawl key (upload); kit READY, 642 credits; budget 100 credits. Remind the user at the end to rotate it (it is in the conversation record).
- 2026-10-05: discovery returned (6 agents); saved `reports/discovery-1.json`. Research split into two projects: `docs/research/2026-10-05-provider-wire-formats` and `docs/research/2026-10-05-coding-model-shortlist`; planning workflow launched (no spend; researchers have no key).
- 2026-10-05: research plans drafted (wire formats: 18 unknowns, about 29 credits; shortlist: about 31 credits; no spend). Both plan reviews returned FIX (search-only sources typed S, guessed URLs, licences resting on Ollama's layer instead of the owner, an unknown no page can answer, the shortlist over one run's 25 pages). Fix round launched (workflow `more-models-plan-fixes`, up to two review rounds, no spend). Reviewer's account question for the day-one probes (which vendor keys the user will provide) held for the Mandate. Saved `reports/research-plan-1.json`.
- 2026-10-05: plan fixes: wire formats READY after round 1 (32 credits in two runs, conditional plan not run); shortlist FIX after round 2 on one material item (Gemini 3.5 Flash-Lite neither planned nor dismissed), applied by the lead (its model page, linked from the 2026-10-02 Gemini pricing capture line 444, added to run 1) with the scope wording. Saved `reports/research-plan-fixes.json`. Dry runs with the key: 64 named pages and 2 searches, about 68 credits. Collection started (four runs, sequential).
- 2026-10-05: user: "finish the phase. merge what needed, make sure no bugs and then stop". Scope of this finish: Stage 1 research to a passing gate and briefs for both corpora, verified, committed with ledgers and merged under the AGENTS.md merge checks; no design or build (the Mandate needs the user).
- 2026-10-05: collection done: wire formats 31 captured, 1 refused (openrouter.ai/docs/features/tool-calling, HTTP 404); shortlist 31 captured, 1 refused (ollama v0.34.4 ml/backend/ggml/ggml/src/CMakeLists.txt, HTTP 404). All captures by `firecrawl-cli`, graded full. Credits 642 -> 574 (68 spent; 32 left in this task's budget). Close-out workflow launched (researchers: quoted claims, statuses, preflight, BRIEF; conditional pages named only by copying links from captures).
- 2026-10-05: close-out round 1 (`reports/research-close-1.json`): both corpora mostly closed; 10 conditional pages whose triggers fired, each copied from a link inside a capture (checked by grep), collected as run 3 (10 credits). Verify round 1 (`reports/research-verify-1.json`): wire formats - 13 material and 18 minor issues raised by three adversarial verifiers, all resolved or soundly declined per a fresh checker; preflight PASS, handoff OK. Two rows (U-05, U-20) had been labelled KNOWN-UNKNOWN only because collection was closed though their owner pages are public and linked from captures; the lead collected both as run 4 (2 credits). Shortlist: its integrate step failed on an API overload (529) and is re-run. Credits: 80 spent in all (642 -> 562 expected).
- 2026-10-05: plan entry corrected (MM-1) and AGENTS.md Research-Kit facts brought current (0.9.5, CLI 1.25.3, eighteen projects).
- 2026-10-05: verify round 2 (`reports/research-verify-2.json`): wire formats - run 4 folded in, 2 material issues resolved, preflight PASS 0 warnings; shortlist - integrated after the 529 retry, 6 material issues resolved per a fresh checker, preflight PASS with the accepted U-18 warning. The lead proposed a shortlist run 4 (4 owner pages); the user declined it.
- 2026-10-10: resumed after five days; the uncommitted work was intact. Removed the declined `plan-4.json` (MM-2). Gates re-run: both PASS, handoff OK. Corpora committed with their ledgers (`2773ee7`, `71436b5`). The user asked to check two proposals (the SmartRouter Phase 6 advisory UI note and a Maintenance self-check plan); copies in `reports/inputs/`, review workflow launched against Moonzila b490e50 and SmartRouter 9b4bd68/ac59658 (cloned read-only). Found first: SmartRouter's handoff points to `docs/MOONZILA_ADVISORY_UI.md`, which exists neither at its head nor in its `v1.0.0-pilot` tag.
- 2026-10-10: ideas review returned (25 agents; `reports/2026-10-10-ideas-review.md`, raw verdicts in `reports/2026-10-10-ideas-review-workflow.json`). Advisory UI note: 24 claims VERIFIED, 39 PARTLY, 5 WRONG; recommendation - do not adopt it as an implementation spec, take its four plan-backed rules into direction 3 at the Mandate. Maintenance plan: its picture of Moonzila mostly accurate; recommendation - record its principles only if the user approves them, and split the work across Stage F2, a GitHub-run Full check, Self-unblocking and missions. The lead spot-checked citations (the `d7c00f9a` pin, SmartRouter's Phase 2 record, `application.ts:363`) and corrected two points: my statement that the note existed nowhere in SmartRouter was wrong (it is inside the committed release zip `tools/release/SmartRouter-v1.0.0-pilot.zip`), and the review's "ancestry does not reproduce" came from my own `--depth=1` tag fetch re-shallowing the clone (with full history, 9b4bd68 is an ancestor of ac59658, 33 commits). Plan gets an end section pointing to the review; nothing approved or built.
