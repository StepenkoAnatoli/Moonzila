# Brief - Which cloud and local coding models are worth offering in Moonzila as of 2026-10-05: current API model ids with context and output limits, tool-calling reliability, how vendors use and retain API inputs, and for small local models their licences, Ollama availability and sizes, runtime version and CPU requirements

Reviewed by: agent

_Auto-drafted 2026-10-05 by `bin/brief.mjs` from the corpus, then authored by the reviewing
agent: both judged sections are answered._ Sources: `research/` (37 captures, E-01..E-37, all
retrieved 2026-10-05, collected in three runs: `research/plan.json`, `research/plan-2.json`,
`research/plan-3.json`). Every claim below names the E-row that carries it; the URL of each
E-row is in the source list at the end of "What we verified".

**This is the phase-1 to phase-2 handoff. Gate: PASS.** Every blocking unknown is CLOSED with
evidence (12 rows) or KNOWN-UNKNOWN with a day-one step (8 rows: U-04, U-06, U-09, U-10, U-15,
U-17, U-18, U-20). The gate's one warning, U-18's collection-attempts warning, is accepted in
DISCOVERY's U-18 row: a speed on this CPU is on no page, so none was reached for. A verification
review on 2026-10-05 narrowed every claim its capture could not carry and moved U-04, U-09 and
U-10 from CLOSED to KNOWN-UNKNOWN (DISCOVERY, "Verification review"); nothing was fetched for it.

Whoever you are - another agent, a different model, or a person - read this file first. You
should not need to re-research anything to start work. If something here is not enough to
build from, say which fact is missing rather than guessing it: that is a phase-1 gap to close,
not a phase-2 judgment call.

## Intent

A dated shortlist of coding models for Moonzila's "More models" task (contract:
`research/DISCOVERY.md`, "Build intent"): (1) small local models (about 4B parameters or
fewer) for the signed managed catalogue (src/models/catalogue.ts); (2) cloud models behind the
project's inference policy - how to call each vendor's native API is the sibling corpus
docs/research/2026-10-05-provider-wire-formats; (3) inputs to a selector that ranks cloud and
local models by cost and quality. Prices and coding ranks are the 2026-10-02 corpus's
(docs/research/2026-10-02-model-pricing-and-ranking) and were not re-collected. Done is a
table a builder can turn into catalogue entries and profile presets, with the facts no page
owns named as measurements.

## What we verified

### Cloud models: ids and limits (U-01..U-04)

Ids are copied from each vendor's own model page. "Tools" means what the vendor's page says
about its own API; whether a model accepts Moonzila's exact request is the U-06 probe.

| API id (vendor page) | Context | Max output | Tools, per the vendor | Source |
|---|---|---|---|---|
| claude-fable-5-1 (alias the same) | 1M tokens | 128K | tool use, all current models | E-01 |
| claude-opus-5-5 (alias the same) | 1M tokens | 128K | tool use | E-01 |
| claude-sonnet-5-5 (alias the same) | 1M tokens | 128K | tool use | E-01 |
| claude-haiku-4-5-20251001 (alias claude-haiku-4-5) | 200K | 64K | tool use; retirement not sooner than 2026-10-15 | E-01 |
| gpt-6.1-sol (only snapshot) | 1,050,000 | 128,000 | Responses API only: "Chat Completions is supported without tool calling" | E-02 |
| gpt-6-luna (only snapshot) | 1,050,000 | 128,000 | Responses API; Chat Completions "supports function calling only with reasoning_effort set to none" | E-03 |
| gemini-3.8-flash (Stable) | 1,048,576 | 65,536 | function calling Supported; thinking low, medium, high | E-04 |
| gemini-3.7-flash (Stable) | 1,048,576 | 65,536 | function calling Supported; thinking low, medium, high | E-05 |
| gemini-3.5-flash-lite (Stable) | 1,048,576 | 65,536 | function calling Supported; thinking Supported | E-06 |
| mistral-medium-3-5 (raw HTML also lists mistral-medium-3, mistral-medium-latest) | 256k | not stated by Mistral (U-04, known unknown) | Function Calling on /v1/chat/completions and /v1/conversations | E-07 |

Also verified: Anthropic's Models API returns max_input_tokens and max_tokens per model, so
limits can be read at runtime (E-01); OpenAI's gpt-6.1-sol and gpt-6-luna have no free tier
("Not supported") and price prompts over 272K input tokens at 2x input and cache rates and 1.5x
output for the full request (E-02 line 175, E-03 line 167); Google describes 3.8 Flash as engineered for long-horizon software engineering and
agents, and 3.5 Flash-Lite for low-cost sub-agent work (E-04, E-06); Mistral Medium 3.5 is GA,
version v26.04 (E-07). DeepSeek's ids (deepseek-flash, deepseek-v4-pro), 1M context and 384K
maximum output are reused from the 2026-10-02 corpus (its E-04), not re-collected; see
Contradictions for OpenRouter's figure.

