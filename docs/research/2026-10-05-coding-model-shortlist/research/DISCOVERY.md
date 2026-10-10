# Discovery Contract - Which cloud and local coding models are worth offering in Moonzila as of 2026-10-05: current API model ids with context and output limits, tool-calling reliability, how vendors use and retain API inputs, and for small local models their licences, Ollama availability and sizes, runtime version and CPU requirements

Started 2026-10-05. This file is the definition of "enough information to build".
`node "$HOME/.agents/research-kit/bin/preflight.mjs"` reads it and blocks the build until every unknown
below is either `CLOSED` with evidence or `KNOWN-UNKNOWN` with a verification step.

## Build intent

A dated, curated shortlist of coding models for Moonzila's "More models" task, with the facts
its three directions need: (1) small local models for the signed managed catalogue
(src/models/catalogue.ts), (2) cloud models offered behind the project's inference policy
(how to call the vendors' native APIs is the sibling corpus
docs/research/2026-10-05-provider-wire-formats), and (3) inputs to a selector that ranks
cloud and local models by cost and quality. For each cloud model: the exact API id, context
window, maximum output tokens, tool-calling support, what a published function-calling
benchmark reports for it, and how the vendor uses and retains API inputs on free and paid
tiers - enough to decide whether a tier may receive a user's private code in a cloud-allowed
project. For each small local model (about 4B parameters or fewer): its Ollama tags, download
sizes, context window, tools capability, the minimum Ollama version against the pinned
v0.34.4, its licence from its own licence file or model card and whether that licence lets
the signed catalogue point to or re-host the weights, and whether the pinned runtime runs on
the user's CPU (Intel Pentium 4405U). Done means a table a builder can turn into catalogue
entries and profile presets without re-researching: every row dated, every model id copied
from the vendor's own page, every licence from the model's own licence text, and the facts no
page owns - tool-call reliability in Moonzila's harness, peak memory and speed on the target
machine - named as known unknowns with the measurement that closes each. Prices and coding
ranks come from docs/research/2026-10-02-model-pricing-and-ranking and are not re-collected.

## Unknowns

A fact belongs here when guessing it wrong changes the design: API limits and pricing,
auth model, data schemas, rate limits, licensing/ToS, platform behavior, current library
versions, competitor pricing, data availability.

Status is exactly one of:
- `CLOSED` - proven by an `E-##` row in `research/EVIDENCE.md` (which must point at cached raw text).
- `KNOWN-UNKNOWN` - unreachable now; the `Evidence` cell names the day-one verification step.

Anything else (`OPEN`, blank, "in progress") fails the gate.

Closure review, 2026-10-05 (agent): both runs were collected (31 captures, E-01..E-31) and every
row below was re-read against them. Three rows stayed OPEN, each only for pages that a fired trigger
named: U-11 (Mistral's terms), U-14 (two Granite sizes) and U-15 (the llama-server build file at
v0.34.4); U-07 was closed with its own fired trigger pending as a refinement.

Final closure, 2026-10-05 (agent): run 3 (`research/plan-3.json`, the six pages those triggers
named, every URL copied from a capture) was collected as E-32..E-37, 37 captures in all, and each
was read in full. U-11 closes on Mistral's own commercial terms and privacy policy (E-32, E-33);
U-14 closes on IBM's own 350M card and Granite 4.0 repository (E-35, E-36); U-07 now carries a
number of days, 55, from Google's abuse-monitoring page (E-37). U-15 is KNOWN-UNKNOWN: the
llama-server build file (E-34) installs whatever CPU variant modules the build produced and states
neither the set nor the llama.cpp revision, so the question falls to the day-one log reading its
row names, as planned. No row is OPEN. The plan text that follows is kept as written.

Verification review, 2026-10-05 (agent): adversarial verifiers re-read the rows against the
captures; every claim a capture could not carry was narrowed, and nothing was fetched. Three
rows that had been CLOSED on a part their captures do not answer are now KNOWN-UNKNOWN, each
stating the part that is established and giving a day-one step for the rest: U-04 (Mistral
Medium 3.5's output limit), U-09 (Anthropic's standard API retention, which E-17 defers to a
privacy.claude.com article not collected) and U-10 (how DeepSeek uses, stores and keeps API
inputs: its privacy policy excludes data from apps built on the open platform, and its
training-methods page was not collected). U-05, U-07, U-08, U-11, U-12, U-15 and U-20 were
narrowed or extended in place. 12 rows are CLOSED and 8 KNOWN-UNKNOWN. Pages named for the
collector machine, each URL copied from a capture: the privacy.claude.com retention article
(U-09), DeepSeek's training-methods page (U-10), Mistral's Data Processing Agreement (U-11,
organisation accounts), two BFCL data pages (U-20) and cmake/local.cmake at v0.34.4 (U-15).
The three runs spent about 42 of the 45-credit cap (about 19, 17 and 6), so if they are
collected, the first three come first; the U-20 and U-15 pages otherwise fall to the day-one
steps in their rows.

Collection closed, 2026-10-05 (lead): a fourth run of four owner pages was proposed after the
verification review - the commercial data-retention article for U-09, DeepSeek's model and
algorithm disclosure for U-10, Mistral's data processing addendum for U-11's retention half, and
Ollama's cmake/local.cmake at v0.34.4 for U-15. The user declined it, and nothing was fetched.
Those rows stay as they are, KNOWN-UNKNOWN (or, for U-11, CLOSED with its retention half stated
as not covered), and each one's day-one step names the page to read.

This was the plan stage: the OPEN rows were collected next, in two runs - `research/plan.json`
(run 1, cloud side) and `research/plan-2.json` (run 2, local side) - and
`research/plan-conditional.json` holds the pages run only when a named trigger fires, in the
priority order under "Conditional pages and the 45-credit cap" (see "Collection plan" and
"Capture risks" below).

