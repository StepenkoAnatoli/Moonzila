# MAP - topic decomposition

## Topic

Which cloud and local coding models are worth offering in Moonzila as of 2026-10-05: current API model ids with context and output limits, tool-calling reliability, how vendors use and retain API inputs, and for small local models their licences, Ollama availability and sizes, runtime version and CPU requirements

## Subtopics

Classified 2026-10-05 by the planning agent, before collection; revised the same day after
review rounds 1 and 2. Every row is COVERED by an unknown in `research/DISCOVERY.md` or DISMISSED
with its reason; no row is a GAP. D-## rows are the universal checklist, S-## rows come from
recipe `library-selection`, T-## rows are specific to this topic. "The 2026-10-02 corpus" is
docs/research/2026-10-02-model-pricing-and-ranking; its row and capture numbers are its own,
not this corpus's.

| ID | Subtopic | Why it matters | Status | Covered by |
|---|---|---|---|---|
| D-1 | Access model | Public pages, an official API, an auth-walled app, or a paywall - each is a different collection design | COVERED | U-01, U-02, U-03, U-04, U-16, U-19 |
| D-2 | Auth and credentials | What accounts, keys, or logins the collection and the product need, and who holds them | DISMISSED | how each vendor authenticates belongs to the sibling corpus docs/research/2026-10-05-provider-wire-formats; this corpus decides which models, not how to call them, and every planned page is public |
| D-3 | Rate limits and quotas | Caps every cadence in the design, and caps the research collection itself | DISMISSED | Gemini tiers and the free-tier limits are reused from the 2026-10-02 corpus (its U-02 and U-06, retrieved 2026-10-02, inside its 30 refresh days); a vendor's rate limit does not decide which model id is offered, and this collection is two runs of 16 and 15 pages, each inside one deep run's 25 |
| D-4 | ToS, licensing, legality of the intended use | A prohibition on automated collection, storage, or display ends the design for that source - and sometimes the project | COVERED | U-07, U-08, U-09, U-10, U-11, U-14, U-20 |
| D-5 | Data schema and its stability | How the data is shaped, and how often the source changes the shape without asking | COVERED | U-01, U-02, U-03, U-04, U-19 |
| D-6 | Freshness and staleness | How fast the data goes stale, and what staleness costs the product that depends on it | COVERED | U-05, U-13, U-19 |
| D-7 | Cost at expected volume | The economics at real usage, not the pricing page's first row - this decides viability | DISMISSED | prices and the cost-at-volume formula are reused from the 2026-10-02 corpus (its U-01 and U-02, its E-01..E-05, retrieved 2026-10-02, inside its 30 refresh days) and are not re-collected, as the lead instructed; this collection plans about 35 credits under the project's 45-credit cap; every conditional page together would need about 55, so conditional pages are collected in the priority order in research/DISCOVERY.md (Conditional pages and the 45-credit cap) and those that do not fit under 45 give way to the fallbacks named there |
| D-8 | Runtime and platform limits | Where this actually executes - OS, runtime version, desktop app, cloud - and what those limits forbid | COVERED | U-12, U-13, U-15, U-16, U-17, U-18 |
| D-9 | Output obtainability | Does the data your stated "done" depends on exist, and can you actually get it? Load-bearing: a project whose output cannot be produced should die in phase 1, not phase 2 | COVERED | U-01, U-05, U-06, U-12, U-14, U-17, U-18 |
| S-1 | Current version and release cadence | What is current today, and how often that changes | COVERED | U-01, U-02, U-03, U-04, U-13 |
| S-2 | License and its obligations | What the license requires of a project that ships it | COVERED | U-14, U-20 |
| S-3 | Maintenance signal | Open issues, last release, and who is actually merging | COVERED | U-05, U-12, U-13 |
| S-4 | Breaking-change history | What the last two majors broke, and what the upgrade cost | COVERED | U-13 - for the local runtime only: the Ollama release notes since the pinned v0.34.4. The cloud side is T-17. |
| T-1 | Cloud model ids, context windows and output limits per vendor | A preset with a wrong id or limit fails on the first call or overflows the window | COVERED | U-01, U-02, U-03, U-04 |
| T-2 | DeepSeek model ids and limits | One of the five vendors the lead named | DISMISSED | reused, not re-collected: the 2026-10-02 corpus's E-04 (https://api-docs.deepseek.com/quick_start/pricing, retrieved 2026-10-02) holds the ids deepseek-flash and deepseek-v4-pro and the 1M context; only the 384K maximum output, tool-call support and the retired legacy names rest on that row's raw capture alone, docs/research/2026-10-02-model-pricing-and-ranking/research/raw/2026-10-02-models-pricing-deepseek-api-docs-deepseek-8eb12065.md lines 24-46 (lines 30, 32, 46). It is 3 days old, inside its 30 refresh days, and sits in that corpus's ledger, so the brief cites the row and the capture by path |
| T-3 | Prices per million tokens | The cost side of any ranking | DISMISSED | reused from the 2026-10-02 corpus (its U-01, its E-01..E-05); not re-collected, as the lead instructed |
| T-4 | Coding rank on published leaderboards | The quality side of any ranking | DISMISSED | reused from the 2026-10-02 corpus (its U-03, its E-09 LiveBench and E-18 SWE-bench); its raw LiveBench capture also holds rows for Claude Sonnet 5.5, Gemini 3.8 Flash and GPT-6 Luna (lines 44, 54, 69) that its brief called unranked |
| T-5 | A published tool-calling benchmark for cloud and small open models | The only comparable tool-calling signal before Moonzila's own qualification | COVERED | U-05 |
| T-6 | Tool calls through Moonzila's own request shape | What the selector and the catalogue actually require (toolsPassed) | COVERED | U-06 |
| T-7 | How vendors use and retain API inputs, free tiers included | Decides whether a tier may receive private code | COVERED | U-07, U-08, U-09, U-10, U-11 |
| T-8 | Small tool-capable models in the Ollama library: tags, sizes, context, cloud tags, minimum runtime | The candidate list for the signed catalogue | COVERED | U-12, U-13 |
| T-9 | Small-model licences and redistribution by a signed catalogue | Decides whether a model may be in the catalogue at all | COVERED | U-14 |
| T-10 | CPU instruction sets: Ollama's CPU builds and the user's CPU | Decides whether the local path runs on this PC at all | COVERED | U-15, U-16 |
| T-11 | Peak memory and speed on the target machine | The selector's memory and machine-receipt gates | COVERED | U-17, U-18 |
| T-12 | Machine-readable model metadata to refresh a dated table | Decides how the table stays current | COVERED | U-19 |
| T-13 | Licence of leaderboard scores shipped in the app | Direction 3 ranks with third-party scores | COVERED | U-20 |
| T-14 | Small candidates left out of this plan | Llama 3.2 1B/3B, LFM2.5-thinking 1.2B, Ministral 3 3B, Qwen2.5-coder 0.5B-3B, Qwen3 1.7B/4B, Nemotron-3-nano 4B, Granite 4.1/4.2 3B, FunctionGemma 270M, SmolLM2, and the other tool-tagged families of 4B or less in the 2026-10-02 library capture | DISMISSED | each on evidence already on disk (line numbers are the 2026-10-02 corpus's Ollama library capture, 2026-10-02-library-ollama-b4859ee6.md, unless named otherwise). Llama 3.2: its licence owner page could not be fetched on 2026-10-02 (the 2026-10-02 corpus's E-15: Firecrawl does not support llama.com, and the keyless fetch reached a sign-on wall), so it would enter as a licence known-unknown, and secondary sources there say its licence carries an acceptable-use policy to pass on (its E-16, E-17); its library entry was last updated 2 years ago (line 43). LFM2.5-thinking and Nemotron-3-nano: follow-up candidates, left out on budget, not on merit (review round 2, fix 6). Neither a thinking tag, nor a cloud tag, nor a 4b size, nor the lack of a licence on disk separates them from the planned families: gemma4 is tagged thinking and cloud with an e4b tag (line 83), qwen3.5 is tagged thinking with a 4b tag (line 104), and no planned family's licence is on disk yet. On disk, lfm2.5-thinking has one 1.2b tag with tools and thinking (line 643), and nemotron-3-nano has tools, thinking and cloud with 4b and 30b tags (line 1022). The 45-credit cap, which the worst case already exceeds (research/DISCOVERY.md, Conditional pages and the 45-credit cap), has no room for the Ollama page and at least one licence page each would add. Ministral 3: Mistral's own FAQ says its open-weight models are Apache 2.0 "for research/individual use; while commercial deployments require a Mistral license" (2026-10-02 Mistral pricing capture, line 235), a licence question for a signed catalogue this plan cannot also settle. Qwen2.5-coder: last updated 1 year ago (line 99), the previous generation of a publisher whose current small line, qwen3.5 (0.8b, 2b, 4b; updated 1 month ago, lines 104-106), is in the plan. Qwen3 1.7B/4B: the same publisher's earlier generation (updated 11 months ago, line 64), whose sizes qwen3.5 covers; only the already pinned qwen3:0.6b is checked. Granite 4.1 and 4.2: their smallest tag is 3b (lines 1309, 1615) and granite4.2 shows no tools tag, while granite4 in the plan covers 350m, 1b and 3b with tools (line 552). FunctionGemma: "fine-tuned explicitly for function calling" from Gemma 3 270M (line 1543), a tool router, not a coding model. SmolLM2: a follow-up candidate on the same footing, with tools and 135m, 360m and 1.7b tags (line 279); the reason first given here (no coding claim, last updated 1 year ago, line 281) does not separate it from the planned phi4-mini, whose entry makes no coding claim either and was also updated 1 year ago (lines 564, 568). The same capture lists further tool-tagged families with a tag of 4b or less: earlier generations of a planned publisher - qwen2, qwen2.5 and qwen3-vl (lines 209, 48, 202) and granite3-dense, granite3-moe, granite3.1-dense, granite3.1-moe, granite3.2, granite3.2-vision and granite3.3 (lines 844, 935, 830, 342, 1342, 900, 753) - left out as Qwen2.5-coder is; and deepseek-r1 1.5b, cogito 3b, hermes3 3b, nemotron-mini 4b and tev1 0.8b and 4b (lines 27, 454, 517, 1078, 1685), follow-up candidates on the same footing as LFM2.5-thinking. A follow-up plan can add any of them at one Ollama page plus one licence page each |
| T-15 | Cloud models left out of this plan | gpt-6-astra, Gemini 3.1 Pro Preview, Mistral Small 4.0, Devstral | DISMISSED | each on evidence already on disk. gpt-6-astra: the same LiveBench coding score as gpt-6.1-sol, 80.4, at $0.736 per successful task against $0.142, about 5x (2026-10-02 LiveBench capture, lines 29-30), and a list price 5x as high ($10 in / $50 out against $2 / $10 per 1M tokens, the 2026-10-02 corpus's E-02). Gemini 3.1 Pro Preview: a preview id, gemini-3.1-pro-preview, with no free tier ("Not available", 2026-10-02 Gemini pricing capture, lines 589-603), and Google states that "Rate limits are more restricted for experimental and preview models" (2026-10-02 rate-limits capture, line 107); its LiveBench coding score is 76.5 at $0.286 (LiveBench capture, line 47). Mistral Small 4.0: Mistral names it "For cost-sensitive projects" and Mistral Medium "For most tasks and coding" (Mistral pricing capture, line 215), and Medium is planned (U-04). Devstral: Mistral's pricing FAQ does not name it, and its open weights in the Ollama library are 24b and 123b (library capture lines 583-589, 805-811, 1415-1421), outside the local size bound. The same page families (developers.openai.com/api/docs/models/<id>, ai.google.dev/gemini-api/docs/models/<id>, docs.mistral.ai/models/model-cards/<id>) hold them for a follow-up |
| T-16 | Reuse terms of third-party model metadata | Shipping a router's catalogue data needs its terms | DISMISSED | U-19 reads what OpenRouter publishes, not whether it may be redistributed; its terms are read only if the design picks that route, because a maintainer refreshing a dated table by hand does not ship the router's data |
| T-17 | Breaking-change history of the cloud model ids | What a vendor's retirement or renaming of an id breaks in a saved profile | DISMISSED | the shortlist pins each cloud id in a dated table copied from the vendor's own model page (U-01..U-04), so a retirement after that date is a refresh of the table (U-19), not a fact this plan can collect in advance; the one retirement on disk is DeepSeek's, whose legacy names deepseek-v4-flash and deepseek-v4-flash-vision-exp "are still accepted, but the corresponding models have been retired" (2026-10-02 DeepSeek capture, line 46, reused under T-2). The planned model-overview pages hold current ids, not deprecation history, so no unknown here claims one |

## Coverage notes (per dimension)

D-1: every planned page is public - vendor docs and model pages, licence files and model cards,
a leaderboard page, a dataset card, a JSON endpoint; Intel's ARK page (U-16) is the one host
that may block automated reads, and U-16 says what replaces it then. D-2, D-3, D-7: dismissed
as stated; auth is the sibling wire-format corpus's, rate limits and prices are the 2026-10-02
corpus's. D-4: vendor data terms for API use (U-07..U-11), model licences on each publisher's
own host (U-14) and the terms attached to leaderboard scores, as distinct from code (U-20).
D-5: model ids come as moving aliases and pinned snapshots on the vendor pages, and the
metadata API's fields are its schema (U-19). D-6: the BFCL update date (U-05), Ollama's release
cadence against the pin (U-13) and a refreshable source (U-19). D-8: runtime version (U-12,
U-13), CPU instruction sets (U-15, U-16), memory and speed on the target machine (U-17, U-18,
known unknowns). D-9: two parts of "done" no page can produce - tool-call reliability in
Moonzila's harness (U-06) and memory and speed on the target machine (U-17, U-18) - so the
shortlist leaves phase 1 as candidates pending qualification, not as qualified models; on the
user's current PC no local model can be offered while free RAM (1,235,644,416 B) is below the
2 GiB reserve (src/models/select.ts:15, :69).
S-1..S-3: current ids and snapshots (U-01..U-04), the Ollama release line (U-13), the
leaderboard's last update (U-05) and the Ollama page update dates (U-12). S-4: the local
runtime's breaking changes are the release notes since v0.34.4 (U-13), and a runtime bump
re-qualifies every configuration (src/models/runtime.ts:43), which is the breaking change that
matters here; the cloud side is dismissed as T-17.
T-2, T-3, T-4, T-14, T-15, T-16, T-17: dismissed as stated, each with the capture or row on
disk that grounds it.

## Candidate material

Gathered 2026-10-05 with recipe `library-selection` (dry run: no pages gathered). Owner hosts
of the planned pages, across research/plan.json, research/plan-2.json and
research/plan-conditional.json: platform.claude.com, developers.openai.com, ai.google.dev,
docs.mistral.ai, legal.mistral.ai, gorilla.cs.berkeley.edu, anthropic.com, cdn.deepseek.com,
openrouter.ai, huggingface.co (the Qwen, ibm-granite, microsoft and livebench organisations),
ollama.com, github.com/ollama/ollama, raw.githubusercontent.com/ollama/ollama, intel.com. No
plan file carries a plan-level `prefer`; each search names only its own owner hosts.