### How vendors use and retain API inputs (U-07..U-11)

| Vendor, tier | Used for training or product improvement | Retention | Also | Source |
|---|---|---|---|---|
| Google Gemini, unpaid quota | yes: content and responses used to "provide, improve, and develop Google products and services and machine learning technologies"; human reviewers may read API input and output | abuse-monitoring logs of prompts, context and responses: 55 days (that page's scope is all Gemini API and AI Studio use); how long content is kept for product improvement is not stated; Search and Maps grounding store prompts, context and output 30 days | Google: "Do not submit sensitive, confidential, or personal information to the Unpaid Services." | E-09, E-37 |
| Google Gemini, paid (Cloud project with active billing) | no: prompts and responses not used to improve products; abuse-monitoring logs train only models used for policy enforcement | logged 55 days to detect and prevent Prohibited Use Policy violations, keep the Services safe and secure, and for legal or regulatory disclosures (the terms say "a limited period of time"; the abuse-monitoring page, which cites the terms and gives the same purpose in the same words, says 55 days); Search and Maps grounding store prompts, context and output 30 days | flagged prompts or outputs may be assessed by authorised Google employees; in the EEA, Switzerland and the UK the paid data terms apply to all Services, free quota included | E-09, E-37 |
| OpenAI API | no, unless the customer explicitly opts in | abuse-monitoring logs up to 30 days; /v1/chat/completions: no application state by default, except audio outputs (1 h), prompt-cache tensors (up to 24 h), the store parameter (no period given when true) and image or file inputs a CSAM classifier flags (kept for manual review, even under ZDR); /v1/responses: at least 30 days by default or with store true (background mode about 10 minutes) | ZDR and Modified Abuse Monitoring need OpenAI's prior approval; ZDR eligibility is "Yes, see below for limitations"; a free-token sharing program is not stated on the page | E-10 |
| Anthropic API | no: "Anthropic may not train models on Customer Content from Services." | standard (non-ZDR) API retention not established: E-17 defers it to a privacy.claude.com policy that was not collected (U-09, known unknown). Stated: Covered Models (Claude Fable 5.1, Mythos 5.1, Fable 5, Mythos 5) 30 days; Batch 29 days; flagged content up to 2 years, whatever the arrangement; under ZDR nothing stored at rest after the response | ZDR by request; Covered Models not available under ZDR unless authorised | E-11, E-17 |
| DeepSeek API | not established for API inputs (U-10, known unknown): the API terms do not say; the privacy policy lists User Input (prompts, files) for training its technology, but excludes data of end users of apps built on the open platform; DeepSeek's training-methods page was not collected | not stated for API inputs; within the privacy policy's scope, kept as long as the account exists for providing the Services, and longer, with no period stated, for legitimate business interests (including improving and developing the Services), legal obligations or after a violation | within the privacy policy's scope, data is stored in the People's Republic of China; PRC law governs the API terms | E-12, E-13 |
| Mistral API | treated as yes unless the account opted out: the commercial terms bar training except when the customer opted in on a product set to opt-out by default, has not opted out on a product set to opt-in by default, gives Feedback, agrees it in an Order Form, or uses Labs or Preview Models (prefix "labs"), where Mistral may train and the opt-out does not apply; the privacy policy lists "Your Input and Output, subject to your opt-out" among training data; neither says which default the API has | the privacy policy gives, "for illustrative purposes": as long as needed to generate the output, then 30 rolling days to monitor abuse unless zero data retention is activated; Agents API until the account ends; fine-tuning data until deleted. For processing in the context of an organisation's business the policy does not apply, and the DPA (not collected) governs and may differ | the opt-out is an account setting and never covers labs or preview models, where zero data retention does not apply either; no line is drawn by plan or by how API use is paid; individual consumers are sent to consumer terms that were not collected | E-32, E-33 |

### Small local candidates (U-12..U-14)

"Size / Usage" is Ollama's column, a range for some tags; the page does not say what the figure
or range measures (E-18). The download size is recorded from the day-one pull, peak memory from
U-17. No minimum Ollama version is stated on the qwen3.5, gemma4 or granite4 pages.

| Tag | Size / Usage | Context | Tools | Min Ollama | Licence, from the publisher's own text | Source |
|---|---|---|---|---|---|---|
| qwen3:0.6b (already pinned) | reused from docs/handoff/work/research (its own row E-17, 2026-09-26) | not re-collected | - | - | Apache 2.0, Copyright 2024 Alibaba Cloud | E-23 |
| qwen3.5:0.8b | 1.2GB - 1.3GB | 256K | yes | not stated | Apache 2.0, Copyright 2026 Alibaba Cloud | E-18, E-24 |
| qwen3.5:2b | 2.7GB - 3.1GB | 256K | yes | not stated | Apache 2.0 | E-18, E-25 |
| qwen3.5:4b | 3.3GB - 4.0GB | 256K | yes | not stated | Apache 2.0 | E-18, E-26 |
| gemma4:e2b (2.3B effective, 5.1B with embeddings) | 4.6GB - 7.5GB | 128K | yes | not stated | Apache 2.0 (Google's model card) | E-19, E-27 |
| gemma4:e4b (4.5B effective, 8B with embeddings) | 6.6GB - 9.5GB | 128K | yes | not stated | Apache 2.0 | E-19, E-27 |
| granite4:350m | 708MB | 32K | yes | not stated | Apache 2.0 (IBM's own 350M card) | E-20, E-35 |
| granite4:1b | 3.3GB | 128K | yes | not stated | Apache 2.0 (IBM's own 1B card) | E-20, E-28 |
| granite4:3b (also tagged granite4:micro) | 2.1GB | 128K | yes | not stated | Apache 2.0 (IBM's Granite 4.0 repository, which names granite-4.0-micro) | E-20, E-36 |
| phi4-mini:3.8b | 2.5GB | 128K | yes | 0.5.13 | MIT, Copyright (c) Microsoft Corporation | E-21, E-29 |

Among the 13 of 51 gemma4 tags its page shows, gemma4:cloud and gemma4:31b-cloud run off the
machine (E-19). Each library page shows only some of a model's tags (qwen3.5 a subset of 72,
granite4 4 of 17, phi4-mini 2 of 5; E-18, E-20, E-21), so no page gives a full list of cloud
tags. Gemma 4's parameter counts are Google's own (E-27); the gemma4 readme re-hosts them
(E-19).

What the licences ask of a catalogue that points to or re-hosts the weights: Apache 2.0 section 4 - give recipients a
copy of the licence, keep copyright and attribution notices and any NOTICE attributions, mark
modified files (E-23); MIT - keep the copyright and permission notice with the weights (E-29).
Neither attaches a use policy to pass on. IBM's Granite repository holds a LICENSE file whose
text was not captured (E-36), so the copyright line to carry for Granite comes from the
publisher's repository the weights are taken from, at build time.

### Runtime and CPU (U-13, U-15, U-16)

- Ollama's latest stable is v0.35.1 (29 Sep), then v0.35.0 (28 Sep); the pinned v0.34.4 (23 Sep)
  is two stable releases behind; v0.40.0-rc3 is a pre-release. The notes since the pin add
  decision models, Modelfile CAPABILITY declarations, a typical_p warning, updated llama.cpp and
  MLX, and MLX by default on Apple Silicon; none names support or a fix a candidate needs on an
  x64 CPU, and Gemma 4 support predates the pin (E-22).
- At v0.34.4 the root CMakeLists.txt sets no CPU variant option and vendors no ggml: the GGML
  backend is llama-server, built from llama/server/CMakeLists.txt by FetchContent from a pinned
  llama.cpp (E-30).
- That llama-server file sets no instruction-set option either. It reads the llama.cpp commit
  from a LLAMA_CPP_VERSION file it does not contain, and for the CPU build it installs every
  ggml-cpu*.dll module the build produced - "multiple variants from GGML_CPU_ALL_VARIANTS",
  named by llama.cpp from detected CPU features (E-34). Which variants ship for Windows x64,
  and whether one needs no more than SSE4.2, no captured page states: U-15 is a known unknown,
  settled by the day-one log reading below.
- The user's Intel Pentium 4405U lists Instruction Set Extensions "Intel SSE4.1, Intel SSE4.2"
  only; AVX and AVX2 are not listed (E-31).

### Benchmarks and machine-readable metadata (U-05, U-19, U-20)

- BFCL publishes V4, last updated 2026-04-12, commit f7cf735, 109 rows (E-08). Of the cloud
  table above it lists only claude-haiku-4-5-20251001: Claude-Haiku-4-5-20251001 (FC) at 68.7,
  rank 6, and (Prompt) at 25.26, rank 87 (E-08). It lists none of the Claude 5.x, GPT-6.x,
  Gemini 3.5/3.7/3.8 or Mistral Medium 3.5 models and no DeepSeek V4, so no first-build-step
  model has a BFCL row; and none of Qwen3.5, Gemma 4, Granite 4.0 1B or micro, or Phi-4-mini.
  Of the small candidates it lists Qwen3-0.6B (FC) at 23.93, rank 92, and Granite-4.0-350m (FC)
  at 18.98, rank 103; non-candidate siblings appear too, e.g. Qwen3-4B-Instruct-2507 (FC) at
  35.68, rank 54 (E-08). These are what BFCL reports in its own harness, not evidence that a
  model works in Moonzila.
- OpenRouter's public models endpoint returned, with no OpenRouter credential, 466 model
  objects with per-token price, context_length, top_provider.max_completion_tokens and
  supported_parameters (E-15) - usable to cross-check the dated table, never as the source of an
  id, a limit or tool support (see Contradictions).
- Neither LiveBench's dataset card (E-16) nor the BFCL page (E-08) states terms for its scores;
  the two BFCL data pages the leaderboard links were not collected (U-20, known unknown).

### Source list

| Row | URL |
|---|---|
| E-01 | https://platform.claude.com/docs/en/models/overview |
| E-02 | https://developers.openai.com/api/docs/models/gpt-6.1-sol |
| E-03 | https://developers.openai.com/api/docs/models/gpt-6-luna |
| E-04 | https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash |
| E-05 | https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash |
| E-06 | https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite |
| E-07 | https://docs.mistral.ai/models/model-cards/mistral-medium-3-5-26-04 |
| E-08 | https://gorilla.cs.berkeley.edu/leaderboard.html |
| E-09 | https://ai.google.dev/gemini-api/terms |
| E-10 | https://developers.openai.com/api/docs/guides/your-data |
| E-11 | https://www.anthropic.com/legal/commercial-terms |
| E-12 | https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html |
| E-13 | https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html |
| E-14 | https://legal.mistral.ai/terms/terms-of-service |
| E-15 | https://openrouter.ai/api/v1/models |
| E-16 | https://huggingface.co/datasets/livebench/model_judgment |
| E-17 | https://platform.claude.com/docs/en/manage-claude/api-and-data-retention |
| E-18 | https://ollama.com/library/qwen3.5 |
| E-19 | https://ollama.com/library/gemma4 |
| E-20 | https://ollama.com/library/granite4 |
| E-21 | https://ollama.com/library/phi4-mini |
| E-22 | https://github.com/ollama/ollama/releases |
| E-23 | https://huggingface.co/Qwen/Qwen3-0.6B/blob/main/LICENSE |
| E-24 | https://huggingface.co/Qwen/Qwen3.5-0.8B/blob/main/LICENSE |
| E-25 | https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/LICENSE |
| E-26 | https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/LICENSE |
| E-27 | https://ai.google.dev/gemma/docs/core/model_card_4 |
| E-28 | https://huggingface.co/ibm-granite/granite-4.0-1b |
| E-29 | https://huggingface.co/microsoft/Phi-4-mini-instruct/blob/main/LICENSE |
| E-30 | https://raw.githubusercontent.com/ollama/ollama/v0.34.4/CMakeLists.txt |
| E-31 | https://www.intel.com/content/www/us/en/products/sku/89611/intel-pentium-processor-4405u-2m-cache-2-10-ghz/specifications.html |
| E-32 | https://legal.mistral.ai/terms/commercial-terms-of-service |
| E-33 | https://legal.mistral.ai/terms/privacy-policy |
| E-34 | https://raw.githubusercontent.com/ollama/ollama/v0.34.4/llama/server/CMakeLists.txt |
| E-35 | https://huggingface.co/ibm-granite/granite-4.0-350m |
| E-36 | https://github.com/ibm-granite/granite-4.0-language-models |
| E-37 | https://ai.google.dev/gemini-api/docs/usage-policies |

## Contradictions and how they were resolved

1. **Qwen3-0.6B's licence.** A secondary source in the 2026-10-02 corpus (bestllmfor capture,
   line 103) says most Qwen3 sizes are under a "Qwen License" with a 100-million-MAU threshold.
   Qwen's own LICENSE file for Qwen3-0.6B is plain Apache 2.0 with no added clause (E-23), and
   BFCL's licence column agrees (apache-2.0, E-08). Trusted: E-23, the owner's file. It settles
   Qwen3-0.6B only; the other Qwen3 sizes are not shortlisted and were not checked.
2. **gpt-6.1-sol and tools.** OpenRouter lists "tools" in supported_parameters for
   openai/gpt-6.1-sol (E-15); OpenAI says Chat Completions serves it without tool calling (E-02).
   They describe different APIs. Trusted for OpenAI's own endpoint: E-02. OpenRouter's flags are
   never used to decide tool support.
3. **DeepSeek maximum output.** DeepSeek's own pricing page, reused from the 2026-10-02 corpus
   (its capture 2026-10-02-models-pricing-deepseek-api-docs-deepseek-8eb12065.md, lines 27 and
   30), names the model versions DeepSeek-V4.1-Flash (deepseek-flash) and DeepSeek-V4-Pro-0813
   (deepseek-v4-pro) and gives one "MAXIMUM: 384K" output for both. OpenRouter's entries disagree
   with it and with each other (E-15). Flash: ~deepseek/deepseek-flash-latest,
   deepseek/deepseek-v4.1-flash and deepseek/deepseek-v4-flash, each 943718. Pro:
   deepseek/deepseek-v4-pro (canonical slug deepseek/deepseek-v4-pro-20260423) 384000,
   ~deepseek/deepseek-pro-latest 393216, and deepseek/deepseek-v4-pro-0813 (canonical slug
   deepseek/deepseek-v4-pro-20260813), the entry matching DeepSeek's own model version,
   943718. Trusted: the owner's page. OpenRouter's top provider need not be DeepSeek, and it
   still lists deepseek-v4-flash, a name the reused capture calls retired.
4. **Mistral Medium 3.5 maximum output.** Mistral's card states none (E-07); OpenRouter gives
   209715 (E-15). Not adopted as Mistral's limit; a day-one probe sets the preset.
5. **Granite tool-calling scores.** IBM's cards self-report BFCL v3 39.32 for 350M Dense (E-28,
   E-35) and 54.82 for 1B Dense (E-28); the BFCL V4 leaderboard reports Granite-4.0-350m (FC) at
   18.98 overall (E-08). Different benchmark versions and aggregates: not comparable, not
   averaged. Only E-08 is "what BFCL reports". Likewise Qwen's BFCL-V4 72.9 on the qwen3.5 Ollama
   page is Qwen's self-report for its 397B model (E-18), not a leaderboard row and not the small
   sizes.
6. **Anthropic standard retention.** E-17 says conversation content "is not retained by
   default" (Covered Models excepted), but as one of its commitments for features that
   "necessarily require storage" (E-17 capture lines 20-23), and it sends "standard retention
   policies outside these arrangements" (ZDR and HIPAA readiness) to a privacy.claude.com
   article that was not collected (line 16); its ZDR section - nothing stored at rest after the
   response (line 30) - would add nothing if ordinary API use stored nothing. Resolved by not
   reading that sentence as Anthropic's standard retention: U-09 is a known unknown, and Moonzila
   states no standard retention period for Anthropic until that article is read (day one, on the
   collector machine).
7. **DeepSeek policy scope.** The privacy policy names DeepSeek's apps, websites, software and
   related services as its scope and excludes personal data of end users of applications
   developers build on the open platform (E-13, capture lines 33-36); the API terms send the
   developer's own personal information to it and repeat that exclusion for the developer's end
   users (E-12, section 5.5). No captured DeepSeek page says whether API inputs are used for
   training, where they are stored or for how long, and DeepSeek's training-methods page, linked
   from both, was not collected. Not resolved as a finding: U-10 is a known unknown. As a
   conservative choice, DeepSeek is not offered for private code: no DeepSeek page in this
   corpus commits to not training on API inputs, and PRC law governs the API terms (E-12).
8. **Granite4 sizes on Ollama.** granite4:1b is listed at 3.3GB and granite4:3b at 2.1GB (E-20).
   The page does not explain it (a different quantisation is likely but not stated). Not
   resolved; the catalogue records each tag's digest and size from the day-one pull.
9. **Mistral's training default.** The commercial terms say Mistral will not train on Customer
   Data or Outputs except, among other cases, on a product set to opt-in by default that the
   customer has not opted out of (E-32, section 4.2); the privacy policy lists "Your Input and
   Output, subject to your opt-out" among the data it trains on (E-33). Neither names the
   API's default. Not averaged: Moonzila takes the reading under which more data is used -
   training unless the account has opted out - because the opposite guess, if wrong, would send
   private code to training. The privacy policy also excludes personal data processed in the
   context of the customer's business activities from its scope (E-33); for training that
   changes nothing, since the rule already assumes the worse case. For retention there is no
   worse case to assume: the 30 days are the privacy policy's, given "for illustrative purposes"
   (E-33, line 90), and for an organisation's business use the Data Processing Agreement the
   commercial terms name governs (E-32, section 12.3), not collected. So the disclosure reads
   "Mistral's privacy policy states 30 days (illustrative; an organisation's DPA may differ)",
   and the DPA's retention clause is a day-one read on the collector machine.
10. **Gemini's paid-tier logging period.** The terms say "a limited period of time" with no
   number (E-09). Their text does not link the abuse-monitoring page - the terms page lists it
   only in its docs navigation (E-09, raw HTML line 999) - but that page cites the Additional
   Terms itself (E-37, lines 74-76) and gives, in the same words, the purpose of the terms'
   paid-tier logging, with 55 days (E-37). Not a conflict: E-37 gives the number E-09 leaves out,
   and Moonzila states 55 days.

## Known unknowns

Every one has a day-one step. Some steps name a page for the collector machine, each URL copied
from a capture: U-09, U-10 and U-20 here, and U-11's DPA below. A builder machine never fetches
them; a builder who needs one says so, and it is collected on the collector machine.

- **U-04** - Mistral Medium 3.5's maximum output. Its id, 256k context and function calling are
  established (E-07); its card states no output limit, and OpenRouter's 209715 (E-15) is not
  Mistral's statement. Day one: one Mistral request at the preset's intended outputTokens, to
  confirm it is accepted; until then mistral-medium-3-5 has no outputTokens and is not offered.
- **U-06** - tool calls through Moonzila's own request shape. A measurement, not a page; BFCL
  (E-08) reports its own harness only. Day one: per shortlisted model, a fixed set of at least
  20 tool-call prompts (one tool; two tools in one turn; nested JSON arguments; a turn that must
  not call a tool) through complete() in src/main/inference.ts with the model's profile, or the
  managed Ollama path at num_gpu 0 and the catalogue's context; record the share of turns ending
  in a terminal tool-call finish whose arguments parse against the schema. For gpt-6-luna run it
  with reasoning_effort none on the openai-compatible kind (E-03). For local models this is the
  moonaliza-coding-v1 lab receipt, whose runner (src/models/qualify.ts) does not exist yet.
- **U-09** - Anthropic's standard (non-ZDR) API retention. Training is settled: none on Customer
  Content (E-11, E-17). Retention is not: E-17 sends standard retention to
  https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
  (E-17 capture line 16), not collected. Day one, on the collector machine: collect that article
  and read the period it gives for API inputs and outputs; until then the UI says Anthropic's
  standard retention is not stated, beside the facts E-17 does state (Covered Models 30 days,
  Batch 29 days, flagged content up to 2 years).
- **U-10** - how DeepSeek uses, stores and keeps API inputs. Neither captured DeepSeek page says;
  the privacy policy excludes data from apps built on the open platform (E-13). Day one, on the
  collector machine: collect https://cdn.deepseek.com/policies/en-US/model-algorithm-disclosure.html
  (E-13 capture line 41, E-12 line 437) and read whether API inputs are used for training, where
  they are stored and for how long. Until a DeepSeek page commits to not training on API inputs,
  DeepSeek is not offered for private code.
- **U-15** - which CPU builds the pinned Ollama v0.34.4 ships for Windows x64, and whether one
  runs without AVX. Reached for on Ollama's own build files at the tag (E-30, E-34); neither
  states the variant set, which lives in build settings and llama.cpp source no capture holds -
  candidates not collected: cmake/local.cmake at v0.34.4 (E-30 line 78), the LLAMA_CPP_VERSION
  file (E-34 line 123) and the release workflow. Even read, they would state what the build
  requests, not what the shipped payload holds, so the log reading below decides it.
  Day one, on the Pentium 4405U (no AVX, E-31): install the pinned v0.34.4, list the
  ggml-cpu*.dll files in its lib/ollama directory (the install layout E-34 describes), start
  the server, load any small candidate tag with num_gpu 0, and read from the server log which
  CPU backend library it loaded and its system-info line (AVX = 0 expected), or whether it fails
  for lack of AVX. If no variant loads, no local model is offered on this PC until a runtime
  that ships one is pinned and re-qualified.
- **U-17** - peak memory. Day one, on the target machine once its free memory clears the
  reserve (on the user's current PC, only after memory is freed; design point 1): pinned Ollama
  v0.34.4, num_gpu 0, each tag at the catalogue's num_ctx, one prompt, then GET /api/ps (size,
  size_vram 0, context_length) and the process's peak working set, recorded with the tag's
  digest.
- **U-18** - speed on the Pentium 4405U. Day one, same run: a fixed prompt of about 1,000 tokens
  and a 200-token reply per tag; record load_duration, prompt_eval_duration, eval_count and
  eval_duration from the final /api/chat chunk (defined in the Ollama API reference captured at
  docs/research/2026-09-28-open-gaps/research/raw/2026-09-28-generate-a-chat-message-ollama-ollama-03d080ba.md
  lines 245-299) plus client-side time to first chunk; tokens per second is eval_count divided
  by eval_duration in seconds.
- **U-20** - terms for leaderboard scores. Day one: on the collector machine, collect the two
  BFCL data pages the leaderboard links, https://github.com/HuanzhiMao/BFCL-Result (E-08 capture
  line 168) and https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard
  (lines 22-23), and read any data licence. Ask BFCL in writing through the contact its page
  names (https://discord.gg/grXXvj9Whz, E-08), and LiveBench through a contact found from the
  two links its card gives, https://livebench.ai/ and https://arxiv.org/abs/2406.19314 (E-16
  capture lines 140 and 142; the card names a GitHub readme but gives no URL for it), whether
  the scores may ship in an app and with what attribution. Until each answers, the app ships
  only a dated link.

Day-one checks on closed rows (documentation is not proof of acceptance):

- U-12: on v0.34.4, `ollama pull` every candidate tag and record any refusal as needing a newer
  Ollama - gemma4 first (page updated after v0.35.0, E-19, E-22), then qwen3.5 (E-18) - and
  record each tag's digest and download size from the pull.
- U-16: in the U-15 run, the runner's system-info line on the Pentium 4405U (AVX expected 0,
  E-31).