| ID | Unknown | Why it blocks the build | Status | Evidence |
|---|---|---|---|---|
| U-01 | Which Claude models does the Anthropic API offer today, with their exact API ids and aliases, context windows and maximum output tokens - in particular Fable 5.1, Opus 5.5 and Sonnet 5.5, which the 2026-10-02 table priced? | A preset with a wrong id fails on its first call, and the profile's contextTokens and outputTokens (src/shared/contracts.ts:26) set the budget and maximum output Moonzila sends; a limit from memory either wastes the window or overflows it. | CLOSED | E-01 (Anthropic's models overview, P, retrieved 2026-10-05): Claude API ids claude-fable-5-1, claude-opus-5-5 and claude-sonnet-5-5 (alias = id), each with a 1M-token context window and 128K max output; claude-haiku-4-5-20251001 (alias claude-haiku-4-5), 200K context, 64K max output, retirement not sooner than 2026-10-15; tool use is stated for all current models. The same page says the Models API returns max_input_tokens and max_tokens per model, so a builder can read the limits at runtime. E-15 (OpenRouter) agrees on 1000000 context and 128000 max completion for the three 5.x models - a second reading, never the source of an id. |
| U-02 | What are the API ids and snapshots, context windows, maximum output tokens, tool-calling support and supported endpoints (Chat Completions, or Responses only) of OpenAI's gpt-6.1-sol and gpt-6-luna? | As U-01; and a model offered only on the Responses API cannot run on the openai-compatible kind, which posts to /chat/completions (src/main/inference.ts:145-158). | CLOSED | E-02 and E-03 (OpenAI's model pages, P, retrieved 2026-10-05). gpt-6.1-sol: id and only snapshot gpt-6.1-sol, 1,050,000-token context, 128,000 max output, function calling supported - but tool calling only on the Responses API; Chat Completions serves it without tool calling (E-02). gpt-6-luna: id and only snapshot gpt-6-luna, 1,050,000 context, 128,000 max output; Chat Completions supports function calling only with reasoning_effort none (E-03). Both list v1/chat/completions and v1/responses, and neither has a free tier. E-15 (OpenRouter) independently lists openai/gpt-6.1-sol and openai/gpt-6-luna with 1050000 context and 128000 max completion. So on the openai-compatible kind (POST /chat/completions) gpt-6.1-sol cannot meet the tools requirement, and gpt-6-luna only at reasoning_effort none; whether either accepts Moonzila's exact request is the U-06 day-one probe. No model page 404'd, so the priority-1 catalog fallback did not fire. |
| U-03 | What are the model codes, input and output token limits, function-calling support and stable or preview status of gemini-3.8-flash, gemini-3.7-flash and gemini-3.5-flash-lite? | As U-01. Gemini 3.8 Flash is the model the 2026-10-02 table priced. Gemini 3.7 Flash has the same free tier and the same paid price ($0.75 in and $3.75 out per 1M tokens through 2026-12-31; 2026-10-02 Gemini pricing capture, lines 181-184 against 223-226), Google calls it "built for everyday coding, agentic tool use" (line 219), and LiveBench scores it higher on coding (78.9 against 72.5) and overall (78.8 against 75.8) at about half the cost per successful task ($0.157 against $0.307; 2026-10-02 LiveBench capture, line 38 against line 54). | CLOSED | E-04, E-05, E-06 (Google's model pages, P, retrieved 2026-10-05): gemini-3.8-flash, gemini-3.7-flash and gemini-3.5-flash-lite are each Stable under that code, with input token limit 1,048,576, output token limit 65,536 and function calling Supported; thinking levels low, medium, high on 3.8 and 3.7 Flash (minimal returns an error), Supported without named levels on 3.5 Flash-Lite; latest update September, August and July 2026. E-15 (OpenRouter) agrees on 1048576 and 65536. |
| U-04 | What are the API id, context window, output limit and function-calling support of Mistral Medium 3.5, the model Mistral names "for most tasks and coding"? | As U-01. | KNOWN-UNKNOWN | Three of the four facts are established; the output limit is not, and the row is KNOWN-UNKNOWN for that part alone. E-07 (Mistral's model card, P, retrieved 2026-10-05): name mistral-medium-3-5 (the raw HTML of the same fetch also lists mistral-medium-3 and mistral-medium-latest), version v26.04, GA, context 256k, Function Calling on /v1/chat/completions and /v1/conversations. A maximum output token limit is not stated on Mistral's card; E-15 gives OpenRouter's top-provider figure, 209715 max completion with 262144 context, which is not Mistral's statement and is not adopted. Day one: send one request at the profile's intended outputTokens and confirm Mistral accepts it before the preset ships; until then mistral-medium-3-5 has no outputTokens and is not offered. |
| U-05 | What does the Berkeley Function Calling Leaderboard report today - its version, its last-update date, and its scores - for the cloud models of U-01..U-04 and DeepSeek, and for the small open models of U-12 (Qwen3 and Qwen3.5, Gemma 4, Granite 4, Phi-4-mini), and which of them does it not list? | The only published, model-comparable tool-calling signal before Moonzila's own qualification. It is evidence of what the benchmark reports in its own harness, not proof that a model works in Moonzila (U-06); a leaderboard that lacks today's models is itself the finding. | CLOSED | E-08 (the BFCL leaderboard, P for what BFCL reports, retrieved 2026-10-05): version V4, last updated 2026-04-12, commit f7cf735 (bfcl-eval 2025.12.17), 109 rows. Of the U-01..U-04 cloud models it lists only claude-haiku-4-5-20251001: Claude-Haiku-4-5-20251001 (FC) 68.7, rank 6, and (Prompt) 25.26, rank 87, as BFCL reports it in its own harness. It lists none of the Claude 5.x models (claude-fable-5-1, claude-opus-5-5, claude-sonnet-5-5), the GPT-6.x models (gpt-6.1-sol, gpt-6-luna), the Gemini 3.5, 3.7 and 3.8 models or Mistral Medium 3.5, and no DeepSeek V4, so no model of the first build step has a BFCL row. It lists none of Qwen3.5, Gemma 4, Granite 4.0 1B or 3B (micro), or Phi-4-mini. Of the small candidates it lists only Qwen3-0.6B (FC) 23.93, rank 92, and Granite-4.0-350m (FC) 18.98, rank 103; siblings that are not candidates are listed too, e.g. Qwen3-4B-Instruct-2507 (FC) 35.68, rank 54, and Gemma-3-4b-it (Prompt) 19.62, rank 101. The leaderboard lacking today's models is itself the finding; tool-call evidence for the shortlist is left to U-06. Vendor self-reports (IBM's BFCL v3 figures, E-28; Qwen's BFCL-V4 figure for its 397B model, E-18) are not BFCL's reports. The table was captured, so the priority-7 score-file fallback did not fire. |
| U-06 | Does each shortlisted model produce valid tool calls through Moonzila's own request shape and accumulators - the OpenAI-compatible stream (src/main/provider-stream.ts:100-175) and native Ollama /api/chat - at the app's context and output settings? | The managed catalogue and the selector require tools to pass (lab receipt toolsPassed, src/models/runtime.ts:43; src/models/select.ts:30); no page can own how a model behaves in this harness. | KNOWN-UNKNOWN | A measurement, not a page. Reached for through the benchmark at https://gorilla.cs.berkeley.edu/leaderboard.html (U-05), which reports its own harness only. Day one: for each shortlisted model, run one fixed set of at least 20 tool-call prompts (one tool; two tools in one turn; nested JSON arguments; a turn that must not call a tool) through Moonzila's inference path - complete() in src/main/inference.ts with the model's profile, or the managed Ollama path at num_gpu 0 and the catalogue's context - and record per model the share of turns that end in a terminal tool-call finish with arguments that parse against the tool schema. For local models this run is the moonaliza-coding-v1 lab receipt, whose runner (src/models/qualify.ts, docs/specification/source-plan.md:2592) does not exist yet. |
| U-07 | How does Google use and retain Gemini API prompts and responses on the unpaid (free) tier versus paid services - training or product improvement, human review, and for how long they are logged, in days if any Google page states a number? | Decides whether the free Gemini tier may be offered for private code, and what the UI must say before a cloud-allowed project sends code to it. | CLOSED | E-09 (Google's Gemini API Additional Terms, P, retrieved 2026-10-05). Unpaid quota: prompts and responses are used to provide, improve and develop Google products and machine-learning technologies, human reviewers may read, annotate and process API input and output, and Google says not to submit sensitive, confidential or personal information. Paid (a Cloud project with an active billing account): prompts and responses are not used to improve products, and are logged for a limited period of time solely to enforce the Prohibited Use Policy, to maintain the safety and security of the Services, and for legal or regulatory disclosures - no number of days is stated in the terms. Grounding with Google Search and Grounding with Google Maps each store prompts, contextual information and output for 30 days, on either tier, and both are Supported on the three shortlisted Gemini models (E-04, E-05, E-06). In the EEA, Switzerland and the UK the paid data terms apply to all Services, free quota included. E-37 (Google's Abuse monitoring page, P, retrieved 2026-10-05; collected as the priority-10 refinement) gives the number. The terms' text does not link that page - the terms page lists it in its docs navigation (E-09, raw HTML line 999) - and the page itself cites the Additional Terms (abuse capture lines 74-76) and states its logging purpose in the same words as the terms' paid-tier logging, which is what ties its period to the terms' "limited period of time": Google retains prompts, contextual information and responses for 55 days to detect and prevent Prohibited Use Policy violations and for legal or regulatory disclosures; flagged content may be assessed by authorised Google employees; the logged data is not used to train models other than those used for policy enforcement; and the page's scope is all use of the Gemini API and AI Studio, with no paid or unpaid line. So Moonzila states 55 days for paid-tier logging, and the same abuse-monitoring logging applies to the unpaid quota, whose content is also used for product improvement for a period neither page states. [single-witness: Google's own Gemini API terms and abuse-monitoring page are the only pages that can bind how Google uses and keeps API data; both are Google's, and a third-party page could only repeat them] |
| U-08 | Does OpenAI use API inputs and outputs for training by default, how long does it retain them, is zero data retention available, and does any free-token program share inputs with OpenAI? | The same decision for OpenAI. | CLOSED | E-10 (OpenAI's data controls guide, P, retrieved 2026-10-05): API data is not used to train or improve OpenAI models unless the customer explicitly opts in to share; abuse-monitoring logs, which may contain prompts and responses, are kept up to 30 days by default; /v1/chat/completions keeps no application state by default ("None, see below for exceptions"), the exceptions being audio outputs (1 hour), prompt-cache key/value tensors (not retained after 24 hours), a store parameter (always false under Zero Data Retention; no period is given when it is true) and image or file inputs a CSAM classifier flags, which are retained for manual review even under Zero Data Retention; its Zero Data Retention eligibility reads "Yes, see below for limitations"; /v1/responses keeps application state for at least 30 days by default or when store is true (background mode about 10 minutes, audio outputs 1 hour); Zero Data Retention and Modified Abuse Monitoring exist subject to OpenAI's prior approval. A free-token program that shares inputs is not stated on this page; the only sharing it names is the explicit opt-in. [single-witness: OpenAI's own data-controls guide is the page that owns OpenAI's API data commitments; any other page could only repeat it] |
| U-09 | Does Anthropic use commercial API inputs and outputs for training, and how long does it retain them? | The same decision for Anthropic. | KNOWN-UNKNOWN | The training half is established; the retention half is not, and the row is KNOWN-UNKNOWN for that half alone. Training: E-11 (Anthropic's Commercial Terms, P): Anthropic may not train models on Customer Content (Inputs and Outputs); E-17 (Anthropic's API data-retention page on platform.claude.com, kept by the search as S, read and promoted to P): retained data is never used for training without express permission. Retention: E-17 does not set Anthropic's standard retention - for standard retention outside ZDR and HIPAA it sends the reader to the commercial data retention policy at https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data (E-17 capture line 16), which was not collected. Its sentence that conversation content "is not retained by default" is one of its commitments for features that necessarily require storage (lines 20-23), and its ZDR section (nothing stored at rest after the response, line 30) would add nothing if standard API use stored nothing, so that sentence is not read as the standard retention period. What E-17 does state, and Moonzila keeps: Covered Models (Claude Fable 5.1, Mythos 5.1, Fable 5, Mythos 5) require 30-day retention and are not available under ZDR unless authorised; Batch processing 29 days; flagged content up to 2 years, whatever the arrangement; ZDR by request to sales. The priority-4 trigger (no retention period stated by an Anthropic page) therefore fired, its page was not collected in run 3, and the plan's fallback applies: Moonzila states no standard retention period for Anthropic. Day one, on the collector machine: collect that privacy.claude.com article (URL copied from the E-17 capture, line 16), read the retention period it gives for API inputs and outputs, and replace "not stated" in the UI disclosure with it. |
| U-10 | How does DeepSeek use API inputs (training, service improvement), where does it store them, and for how long? | The same decision for DeepSeek; storage under another jurisdiction is something the UI must disclose. | KNOWN-UNKNOWN | Neither captured DeepSeek page states how API inputs are used, where they are stored or for how long. E-12 (DeepSeek Open Platform terms, P): the customer keeps Inputs and is assigned Outputs; training use, storage location and retention of API inputs are not stated; section 5.5 sends the developer's own personal information to the privacy policy but says the processing rules for personal information of the developer's end users, in what the developer builds on the open platform, are not covered by it; PRC law governs the terms. E-13 (DeepSeek privacy policy, P): within its scope - DeepSeek apps, websites, software and related services, and per E-12 the developer's own personal data - prompts and uploaded files are collected User Input, used among other purposes to train and improve DeepSeek's technology; an opt-out of training is listed only among rights that may be available; for providing the Services data is kept as long as the account exists, and longer, with no period stated, for legitimate business interests (including improving and developing the Services), legal obligations, legal claims or after a violation; data is collected, processed and stored in the People's Republic of China. The same policy excludes personal data of end users of applications developers build on the open platform (lines 33-36), so it does not establish that prompts sent through the API are used for training or stored in the PRC. Both pages link DeepSeek's own training-methods page, https://cdn.deepseek.com/policies/en-US/model-algorithm-disclosure.html (E-13 capture line 41; E-12 capture line 437), which was not collected. Until a DeepSeek page commits to not training on API inputs, DeepSeek is not offered for private code - a conservative choice, not a finding that it trains on them. Day one, on the collector machine: collect that training-methods page (URL copied from the captures) and read whether API inputs are used for training, where they are stored and for how long. |
| U-11 | Under Mistral's API terms - not its consumer plan table - are inputs and outputs sent to the API with an API key used to train Mistral's models by default, does that differ when the API use is paid from the API credits bundled with the Free and Pro plans versus pay-as-you-go, can it be opted out, and how long are API inputs and outputs retained? | The same decision for Mistral. The 2026-10-02 pricing capture shows only a consumer plan table ("Model training" Opt-out, lines 200-202) that also bundles API credits into the Free and Pro plans (lines 54, 91, 106), which says nothing certain about API traffic. | CLOSED | E-32 (Mistral's Commercial Terms of Service, P) and E-33 (Mistral's Privacy Policy, P), both retrieved 2026-10-05 from the links in the legal-centre index the planned URL returned (E-14). Training: the commercial terms bar training on Customer Data or Outputs except where the customer opted in on a product set to opt-out by default, has not opted out on a product set to opt-in by default, gives Feedback, agrees it in an Order Form, or uses Labs or Preview Models (E-32, section 4.2). Neither page says which default the API has, and the privacy policy lists "Your Input and Output, subject to your opt-out" among the data used to train (E-33), so Moonzila treats Mistral API inputs and outputs as used for training unless the account has opted out. Opt-out: yes, an account setting that objects to training on input and output (E-33); it never covers Labs or Preview Models (prefix "labs"), where Mistral may train on Customer Data and Outputs and neither the opt-out nor zero data retention applies (E-32, section 4.3). Free-plan credits against pay-as-you-go: neither page draws any line by plan or by how API use is paid (E-32, E-33); the commercial terms cover organisations and send an individual consumer to consumer terms that were not collected (E-32, line 16). That residual changes no design, because the rule above already assumes training unless opted out, whatever the plan. Retention: the privacy policy gives its periods "for illustrative purposes" (E-33, line 90): API inputs and outputs are kept as long as needed to generate the output, then 30 rolling days to monitor abuse unless zero data retention is activated; the Agents API keeps them until the account ends, fine-tuning data until deleted (E-33). The policy does not apply to personal data processed in the context of the customer's business activities, where Mistral is the customer's processor (E-33, line 16) under the Data Processing Agreement the commercial terms name (E-32, section 12.3, line 150), which was not collected and may state other periods; for that use the retention period is not established. So Mistral may receive private code in a cloud-allowed project only after the user confirms that the training opt-out is set on their Mistral account, never on a labs or preview model, and with retention disclosed as the privacy policy's illustrative 30 days, noting that an organisation's DPA may differ. Day one, before that disclosure ships for organisation accounts: on the collector machine, collect https://legal.mistral.ai/terms/data-processing-addendum (URL copied from the E-32 capture, line 150) and read its retention clause. [single-witness: Mistral's own commercial terms and privacy policy are the only pages that can bind how Mistral uses and keeps API inputs; both are Mistral's, and a third-party page could only repeat them] |
| U-12 | Which tool-capable models of about 4B parameters or fewer does the Ollama library list today for Qwen3.5, Gemma 4, Granite 4 and Phi-4-mini - each small tag's name, download size and context window, the capability tags, any cloud tag that runs off the machine, and the minimum Ollama version the page states? | The candidate list for the signed catalogue (src/models/catalogue.ts:10-16). A model that needs a newer Ollama than the pinned v0.34.4 cannot run without a runtime bump, and a cloud tag must never enter a local catalogue (the managed runtime sets OLLAMA_NO_CLOUD, src/models/managed-ollama.ts:77). Download size bounds the download, not memory (U-17). Only the qwen3:0.6b size is reused from docs/handoff/work/research E-17 (2026-09-26); Qwen3's 1.7b and 4b are not shortlisted (see "Already decided"). | CLOSED | E-18..E-21 (Ollama library pages, P for Ollama's registry, retrieved 2026-10-05). qwen3.5 (tools, vision, thinking): 0.8b 1.2-1.3GB, 2b 2.7-3.1GB, 4b 3.3-4.0GB, all 256K context (E-18). gemma4 (tools, vision, thinking, audio, cloud): e2b 4.6-7.5GB and e4b 6.6-9.5GB, 128K context; among the 13 of its 51 tags the page shows, gemma4:cloud and gemma4:31b-cloud run off the machine and must never enter the catalogue (E-19). Gemma 4 E2B is 2.3B effective parameters (5.1B with embeddings) and E4B 4.5B effective (8B with embeddings), on Google's own card (E-27; E-19's readme re-hosts the same table): by parameters with embeddings both exceed the about-4B bound, by effective parameters E2B is inside it and E4B at its edge - one measure applies to both, a builder's call. granite4 (tools): 350m 708MB 32K, 1b 3.3GB 128K, 3b (micro) 2.1GB 128K (E-20). phi4-mini (tools): 3.8b 2.5GB 128K (E-21). Sizes are the pages' Size / Usage column, which the pages do not define (E-18); they are taken as neither download size nor peak memory - the download size is recorded from the day-one pull and peak memory measured by U-17. Minimum Ollama version: 0.5.13 for phi4-mini (E-21); not stated on the qwen3.5, gemma4 or granite4 pages. No cloud tag appears among the tags the other three pages show, and each shows a subset (E-18: 72 tags; E-20: 4 of 17; E-21: 2 of 5), so the catalogue admits no tag named cloud or ending in -cloud and checks each model's full tag list at pull time. Day one: on the pinned v0.34.4, ollama pull every candidate tag and record whether the registry refuses it as needing a newer Ollama - gemma4 first (updated after v0.35.0, E-19, E-22), then qwen3.5 (updated hours before capture, E-18). |
| U-13 | What is the latest Ollama release today, how far behind it is the pinned v0.34.4, and do the release notes since v0.34.4 add support or fixes that a U-12 candidate needs? | A runtime bump re-qualifies every configuration on it (the receipt binds the runtime digest, src/models/runtime.ts:43; docs/specification/source-plan.md:793), so whether the candidates run on v0.34.4 decides whether direction 1 also needs a runtime change. | CLOSED | E-22 (Ollama's GitHub releases, P, retrieved 2026-10-05): latest stable v0.35.1 (29 Sep), before it v0.35.0 (28 Sep); the pinned v0.34.4 (23 Sep) is two stable releases behind, and v0.40.0-rc3 is a pre-release. The notes since v0.34.4 add decision models on /v1/systemone, Modelfile CAPABILITY declarations, a typical_p warning, updated llama.cpp and MLX, and MLX by default on Apple Silicon; none names support or a fix that a U-12 candidate needs on an x64 CPU. Gemma 4 support predates the pin (the v0.34.3 and v0.34.4 notes name it); phi4-mini needs 0.5.13 (E-21). What the notes cannot settle - whether a tag updated after the pin is refused on v0.34.4 - is the U-12 day-one pull. |
| U-14 | Under what licence is each small candidate published, read from its own licence file or model card on the publisher's own host, and does that licence let Moonzila's signed catalogue point to or re-host the weights - the redistribution clause, notice and attribution duties, and any use restrictions that must be passed on? In particular, is qwen3:0.6b, already pinned in scripts/check-model-store.ts, under Apache 2.0, or under the "Qwen License" with a 100-million-MAU threshold that a secondary source claims for most Qwen3 sizes (docs/research/2026-10-02-model-pricing-and-ranking/research/raw/2026-10-02-open-llm-licenses-compared-apache-vs-mit-bestllmfor-75616264.md:103)? | A licence that forbids redistribution, or attaches conditions the app must carry, decides whether a model may be in the catalogue at all; docs/specification/local-model-sources.md:44 records redistribution licensing as not established. | CLOSED | Settled from each publisher's own text: qwen3:0.6b Apache 2.0, Copyright 2024 Alibaba Cloud (E-23) - not the Qwen License with a 100-million-MAU threshold the secondary source claimed; qwen3.5 0.8b, 2b and 4b Apache 2.0, Copyright 2026 Alibaba Cloud (E-24, E-25, E-26); Gemma 4 Apache 2.0 on Google's model card (E-27), so the priority-2 Gemma Terms page did not fire; Granite-4.0-1B Apache 2.0 on IBM's card (E-28); Phi-4-mini-instruct MIT, Copyright (c) Microsoft Corporation (E-29). Apache 2.0 section 4 lets the catalogue point to or re-host the weights if Moonzila passes on the licence, keeps the copyright and attribution notices and any NOTICE attributions, and marks modified files (E-23); MIT requires the copyright and permission notice to travel with the weights (E-29); neither attaches a use policy. The two Granite sizes the 1B card did not cover (it states its licence for that model only, E-28, and Ollama's Apache 2.0 line, E-20, is not the publisher's) fired the priority-8 trigger and were collected in run 3: granite4:350m is Apache 2.0 on IBM's own Granite-4.0-350M card, which states it for that model (E-35); granite4:3b, which Ollama also tags granite4:micro (E-20), is Apache 2.0 by IBM's own Granite 4.0 repository, which names ibm-granite/granite-4.0-micro and states that all Granite 4.0 Language Models are distributed under Apache 2.0 (E-36). So no Granite size leaves the shortlist on licence grounds, and the same Apache 2.0 section 4 duties apply to them (E-23). |
| U-15 | Which CPU instruction-set variants does the pinned Ollama v0.34.4 build for Windows x64 (baseline x64, SSE4.2, AVX, AVX2 and newer), and does it serve a CPU without AVX? | If the pinned runtime needs an instruction set the user's CPU lacks (U-16), no local model runs on this PC whatever its memory. The Ollama Windows system requirements captured 2026-09-26 (docs/handoff/work/research E-11) name no CPU instruction set. | KNOWN-UNKNOWN | Reached for on Ollama's own build files at the pinned tag; neither states it. E-30 (Ollama's root CMakeLists.txt at v0.34.4, P): it sets no CPU variant option and vendors no ggml - the GGML backend is llama-server, built from llama/server/CMakeLists.txt with FetchContent from the pinned llama.cpp source, which is why the planned ml/backend/ggml/ggml/src/CMakeLists.txt path answered 404 (reported by the collector; not a row). E-34 (that llama-server file at v0.34.4, P, collected in run 3 at the path E-30 states): it sets no instruction-set option, reads the llama.cpp commit from a separate LLAMA_CPP_VERSION file it does not contain, and for the CPU build installs every ggml-cpu*.dll module the build produced - "multiple variants from GGML_CPU_ALL_VARIANTS", named by llama.cpp from detected CPU features. Whether that option is on for the Windows x64 release, which variants it yields and whether one needs no more than SSE4.2 live in build settings and llama.cpp source that no capture holds. Candidate pages, none collected: cmake/local.cmake at v0.34.4, which E-30 includes (line 78) and names as where backend build rules live (lines 49-50); the LLAMA_CPP_VERSION file E-34 reads (line 123); and the release workflow (priority 9), which no capture links. Even read, those pages would state what the build requests, not what the shipped payload holds on this machine. Day one, on the Pentium 4405U (no AVX, E-31): install the pinned Ollama v0.34.4, list the ggml-cpu*.dll files in its lib/ollama directory (the install layout E-34 describes), start the server, load any small candidate tag with num_gpu 0, and read from the server log which CPU backend library it loaded and its system-info line (AVX = 0 expected), or whether it fails for lack of AVX (U-16). If no variant loads, no local model is offered on this PC until a runtime that ships one is pinned and re-qualified. |
| U-16 | Which instruction-set extensions - SSE4.1, SSE4.2, AVX, AVX2 - does the user's CPU, the Intel Pentium 4405U, support? | With U-15, decides whether the local path can run on this PC at all, and in which CPU build. | CLOSED | E-31 (Intel's ARK page on intel.com, kept by the search as S, read and promoted to P, retrieved 2026-10-05): the Pentium 4405U lists Instruction Set Extensions Intel SSE4.1 and Intel SSE4.2 only; AVX and AVX2 are not listed. With U-15, a local model runs on this PC only if the pinned runtime ships a CPU build that needs no more than SSE4.2. A cheap day-one confirmation is the runner's system-info line on the target machine (AVX = 0 expected). [single-witness: Intel's ARK page owns the processor's specification; the independent check is the day-one runner log on the target machine, not another web page] |
| U-17 | What peak memory does each small candidate use on the pinned runtime, CPU only, at the app's context (the num_ctx of its catalogue configuration)? | The selector admits a model only if its required RAM fits under available memory minus the reserve max(2 GiB, 15% of RAM) (src/models/select.ts:15, :41); download size is not peak memory (docs/specification/local-model-sources.md:34). | KNOWN-UNKNOWN | No page owns it. Reached for through the model pages, e.g. https://ollama.com/library/qwen3.5 (U-12), which give an undefined Size / Usage figure only. Day one: on the target machine once its free memory clears the reserve (on the user's current PC only after memory is freed, see "Already decided"; otherwise on a machine that clears it), start the pinned Ollama v0.34.4 with num_gpu 0, load each candidate tag with the catalogue's num_ctx, send one prompt, then read GET /api/ps (size, size_vram 0, context_length) and the process's peak working set, and record them with the tag's digest. |
| U-18 | How fast does each small candidate run on the user's CPU on the pinned runtime - load time, time to first token, tokens per second? | The machine receipt requires load within 90 s, first token within 30 s and at least 4 tokens per second (src/models/select.ts:37-48); a model that fits in memory but runs slower is not offered. | KNOWN-UNKNOWN | No page owns it, and none is reached for: a speed on this CPU is on no page, so the collection-attempts warning this row will raise is accepted rather than cleared by citing a page that cannot hold the fact. Day one: in the same run as U-17, on the Pentium 4405U, for a fixed prompt of about 1,000 tokens and a 200-token reply per tag, record from the final /api/chat chunk load_duration, prompt_eval_duration, eval_count and eval_duration - defined, in nanoseconds, in the Ollama API reference already captured at docs/research/2026-09-28-open-gaps/research/raw/2026-09-28-generate-a-chat-message-ollama-ollama-03d080ba.md lines 245-299 - plus the client-side time to the first streamed chunk; tokens per second is eval_count divided by eval_duration in seconds. |
| U-19 | Does OpenRouter's public models API publish, per model, the price, context length, maximum completion tokens and tool support (supported parameters) in machine-readable form, without a key? | Decides whether the dated model table can be refreshed from one machine-readable source instead of re-reading five vendor pages. | CLOSED | E-15 (OpenRouter's models endpoint, P for its own catalogue, capture graded full, fetched with no OpenRouter credential in the recorded command): one JSON document of 466 model objects, each with per-token pricing, context_length, top_provider.max_completion_tokens and supported_parameters (tools where offered), so the dated table can be cross-checked from one machine-readable source. Limits: OpenRouter's ids are its own; supported_parameters describe OpenRouter's API, not the vendor's (it marks tools for openai/gpt-6.1-sol, which OpenAI's Chat Completions serves without tools, E-02); and its max completion can differ from the vendor (E-07 states none for Mistral Medium 3.5, E-15 gives 209715). Model ids and limits stay sourced from the vendors' pages (U-01..U-04). |
| U-20 | What licence or terms, if any, does each publisher - LiveBench and the Berkeley Function Calling Leaderboard - attach to its published scores, as distinct from its code or its question set, and do they permit shipping the scores inside an app as a ranking input, with what attribution? | Direction 3 ranks models; shipping a third party's scores in a product needs terms that allow it. A code licence does not cover score data, and the 2026-10-02 livebench.ai capture has no licence, terms or citation text, so neither the code licences nor that page can answer this. | KNOWN-UNKNOWN | Reached for on both publishers' own pages; neither states terms for its scores. LiveBench: the model_judgment dataset card (E-16) states no licence and no terms. BFCL: the leaderboard (E-08) states none; its License column is each model's licence, and it gives a citation and a discord contact. Two BFCL pages that may carry terms for its data were not reached: its model responses at https://github.com/HuanzhiMao/BFCL-Result (E-08 capture line 168) and its code and data at https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard (lines 22-23). Day one, per publisher: on the collector machine, collect those two BFCL pages (URLs copied from the capture) and read any data licence; and ask in writing whether the scores may be shipped in an app as a ranking input and with what attribution - BFCL through the contact its page names (https://discord.gg/grXXvj9Whz, E-08 capture line 164); LiveBench through a contact found from the two links its card gives, the leaderboard https://livebench.ai/ (E-16 capture line 140) and the paper https://arxiv.org/abs/2406.19314 (line 142) - the card names a GitHub readme but gives no URL for it. Until each answers, the app ships no copy of its scores, only a dated link to the leaderboard. |

## Questions for the human (maximum 3)

None. Every open question here is a fact a page owns, or a measurement named above.

Intent questions only - things no document can answer. Facts never go here; they go in
the table above. If a question's answer is in public documentation, it is a research
task, not a question.

## Already decided

Locked decisions for this project. Do not revisit these without the human.

- Reused, not re-collected (all retrieved 2026-10-02, inside the 30 refresh days, and cited by
  path in their own corpora's ledgers): prices and the cost formula (the 2026-10-02 corpus's
  U-01, U-02), coding ranks (its U-03), Gemini rate limits (its U-06), and the DeepSeek models -
  its E-04 holds the ids deepseek-flash and deepseek-v4-pro and the 1M context; only the
  384K maximum output, tool-call support and the retired legacy names rest on that row's raw
  capture alone, `2026-10-02-models-pricing-deepseek-api-docs-deepseek-8eb12065.md` lines 24-46
  (lines 30, 32 and 46). Also reused: the qwen3:0.6b tag size (docs/handoff/work/research E-17,
  2026-09-26) and the Ollama Windows system requirements (same corpus, E-11).
- A benchmark score is evidence of what the benchmark reports, never proof a model works in
  Moonzila. Only a lab receipt (suite moonaliza-coding-v1, quality at least 0.85, tools passed;
  src/models/runtime.ts:43) qualifies a local model. Leaderboards are read as published; no
  benchmark is run here.
- Local models that do not fit are not offered. On the user's current PC, free RAM
  (1,235,644,416 B) is below the 2 GiB reserve, so the local shortlist serves other machines
  until memory is freed (src/models/select.ts:15, :69). Download size is not peak memory.
- Cloud models stay behind the project's inference policy: a local-only project never sends
  prompts off the machine, so a vendor's data terms decide only what is offered to
  cloud-allowed projects.
- Scope of this plan: the cloud models and small families named in U-01..U-04 and U-12 (Gemini
  3.7 Flash added to U-03 in review round 2, Gemini 3.5 Flash-Lite after round 3), plus the already pinned qwen3:0.6b; Qwen3's 1.7b and 4b are not shortlisted (Qwen3.5 covers those
  sizes from the same publisher). The others are listed as left out in research/MAP.md (T-14,
  T-15), each excluded on evidence on disk, or deferred on budget.
- Budget: at most 45 Firecrawl credits for this project, and never more. Planned: run 1 about
  19 credits (16 named pages, 1 search keeping 1 page), run 2 about 17 credits (14 named pages,
  1 search keeping 1 page) - about 36 together. Conditional: research/plan-conditional.json
  about 10 more (7 named pages, 1 search keeping 1 page), plus up to 10 pages whose URLs can
  only be copied from a capture these runs make (a U-02 model page at the slug the catalog
  gives, up to 2; a U-14 repository link, up to 6; the BFCL score file; the relocated ggml
  file). If every trigger fired the project would need about 55 credits, 10 over the cap
  (review round 2, fix 3, corrected the earlier "about 42", which left out the last two). It
  does not spend them: conditional pages are collected in the priority order under
  "Conditional pages and the 45-credit cap", and those past 45 give way, each to the
  fallback named there.

## Collection plan

Two runs, because one deep run collects at most 25 pages (`research-run.mjs`: budget =
min(maxScrapes, 25)) and the plan needs 31 pages before any conditional one. Each plan file
caps its own run with `maxScrapes` equal to its page count, so a run cannot spend past its
share. No plan file has a plan-level `prefer`: `research-run.mjs` merges it into every
query's own list, which would give every listed host the owner's +10 in every search; each
query names only its own owner hosts.

```
node "$HOME/.agents/research-kit/bin/research.mjs" --plan research/plan.json      # run 1, cloud side, 16 pages
node "$HOME/.agents/research-kit/bin/research.mjs" --plan research/plan-2.json    # run 2, local side, 15 pages
```

`research/plan-conditional.json` is not run unless the lead decides, and then only the
entries whose trigger fired (each entry's `why` names its priority and trigger). `--only`
filters queries, not urls, so the fired entries are copied into a plan of their own, or the
others deleted, together with any copied-from-capture page below, in priority order and
within what is left of the 45 credits.

Where each planned URL comes from - a grep, 2026-10-05, of every raw capture under
`docs/` in this repository for the URL itself:

| Planned URL | Plan | Source of the URL |
|---|---|---|
| https://platform.claude.com/docs/en/models/overview | run 1 | linked: docs/research/2026-09-28-open-gaps .../2026-09-28-token-counting-claude-platform-docs-claude-29ea82f0.md:30; docs/handoff/work/research/raw/2026-09-24-thinking-claude-platform-docs-claude-03550646.md:54 |
| https://developers.openai.com/api/docs/models/gpt-6.1-sol | run 1 | pattern only: the 2026-10-02 OpenAI pricing capture links .../api/docs/models/gpt-live-1 (line 178), not this id |
| https://developers.openai.com/api/docs/models/gpt-6-luna | run 1 | pattern only, as above |
| https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash | run 1 | linked: 2026-10-02 Gemini pricing capture, line 173 |
| https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash | run 1 | linked: 2026-10-02 Gemini pricing capture, line 215 |
| https://docs.mistral.ai/models/model-cards/mistral-medium-3-5-26-04 | run 1 | linked: 2026-10-02 Mistral pricing capture, line 215 |
| https://gorilla.cs.berkeley.edu/leaderboard.html | run 1 | linked from no capture; the publisher's address |
| https://ai.google.dev/gemini-api/terms | run 1 | linked: 2026-10-02 Gemini pricing capture, lines 142, 154 and every "Used to improve our products" row |
| https://developers.openai.com/api/docs/guides/your-data | run 1 | linked: 2026-10-02 OpenAI pricing capture, lines 283, 291; 2026-09-29 error-codes capture, line 69 |
| https://www.anthropic.com/legal/commercial-terms | run 1 | linked from no capture; the owner's address |
| https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html | run 1 | linked from no capture (the DeepSeek pricing capture links only api-docs.deepseek.com guides) |
| https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html | run 1 | linked from no capture, as above |
| https://legal.mistral.ai/terms/terms-of-service | run 1 | pattern only; the Mistral pricing capture links no legal page |
| https://openrouter.ai/api/v1/models | run 1 | linked from no capture; OpenRouter's documented public endpoint |
| https://huggingface.co/datasets/livebench/model_judgment | run 1 | pattern only; the livebench.ai capture holds no links |
| https://ollama.com/library/qwen3.5, /gemma4, /granite4, /phi4-mini | run 2 | linked: 2026-10-02 Ollama library capture, lines 106, 85, 554, 568 |
| https://github.com/ollama/ollama/releases | run 2 | linked: 2026-10-02 Ollama repository capture, lines 585, 591, and two older captures |
| https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE | run 2 | pattern only: no capture links it; the bestllmfor capture links the sibling https://huggingface.co/Qwen/Qwen3-32B/blob/main/LICENSE (line 103) |
| https://huggingface.co/Qwen/Qwen3.5-0.8B/blob/main/LICENSE, -2B, -4B | run 2 | pattern only: captures link https://huggingface.co/Qwen/Qwen3.5-397B-A17B, no small size |
| https://ai.google.dev/gemma/docs/core/model_card_4 | run 2 | linked: 2026-10-02 Gemini pricing capture, line 1268 |
| https://huggingface.co/ibm-granite/granite-4.0-1b | run 2 | pattern only; no capture links an ibm-granite repository |
| https://huggingface.co/microsoft/Phi-4-mini-instruct/blob/main/LICENSE | run 2 | pattern only; no capture links a microsoft Hugging Face repository |
| https://raw.githubusercontent.com/ollama/ollama/v0.34.4/CMakeLists.txt | run 2 | pattern only: the tag's raw path is proven by three v0.34.4 captures in docs/handoff/work/research, the file name by the 2026-10-02 repository capture of main (line 105) |
| https://raw.githubusercontent.com/ollama/ollama/v0.34.4/ml/backend/ggml/ggml/src/CMakeLists.txt | run 2 | pattern only: main's tree has ml/ (repository capture line 83), but the path inside it at v0.34.4 is not on disk |
| https://developers.openai.com/api/docs/models | conditional, priority 1 | linked: 2026-10-02 OpenAI pricing capture, line 33 |
| https://ai.google.dev/gemini-api/terms#PLACEHOLDER-... | conditional, priority 10 | placeholder: replace with the abuse-monitoring or usage-policies link the U-07 terms capture gives before running; unreplaced, a cache hit on that capture |
| https://www.anthropic.com/legal/commercial-terms#PLACEHOLDER-... | conditional, priority 4 | placeholder: replace with the privacy-centre, privacy-policy or DPA link the U-09 commercial-terms capture gives before running; unreplaced, a cache hit on that capture |
| https://huggingface.co/ibm-granite/granite-4.0-350m, .../granite-4.0-micro | conditional, priority 8 | pattern only; replace with the repository names the granite4 Ollama page or the 1b card links |
| https://ai.google.dev/gemma/terms | conditional, priority 2 | pattern only; replace with the link the Gemma 4 model card gives |
| https://raw.githubusercontent.com/ollama/ollama/v0.34.4/.github/workflows/release.yaml | conditional, priority 9 | pattern only: main's tree has .github/ (repository capture line 61); the file name is not on disk |

## Capture risks and their resolution

- **A planned page 404s.** Pattern-only URLs (table above) may not exist. A 404 costs one
  credit, is recorded, and is not fetched again within the 30 refresh days. The unknown it
  served then rests on its other planned page, its conditional fallback, or becomes
  KNOWN-UNKNOWN citing the failed attempt with a day-one step - never on a guessed second
  spelling. A URL copied from a capture this project made is not a guessed spelling, and two
  unknowns have one (review round 2, fixes 4 and 5):
  - U-02: if a model page 404s, the OpenAI model catalog (conditional, priority 1; linked from
    the 2026-10-02 OpenAI pricing capture, line 33) shows the real slug, and the model page it
    links is collected with its URL copied from the catalog capture. A model the catalog does
    not list is not offered.
  - U-14: a Hugging Face licence URL that 404s - the three Qwen3.5 LICENSE files, the
    granite-4.0-1b card, the Phi-4-mini-instruct LICENSE, the Qwen3-0.6B LICENSE - is replaced
    by the repository link a run-2 capture gives for that model, copied, as a conditional page
    (priority 3). The four Ollama library pages are in the same run and may name their source
    repositories. Qwen3-0.6B has no Ollama page in run 2, and the reused qwen3 tags capture
    (docs/handoff/work/research E-17) names no repository, so its replacement exists only if
    another run-2 capture links Qwen3-0.6B's repository. Where no capture gives the link, that
    model's licence row is KNOWN-UNKNOWN with the day-one step of collecting, on the collector
    machine, the licence from the repository the publisher's own Hugging Face organisation lists
    for that model, and the model stays out of the catalogue until it closes.
- **The BFCL leaderboard is loaded by script (U-05).** If the capture holds only a placeholder
  and no scores, that is recorded as the U-05 finding and U-05 becomes KNOWN-UNKNOWN citing
  that capture, with the day-one step of reading the leaderboard's version, date and the
  shortlisted models' rows on the publisher's page. No mirror or third-party copy is searched
  for, and the shortlist's tool-calling evidence is left to U-06. The one further page
  allowed is a score file the captured page itself links on gorilla.cs.berkeley.edu, added as
  a conditional page (priority 7) with its URL copied from the capture. For U-20, BFCL's terms are then
  whatever the placeholder page states, or none.
- **The OpenRouter models JSON is large (U-19).** A capture graded partial (its front matter
  names what was omitted) can still close U-19's question - whether the endpoint publishes,
  without a key, per-model price, context length, maximum completion tokens and supported
  parameters - if it holds at least one whole model object carrying those fields; under this
  machine's evidencePolicy (pluralist) the gate then warns that U-19 rests on a partial
  capture, and the brief says so. A partial capture cannot show which models the endpoint
  lists, cannot give any value for a model outside what arrived, and is never the source of a
  model's id or limits, which rest on the vendors' own pages (U-01..U-04). If no whole model
  object arrived, U-19 becomes KNOWN-UNKNOWN with the builder's day-one step of reading one
  model object from the endpoint.
- **The Gemini terms give no logging period (U-07).** Then U-07 closes on what the terms say
  and claims no number of days. A number needs Google's own page on abuse monitoring or usage
  policies, and only at the URL the terms capture links: the conditional entry (priority 10)
  carries a placeholder - a fragment on the terms page, so it is a cache hit if run unreplaced -
  that is replaced by that link before it runs, and is not run if the terms link none.
- **The U-09 search keeps no Anthropic page.** A page the search keeps is type S, and is
  promoted to P only if it is on privacy.claude.com, support.claude.com, platform.claude.com,
  or anthropic.com or one of its subdomains. If it keeps none, or the page it keeps states no
  retention period, U-09 claims no retention period unless the commercial-terms capture states
  one; its training half still closes on the commercial terms, and its retention half is
  KNOWN-UNKNOWN with the day-one step in its row. The conditional entry (priority 4) collects
  the privacy-centre, privacy-policy or data processing addendum page the commercial-terms
  capture links, with its URL copied from that capture and never guessed.
- **Intel ARK blocks automated reads (U-16).** Then U-16 becomes KNOWN-UNKNOWN with the
  measurement written in its row.
- **The ggml path moved before v0.34.4 (U-15).** The 2026-10-02 capture of main shows a commit
  "runner: Remove CGO engines, use llama-server exclusively for GGML mod..." (line 80), so the
  vendored ggml may not sit under ml/backend at the tag. The root CMakeLists.txt, collected in
  the same run, names where it takes ggml from; a 404 on the second file is replaced by that
  path, copied from the capture, in a conditional page (priority 6).

### Conditional pages and the 45-credit cap

Runs 1 and 2 plan about 35 credits. Every page that a trigger can add: the 8 pages of
`research/plan-conditional.json` (about 10 credits, its Mistral search counted at about 2
plus its one kept page) and up to 10 pages whose URLs exist only once a capture is made. If
every trigger fired, the project would need about 55 credits. The cap is 45, so after the
two runs (counted at what they actually spent: a cache hit costs nothing) the fired pages are
collected in this order while they fit under 45; a page that does not fit gives way, to the
fallback named:

| Priority | Unknown | Page(s) | Credits at most | Running total at worst | If it gives way |
|---|---|---|---|---|---|
| 1 | U-02 | the OpenAI model catalog, then the model page it links for each 404'd model (copied) | 3 | 38 | the model without a page is not offered |
| 2 | U-14 | the Gemma Terms of Use (URL replaced by the link the model card gives) | 1 | 39 | Gemma 4's licence row is KNOWN-UNKNOWN and Gemma 4 stays out of the catalogue |
| 3 | U-14 | the repository link a run-2 capture gives for each licence URL that 404'd (copied) | 6 | 45 | that model's licence row is KNOWN-UNKNOWN and the model stays out of the catalogue |
| 4 | U-09 | the privacy-centre, privacy-policy or DPA page the commercial-terms capture links (copied) | 1 | 46 | U-09's retention half is KNOWN-UNKNOWN; Moonzila states no retention period for Anthropic |
| 5 | U-11 | one search toward Mistral's own hosts, keeping 1 page | 3 | 49 | U-11 is KNOWN-UNKNOWN; Mistral is not offered for private code in a cloud-allowed project until it closes |
| 6 | U-15 | the ggml CMakeLists.txt at the path the root file names (copied) | 1 | 50 | U-15 falls to the day-one log reading in its row |
| 7 | U-05 | the score file the BFCL capture links (copied) | 1 | 51 | U-05 is KNOWN-UNKNOWN as written above |
| 8 | U-14 | the granite-4.0-350m and granite-4.0-micro cards | 2 | 53 | granite4:350m and granite4:3b leave the shortlist; granite4:1b stays |
| 9 | U-15 | the release workflow at v0.34.4 | 1 | 54 | U-15 falls to the day-one log reading in its row |
| 10 | U-07 | the abuse-monitoring or usage-policies page the terms capture links (copied) | 1 | 55 | U-07 claims no logging period in days |

So in the worst case, every trigger at once, priorities 4 to 10 give way. The order puts
first what decides whether a model is offered at all (an id, a licence) and last what a
day-one step or a stated "none" already covers. The triggers are independent, and the order
matters only when the pages that fired cost more than the credits left.
