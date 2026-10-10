# MAP - topic decomposition

## Topic

How the Anthropic Messages API, the OpenAI Responses API and the Google Gemini native API authenticate, stream text and tool calls, report usage and refuse over-window requests, and which vendors' OpenAI-compatible Chat Completions endpoints accept Moonzila's current request shape

## Subtopics

Drafted by `node "$HOME/.agents/research-kit/bin/decompose.mjs" --dry-run --recipe api-integration`
on 2026-10-05: 9 universal rows plus 4 from the api-integration recipe, statuses blank. The
dry run gathered no material (no credits spent). Classified below by the planning agent; T-1..T-8
are topic-specific rows added because the checklist does not name the seams a provider adapter
in `src/main/inference.ts` and `src/main/provider-stream.ts` actually has.

| ID | Subtopic | Why it matters | Status | Covered by |
|---|---|---|---|---|
| D-1 | Access model | Public pages, an official API, an auth-walled app, or a paywall - each is a different collection design | COVERED | U-01, U-06, U-07, U-10, U-11, U-13, U-14, U-15: every target is an official HTTPS API reached with the user's own key, and its documentation is public; the unknowns pin each route and base URL |
| D-2 | Auth and credentials | What accounts, keys, or logins the collection and the product need, and who holds them | COVERED | U-01 (Gemini key header or query key), U-06, U-07 (x-api-key and anthropic-version), U-10, U-11, U-13, U-14, U-15 (Bearer on the compatible endpoints) |
| D-3 | Rate limits and quotas | Caps every cadence in the design, and caps the research collection itself | COVERED | U-16 (how throttling is signalled and how long to wait); the tier numbers themselves are on record in docs/research/2026-10-02-model-pricing-and-ranking (Gemini tiers) and are not a wire fact |
| D-4 | ToS, licensing, legality of the intended use | A prohibition on automated collection, storage, or display ends the design for that source - and sometimes the project | DISMISSED | A request format carries no licence condition, and the user brings their own key. What each vendor does with prompts (training use, retention) decides the cloud-privacy disclosure (src/renderer/App.tsx:243,247) and is collected by the sibling corpus docs/research/2026-10-05-coding-model-shortlist, its unknowns U-07 (Gemini, free versus paid tier), U-08 (OpenAI), U-09 (Anthropic), U-10 (DeepSeek) and U-11 (Mistral); it is not collected twice. Covered by neither corpus, and named to the lead: OpenRouter's own data-use and logging terms. The two compatibility layers' own caveats (Anthropic's "not for production" wording, Gemini's beta label) are wire facts and stay here, inside U-06 and U-10 |
| D-5 | Data schema and its stability | How the data is shaped, and how often the source changes the shape without asking | COVERED | U-02, U-04, U-07, U-08, U-11, U-12 (event and part schemas); stability through D-6 |
| D-6 | Freshness and staleness | How fast the data goes stale, and what staleness costs the product that depends on it | COVERED | U-01 (Gemini API version, v1 or v1beta), U-07 (the anthropic-version pin): each wire contract is versioned per request, and the corpus is refreshed at 30 days |
| D-7 | Cost at expected volume | The economics at real usage, not the pricing page's first row - this decides viability | COVERED | U-04, U-07, U-11, U-13 (which usage fields a cost meter must read: cached input, thought or reasoning tokens); per-token prices are reused from docs/research/2026-10-02-model-pricing-and-ranking and not re-collected |
| D-8 | Runtime and platform limits | Where this actually executes - OS, runtime version, desktop app, cloud - and what those limits forbid | COVERED | U-07 (ping events), U-15 (SSE comment lines), U-18 (framing measured on the wire, including how Gemini's native stream ends): Moonzila parses SSE in Electron main with a bounded line reader (src/main/provider-stream.ts:12-60), a 4 MiB stream cap and a 120 s request timeout (src/main/inference.ts:146) |
| D-9 | Output obtainability | Does the data your stated "done" depends on exist, and can you actually get it? Load-bearing: a project whose output cannot be produced should die in phase 1, not phase 2 | COVERED | U-18, U-05 and U-20 (U-18's facts no page owns are measured on day one; U-05's owner page, collected as E-36, names an over-long input only as an example cause of 500 INTERNAL and states no message that tells it apart, so the body is measured by U-18 (2) and the row stays KNOWN-UNKNOWN; U-20 is closed from its owner page, E-37, and only its streamed carriage is measured, by U-18 (8)); no unknown is OPEN, and every closed one names the vendor page that owns it |
| S-1 | Endpoint surface and versioning | Which endpoints carry the facts, and what a version bump does to them | COVERED | U-01, U-06, U-07, U-10, U-11 |
| S-2 | Pagination and result caps | What the API refuses to return in one call, and what that costs at volume | COVERED | U-09 (request_too_large), U-12 (reasoning against max_output_tokens), U-13 (reasoning against max_tokens): a chat call does not paginate, so the caps that bind are request size and output tokens |
| S-3 | Error and retry semantics | Which failures are retryable, and what backoff the provider actually requires | COVERED | U-05, U-09, U-11, U-15, U-16 |
| S-4 | SDK vs raw HTTP | Whether an official client exists, what it hides, and whether it is maintained | DISMISSED | Moonzila calls every provider with raw fetch in Electron main so the key is used only inside vault.withSecret (src/main/index.ts:95-100) and redirects are refused (src/main/inference.ts:158); an SDK would bring its own network stack and retry policy into that boundary. No fact about an SDK changes that choice; the raw HTTP contracts the unknowns pin are what the adapters need |
| T-1 | Tool-call representation and round trip | ids, argument encoding, parallel calls and where results go back: parseCalls (src/main/inference.ts:75-85) requires unique ids and JSON-object arguments | COVERED | U-02, U-08, U-11, U-13, U-14, U-19; U-18 measures what no page states (whether a Gemini call arrives whole or fragmented, whether Mistral accepts a minted id) |
| T-2 | Opaque continuation state across tool turns | thought signatures, thinking signatures, reasoning items, reasoning_content: InferenceMessage (src/main/inference.ts:10) carries none, and the wire-state plumbing (src/shared/contracts.ts:38-44) is unused | COVERED | U-03, U-08, U-12, U-13, U-19, U-20 (the compatible endpoint's signature carriage: extra_content.google.thought_signature on the first tool call of each step - of parallel calls only the first carries one - sent back on that call exactly as it arrived, E-37; which streamed chunk carries it is U-18 (8)) |
| T-3 | Terminal states and safety blocks | the outcome mapping complete, incomplete, blocked, tool_calls (src/main/inference.ts:167-181) | COVERED | U-04, U-08, U-11 |
| T-4 | Over-window refusal classification | CONTEXT_LIMIT is recognised from 400/413/422 bodies only (src/main/inference.ts:99-122) | COVERED | U-05, U-09, U-11, U-18 |
| T-5 | Usage reported in a stream | usage mapping (src/main/inference.ts:163-165); a missing count must not be reported as 0 | COVERED | U-04, U-07, U-11, U-13, U-15; U-18 measures which Gemini chunk carries usageMetadata and whether its counts are cumulative |
| T-6 | OpenAI-compatible endpoints against Moonzila's current body | which vendors work through the existing 'openai-compatible' kind unchanged, and which need a field mapped | COVERED | U-06, U-10, U-13, U-14, U-15, U-19, U-20, U-18 |
| T-7 | Locality of a loopback endpoint | loopback is classed 'local' (src/main/inference.ts:18-20), and a local-only project must never send prompts off the machine | COVERED | U-17; U-18 (10) measures how a loopback Ollama classes a reference as cloud-sourced, which no capture states |
| T-8 | Per-model context windows and output caps | presets for contextTokens and outputTokens, which today the user types in | DISMISSED | Per-model numbers are a model-catalogue question, not a wire-format one, and the sibling corpus docs/research/2026-10-05-coding-model-shortlist collects them: its U-01 (Claude ids, windows, output caps), U-02 (OpenAI), U-03 (Gemini) and U-04 (Mistral), and its U-19 (OpenRouter's models API with per-model context length and maximum completion tokens); DeepSeek's 1M window and 384K output are on record in docs/research/2026-10-02-model-pricing-and-ranking. Only the wire behaviour at the limit (over-window refusal, output cap) is in scope here, under T-4 and S-2 |

## Coverage notes (per dimension)

- **D-1, D-2, S-1.** Four wire formats are in play: Gemini native (`generateContent`), Anthropic
  Messages, OpenAI Responses, and OpenAI Chat Completions as offered by Gemini, Anthropic,
  DeepSeek, Mistral and OpenRouter. Today `complete()` sends `Authorization: Bearer` to
  `<endpoint>/chat/completions` and refuses endpoint query strings (src/main/inference.ts:17,145,157),
  so each unknown asks for the auth header and the route the vendor owns.
- **D-1, S-1, after collection (2026-10-05).** Google's docs now default to a fifth wire format,
  the Interactions API (`POST v1beta/interactions`, labelled "Recommended"; EVIDENCE E-01, E-03,
  E-04), and four planned Gemini URLs served its variant instead of the generateContent one (E-01,
  E-03, E-04, E-35). Runs 3 and 4 collected the generateContent variants those captures link
  (function calling E-34, API errors E-36, thought signatures E-37). The unknowns still ask about
  generateContent, as the build intent does; choosing between the two is a Mandate question recorded
  in `research/BRIEF.md`, not a new subtopic.
- **D-3, S-3.** Retry signals are asked for Anthropic and Gemini only. OpenAI's are on record:
  docs/research/2026-09-29-context-overflow, capture of the error-codes guide (429 with
  `Retry-After`, lines 128-133). Gemini's spend-limit 429 `RESOURCE_EXHAUSTED` is on record in
  the pricing corpus's rate-limits capture (line 128).
- **D-4.** Dismissed with the reason in the row: vendor data-use and retention terms are the
  sibling docs/research/2026-10-05-coding-model-shortlist's U-07..U-11 (Gemini, OpenAI,
  Anthropic, DeepSeek, Mistral). OpenRouter's own terms are in neither corpus; the lead should
  route them before OpenRouter is offered under 'cloud-allowed'.
- **D-5, D-6, T-1..T-5.** These are the adapter's seams. Each unknown is phrased so that its
  answer fills one seam in `inference.ts` or `provider-stream.ts`.
- **D-7.** Prices are reused; only the usage fields a meter must read are collected.
- **D-8, D-9, U-18.** Behaviour no page fully owns (does a vendor accept Moonzila's exact body,
  what bytes an over-window refusal carries, CRLF or comment lines in SSE, how Gemini's native
  stream ends, whether its calls arrive whole, which chunk carries its usage, whether Mistral
  accepts a minted tool-call id) is a measurement and is KNOWN-UNKNOWN from the start, with the
  day-one request written out. Each probe needs that vendor's own key; a vendor without one stays
  KNOWN-UNKNOWN and is marked untested in the design.
- **T-6.** The current body is `model, messages, tools[{type:'function', function}], stream:true,
  max_completion_tokens, stream_options.include_usage` (src/main/inference.ts:153-155).
- **T-7.** Part of the source-level mechanism is stated by rows of docs/handoff/work/research
  (E-29: `remote_host`/`remote_model` in the model config; E-16: `OLLAMA_NO_CLOUD`); the rest
  (`remote_host` on list, show and chat responses, `CloudStatus` and `GET /api/status`, the 403
  when cloud is disabled) stands only in capture lines there (DISCOVERY.md, "Reused"). Run 2
  re-collects the two v0.34.4 source files that state it, plus docs.ollama.com/cloud and
  docs.ollama.com/api/authentication.
- **S-4, T-8.** Dismissed with reasons in their rows; T-8's numbers are the sibling
  docs/research/2026-10-05-coding-model-shortlist's U-01..U-04 and U-19.

## Candidate material

Gathered 2026-10-05 with recipe `api-integration`, `--dry-run`: no pages gathered, no credits
spent. The owner pages are named directly, all typed P, in two runs: `research/plan.json` (18 URLs
on ai.google.dev, platform.claude.com and developers.openai.com) and `research/plan-2.json` (14 URLs
on api-docs.deepseek.com, docs.mistral.ai, openrouter.ai/docs, docs.ollama.com and the pinned
Ollama source). Which slugs a link in an existing capture confirms, and which are unconfirmed, is
listed in each plan's notes. `research/plan-conditional.json` holds the two searches (Mistral,
OpenRouter) and four fallback pages, each with its trigger; it runs only if the lead decides.