- U-11: before Mistral's disclosure ships for organisation accounts, on the collector machine,
  collect https://legal.mistral.ai/terms/data-processing-addendum (E-32 capture line 150) and
  read its retention clause.

## What this means for Moonzila's design

1. **No local model on the user's current PC yet.** The CPU lists SSE4.1 and SSE4.2 only, no
   AVX (E-31); free RAM (1,235,644,416 B) is already below the 2 GiB reserve (DISCOVERY
   "Already decided"); and whether the pinned runtime ships a CPU variant that runs without AVX
   is U-15's day-one reading (E-34). Two conditions, both required, before a local model is
   offered on this PC: the U-15 reading finds a CPU variant that loads without AVX, and
   available RAM minus max(2 GiB, 15% of RAM) can hold that model's measured peak memory (U-17,
   src/models/select.ts:15, :41) - whatever U-15, U-17 and U-18 show, no model is offered while
   memory fails that test. Until both hold, the local shortlist serves other machines.
2. **The openai-compatible kind cannot carry gpt-6.1-sol with tools.** It posts to
   /chat/completions, where OpenAI serves gpt-6.1-sol without tool calling (E-02); the selector
   requires tools, so gpt-6.1-sol is not offered on that kind. gpt-6-luna is offered there only
   with reasoning_effort none in its profile (E-03), and only if U-06 passes. A Responses-API
   path is the sibling wire-format corpus's question.
3. **Data-use classes decide what a cloud-allowed project may send private code to.**
   - Offerable for private code: Anthropic API, on its training terms (no training on Customer
     Content, E-11, E-17); its standard retention is not established (U-09), so its disclosure
     says so beside the stated facts - Covered Models 30 days, Batch 29 days, flagged content up
     to 2 years (E-17) - and never says "not retained". OpenAI API (no training unless opt-in;
     abuse logs up to 30 days; on /v1/chat/completions no application state by default, with the
     exceptions in the table, E-10). Gemini on a billing-enabled Cloud project (no product
     improvement; prompts and responses logged 55 days for abuse monitoring, and flagged content
     may be reviewed by authorised Google employees, E-09, E-37).
   - Conditional: Mistral, only after the user confirms that the training opt-out is set on
     their Mistral account, never on a labs or preview model, and with retention disclosed as
     "Mistral's privacy policy states 30 days (illustrative; an organisation's DPA may differ)"
     (E-32, E-33).
   - Not offered for private code: the Gemini unpaid quota (training and human review; Google
     itself says not to send confidential information, E-09) and DeepSeek - a conservative
     choice, not a finding: no DeepSeek page in this corpus commits to not training on API
     inputs, its privacy policy excludes data from apps built on its API, and PRC law governs its
     API terms (E-12, E-13; U-10).
   - In the EEA, Switzerland and the UK, Google's paid data terms apply even to the free quota
     (E-09) - the UI text must not assume one rule worldwide.
4. **Disclose Covered Models.** claude-fable-5-1 requires 30-day retention and is not available
   under ZDR unless Anthropic authorises it (E-17); the same page shows the 400
   invalid_request_error a Claude Fable 5 request gets from an organisation whose retention
   does not meet the requirement (E-17 capture, line 140), so expect the same for Fable 5.1. Its
   preset carries that note; Opus 5.5 and Sonnet 5.5 do not.
5. **Profile limits come from the table above** (contextTokens, outputTokens): Claude 5.x
   1M/128K, OpenAI 1,050,000/128,000, Gemini 1,048,576/65,536; Mistral's outputTokens waits for
   the day-one probe. For OpenAI, the selector's cost model must know that prompts above 272K
   input tokens are priced at 2x input and cache rates and 1.5x output for the full request
   (E-02, E-03); Anthropic's limits can be re-read at runtime from its Models API (E-01).
6. **Catalogue licence handling.** Every candidate is Apache 2.0 or MIT on its publisher's own
   text (E-23..E-29, E-35, E-36), so pointing to or re-hosting the weights is allowed if each
   catalogue entry ships the licence text and the copyright and NOTICE attributions from the
   repository the weights come from. No cloud tag enters it: the library pages show only some
   tags (E-18..E-21), so the rule is a name test plus a check - no tag named cloud or ending in
   -cloud (gemma4:cloud and gemma4:31b-cloud are the two shown, E-19), and each model's full tag
   list is checked at pull time. The "about 4B" bound needs one measure for both Gemma sizes:
   with embeddings, gemma4:e2b is 5.1B and gemma4:e4b 8B, both past it; by effective parameters
   they are 2.3B and 4.5B (E-27). gemma4:e2b's Size / Usage, 4.6GB - 7.5GB (E-19), also exceeds
   qwen3.5:4b's 3.3GB - 4.0GB (E-18). A builder's call, flagged here for both, not decided.
7. **Ranking inputs.** BFCL has no row for any first-build-step cloud model (of the cloud table
   it lists only claude-haiku-4-5-20251001, (FC) 68.7, rank 6) and for only two small
   candidates (E-08), so BFCL cannot rank this shortlist; U-06 is the tool-calling signal. No
   third-party scores ship in the app until U-20 closes - a dated link only.
8. **Refreshing the dated table.** OpenRouter's endpoint can flag drift (E-15), but ids, limits
   and tool support are re-read from the vendors' pages; OpenRouter disagrees with vendors on
   tools and output caps (Contradictions 2-4).
9. **Runtime bump not indicated by the notes.** Nothing since v0.34.4 is named as needed by a
   candidate on x64 (E-22); the U-12 pulls and the U-15 reading decide it.

## Decision

Phase 1 is finished: the gate passes, and the first build step below needs no further page.
Pages named for the collector machine, none needed to start: the privacy.claude.com retention
article (U-09), DeepSeek's training-methods page (U-10), Mistral's Data Processing Agreement
(U-11, organisation accounts), two BFCL data pages (U-20) and cmake/local.cmake at v0.34.4
(U-15). The three runs spent about 42 of the 45-credit cap, so whether and which to collect is
the operator's call; if collected, the first three come first, because they change what the UI
discloses, and the U-20 and U-15 pages otherwise fall to the day-one steps in their rows.

**First build step.** Add the cloud presets whose facts are closed - claude-fable-5-1,
claude-opus-5-5, claude-sonnet-5-5, gemini-3.8-flash, gemini-3.7-flash, gemini-3.5-flash-lite
and gpt-6-luna (reasoning_effort none on the openai-compatible kind) - as one dated table (id,
contextTokens, outputTokens, data-use class from design point 3, retrieval date 2026-10-05,
E-row), each marked not offered until its U-06 tool-call run passes. Run U-06 against them
before anything else is offered.

**Then, in order.** mistral-medium-3-5 joins the table once the U-04 output probe sets its
outputTokens, with the conditional data-use class of design point 3 (E-32, E-33). On the target
machine, the U-15/U-16 log reading comes first, because if no CPU variant loads without AVX,
the U-12 pulls and the U-17 and U-18 measurements cannot run there. On the user's current PC,
U-17 and U-18 also need memory freed first: free RAM (1,235,644,416 B) is below the 2 GiB
reserve, while gemma4:e2b's Size / Usage alone is 4.6GB - 7.5GB (E-19), so a peak-memory or
speed reading taken there now would measure a starved machine. Free memory first, or measure on
a machine that clears the reserve; either way design point 1 decides whether this PC is
offered a local model. The local catalogue entries (qwen3.5 0.8b, 2b, 4b; granite4 350m, 1b,
3b; phi4-mini:3.8b; the pinned qwen3:0.6b; and gemma4:e2b, and gemma4:e4b, only if the size
measure chosen under design point 6 admits them) are written with their licence files and stay
unqualified until their lab receipt passes.

**Out of scope until stated conditions change:** gpt-6.1-sol on the openai-compatible kind
(needs a Responses path); Mistral for private code without the user's confirmed opt-out, and
any Mistral labs or preview model; DeepSeek (U-10) and the Gemini unpaid quota for private code;
any local model on the current PC (E-31, memory, U-15; design point 1); shipping BFCL or
LiveBench scores (U-20); stating a standard retention period for Anthropic (U-09).

## Next steps

1. Builder, first command: `node "$HOME/.agents/research-kit/bin/handoff.mjs"` (exit 0 means
   the corpus and its ledger travelled whole).
2. The first build step under "Decision", then U-06 against those presets.
3. On the target machine: the U-15/U-16 log reading, then the U-12 pulls, then U-17 and U-18
   once memory clears the reserve (or on a machine that does); the Mistral output probe (U-04);
   the U-20 letters.
4. On the collector machine, if the operator chooses: the pages named under "Decision" (U-09,
   U-10, U-11's DPA first), each URL copied from the capture its row cites.

<!-- research-kit:brief-draft body=688bb8eb3415611d inputs=a8ee5db1c4eb5203 gate=pass -->
