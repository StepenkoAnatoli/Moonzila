# Brief - How the Anthropic Messages API, the OpenAI Responses API and the Google Gemini native API authenticate, stream text and tool calls, report usage and refuse over-window requests, and which vendors' OpenAI-compatible Chat Completions endpoints accept Moonzila's current request shape

_Auto-drafted 2026-10-05 by `bin/brief.mjs` from the corpus, redrafted after run 4 and authored on
2026-10-05 by the reviewing agent: the judged sections are written, and every claim below names the
E-row in `research/EVIDENCE.md` (with its cached capture under `research/raw/`) and the owner page it
rests on. All 37 pages were retrieved 2026-10-05 in four runs and all are typed P (the vendor's
own page)._

Reviewed by: agent

**This is the phase-1 to phase-2 handoff.** **Gate: PASS.** Of the 20 unknowns, 18 are CLOSED by
an owner page and 2 are KNOWN-UNKNOWN with their day-one step: U-18 (the wire probes no page can
settle) and U-05 (how Gemini's generateContent refuses an over-window prompt). U-05's owner page was
collected (E-36) and does not state it: it names an over-long input context only as an example cause
of a generic 500 INTERNAL, and the page gives no message a classifier could match, so probe U-18 (2)
settles it. U-20 is CLOSED from its owner page (E-37): on Google's OpenAI-compatible endpoint a Gemini
3 thought signature arrives as `extra_content.google.thought_signature` on the first tool call of each
step - of parallel calls only the first carries one - and must go back on that call exactly as
received; which streamed chunk carries it is U-18 (8). No row is OPEN. Run
`node "$HOME/.agents/research-kit/bin/preflight.mjs"` to see the current verdict.

Whoever you are - another agent, a different model, or a person - read this file first. If
something here is not enough to build from, say which fact is missing rather than guessing it:
that is a phase-1 gap to close, not a phase-2 judgement call. Documentation of an endpoint is not
proof that it accepts Moonzila's exact request; every such claim below stays a day-one probe.

## Intent

Direction 2 of Moonzila's "More models" task (docs/orchestration/2026-10-05-more-models/RUN.md):
provider adapters for the profile kinds that are declared but refused today. `complete()` in
`src/main/inference.ts` admits only 'openai-compatible' and 'ollama' (:142-143); 'anthropic' and
'openai-responses' throw NOT_IMPLEMENTED, and Google Gemini has no kind at all. A builder will add,
in Electron main, one adapter per wire format - Anthropic Messages, OpenAI Responses and Gemini
`generateContent` - each with: a kind-aware auth header built inside `vault.withSecret` (Bearer is
hard-coded at :145, and endpoint query strings are refused at :17); the route and stream framing;
a stream accumulator beside `OllamaAccumulator` and `OpenAIAccumulator` (src/main/provider-stream.ts)
that yields the canonical result - text, tool calls with unique ids and JSON-object arguments, an
outcome of complete, incomplete, blocked or tool_calls, and usage only when observed; CONTEXT_LIMIT
classification of over-window refusals (:99-122); rate-limit handling; and the round trip of any
opaque continuation state (thinking or thought signatures, reasoning items) through the unused
wire-state plumbing (src/shared/contracts.ts:38-44, src/engine/store.ts:227-238) where a vendor
makes it mandatory. Alongside, a compatibility table for the existing 'openai-compatible' kind -
Gemini's and Anthropic's OpenAI layers, DeepSeek, Mistral and OpenRouter - saying per vendor
whether the current body (:153-155) works unchanged, needs a field mapped, or loses a mandatory
feature, so the scope of new kinds is set by facts. And a locality rule for loopback endpoints:
an Ollama on 127.0.0.1 can serve cloud models, which breaks "loopback = local" (:18-20).
**Done** means a builder can write each adapter's request builder, accumulator, outcome map,
usage map, overflow classifier and wire-state round trip from cited facts, with test fixtures
copied from documented event shapes, and can fill every cell of the compatibility table without
guessing - every cell either CLOSED by an owner page or KNOWN-UNKNOWN with the live request that
settles it on day one.

## What we verified

### The contract at a glance

| Unknown | Subject | Status | Rests on |
|---|---|---|---|
| U-01 | Gemini routes, SSE selection, key header | CLOSED (stream end: U-18 (4)) | E-02, E-34, E-06, E-01, E-03, E-04 |
| U-02 | Gemini function calling (generateContent) | CLOSED (whole or fragmented in a stream: U-18 (4)) | E-02, E-34 |
| U-03 | Gemini thought signatures | CLOSED for the native API (compat half: U-20) | E-02, E-34, E-37, E-04, E-03 |
| U-04 | Gemini finish reasons, blocks, usage fields | CLOSED (usage chunk, finishReason of a call turn: U-18 (4)) | E-02 |
| U-05 | Gemini errors, over-window, countTokens | KNOWN-UNKNOWN - the owner page states no over-window body; U-18 (2), (9) | E-36, E-05, E-06 |
| U-06 | Gemini OpenAI-compatible layer | CLOSED (signatures: U-20; rest: U-18 (1), (8)) | E-07, E-37 |
| U-07 | Anthropic headers, body, SSE events, usage | CLOSED (usage cumulative per E-10's source; cross-check U-18 (6)) | E-08, E-09, E-10 |
| U-08 | Anthropic tool blocks, stop reasons, thinking | CLOSED | E-09, E-11, E-12, E-13 |
| U-09 | Anthropic errors and over-window | CLOSED (exact bytes: U-18 (2)) | E-13, E-12, E-10, E-08 |
| U-10 | Anthropic OpenAI-compatible layer | CLOSED (rest: U-18 (1), (8)) | E-15, E-12 |
| U-11 | OpenAI Responses stream events, states | CLOSED (stream end: U-18 (3)) | E-33, E-16, E-17, E-18 |
| U-12 | OpenAI Responses reasoning state | CLOSED | E-18, E-16, E-33 |
| U-13 | DeepSeek thinking with tools, request shape | CLOSED (rest: U-18 (7)) | E-19, E-20, E-21 |
| U-14 | Mistral chat completions | CLOSED (rest: U-18 (1), (5)) | E-22, E-23 |
| U-15 | OpenRouter request and stream | CLOSED | E-24, E-25, E-26 |
| U-16 | Rate-limit signals (Anthropic, Gemini) | CLOSED (Gemini 429 delay field: U-18 (11)) | E-14, E-12, E-05, E-35, E-36 |
| U-17 | Ollama cloud models behind loopback | CLOSED (reference classification: U-18 (10)) | E-29, E-28, E-30, E-31 |
| U-18 | Wire measurements no page owns | KNOWN-UNKNOWN | day-one probes (1)-(11) |
| U-19 | OpenRouter tool calling and reasoning on tool turns | CLOSED (rest: U-18 (1), (8)) | E-32, E-24, E-27 |
| U-20 | Gemini compatible endpoint: thought-signature carriage | CLOSED (streamed carriage: U-18 (8)) | E-37, E-07, E-04, E-34 |

Every closure rests on the vendor that owns the format, recorded as a single-witness note on each
row. The gate counts U-16 and U-17 as independent because each spans two hosts, but that is not
corroboration: U-16's two hosts are two vendors (Anthropic's half on E-14 and E-12, Google's on E-05,
E-35 and E-36), so each half is single-witness like the other rows, and U-17's two hosts (docs.ollama.com
and the Ollama source on raw.githubusercontent.com) are both Ollama's own.

### Gemini native (`generateContent`)

- **Routes.** `POST https://generativelanguage.googleapis.com/v1beta/{model=models/*}:generateContent`
  and `:streamGenerateContent`; streaming examples select SSE with `?alt=sse`, and the streamed body
  is "a stream of GenerateContentResponse instances" (E-02, https://ai.google.dev/api/generate-content).
- **Key.** The generateContent function-calling guide sends `x-goog-api-key` on
  `POST v1beta/models/<model>:generateContent` itself (E-34,
  https://ai.google.dev/gemini-api/docs/generate-content/function-calling); the header is also shown
  on `:countTokens` (E-06, https://ai.google.dev/gemini-api/docs/tokens) and on `v1beta/interactions`
  (E-01, https://ai.google.dev/gemini-api/docs/api-key). The reference's own examples pass `key=` in
  the query string (E-02). No captured page shows the header on `:streamGenerateContent` - U-18 (4)
  checks it there.
- **Tools.** `tools[].functionDeclarations` with an OpenAPI 3.0.3 subset in `parameters` or JSON
  Schema in `parametersJsonSchema` (E-02, E-34); a call is a `functionCall` part with `name`, `args`
  (JSON object) and `id`; no partial-argument field exists on FunctionCall (E-02).
- **Ids and parallel calls.** "Gemini 3 now always returns a unique `id` with every `functionCall`",
  and the `functionResponse` must carry that exact id (E-34); E-02 keeps the field optional, so an id
  is minted only when none arrives. One turn may hold several `functionCall` parts, results may go
  back in any order and are mapped by id, and a call is not always the last part (stated for custom functions
  combined with built-in tools), so every part is walked (E-34).
- **Results.** The results go back as `functionResponse` parts (`name`, `response` object, `id`) in a
  Content with **role `user`** - the role is `user` in every E-34 example (see Contradictions, 1). The
  Python and Go examples append the model's whole content before it; the REST example elides the
  history as `...`, and one JavaScript sample rebuilds the model turn from the `functionCall` alone
  (Contradictions, 10). The adapter appends the whole content unchanged, as the signature rules require,
  and sends all of a step's calls before all of its responses: interleaving them is a 400 (E-37).
- **Thought signatures.** `thoughtSignature` is an opaque base64 field on Part "so it can be reused in
  subsequent requests", and `MISSING_THOUGHT_SIGNATURE` is a finish reason (E-02). "In Gemini 3, any
  Part of a model response may contain a thought signature", "passing back thought signatures is
  mandatory for function calling", each goes back "inside its original Part", and a signed part is
  never merged with another part (E-34). Signatures "are required to maintain reasoning continuity
  across multi-turn interactions" (E-04, https://ai.google.dev/gemini-api/docs/thought-signatures), and
  in generateContent "there are no dedicated thought blocks", so a signature can sit on any part, such
  as a `functionCall` part or the final part of a response (E-04's ledgered source HTML, line 1471).
  The generateContent thought-signatures guide (E-37,
  https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures) gives the rules a
  hand-built history needs: on Gemini 3 a single call's part carries a signature and of parallel
  calls only the first does; it goes back "in the exact part where it was received"; validation covers
  every step of the **current turn** only - from the most recent user message holding text (a
  `functionResponse` message does not start a turn) - and earlier turns are not validated; omitting
  the first `functionCall` part's signature in any step of it is a **400** ("Function call `FC1` in
  the `1.` content block is missing a `thought_signature`."); a signature on another part (Gemini 3
  puts one on the last part when it thinks, and in a stream it may sit on a part with empty text) is
  recommended, not validated; when a response has function calls Gemini 2.5 puts it on the first
  part and returning it is optional (with no function calls, Gemini 2.5 puts it on no part); and
  injecting a call no Gemini response produced is strongly discouraged, but where it cannot be
  avoided the dummy values `context_engineering_is_the_way_to_go` or
  `skip_thought_signature_validator` skip validation.
- **Terminal states.** Full FinishReason enum, including STOP, MAX_TOKENS, SAFETY, RECITATION,
  MALFORMED_FUNCTION_CALL, UNEXPECTED_TOOL_CALL, TOO_MANY_TOOL_CALLS, MISSING_THOUGHT_SIGNATURE; an
  empty value means generation has not stopped; a blocked prompt sets `promptFeedback.blockReason`
  and returns no candidates (E-02). FinishReason has no tool-call value, and no captured page states
  which value a `functionCall` turn ends with (U-18 (4)); design point 4 maps every value.
- **Usage.** `usageMetadata`: promptTokenCount, cachedContentTokenCount, candidatesTokenCount,
  toolUsePromptTokenCount, thoughtsTokenCount, totalTokenCount (E-02).
- **Retry.** 429 RESOURCE_EXHAUSTED and 503 UNAVAILABLE (and 408, 5xx) are retried with exponential
  backoff and jitter; 400, 402, 403 are not (E-05, https://ai.google.dev/gemini-api/docs/troubleshooting).
  The generateContent error reference agrees, and its 402 (prepay credits depleted, "Don't retry")
  carries the same gRPC status as 429, RESOURCE_EXHAUSTED, so retry is keyed on the HTTP code (E-36).
- **Counting.** `POST v1beta/models/<model>:countTokens` with `x-goog-api-key` and a `contents` body
  returns the input-only total (E-06).
- **Errors and over-window.** The generateContent error reference (E-36,
  https://ai.google.dev/gemini-api/docs/generate-content/api-errors): a failed request gets its HTTP
  status and a body `{"error": {"code", "message", "status", "details"}}` - `code` the HTTP status,
  `status` the gRPC status (INVALID_ARGUMENT, RESOURCE_EXHAUSTED and so on), `details` entries such as
  ErrorInfo (with a `reason`) or LocalizedMessage. Codes: 400 INVALID_ARGUMENT and FAILED_PRECONDITION,
  402 and 429 RESOURCE_EXHAUSTED, 403 PERMISSION_DENIED, 404 NOT_FOUND, 499 CANCELLED, 500 INTERNAL,
  503 UNAVAILABLE, 504 DEADLINE_EXCEEDED. Over-window appears only as an **example cause**: an
  over-long input context under 500 INTERNAL ("An unexpected error occurred on Google's side") and an
  over-large prompt under 504. The page states no message or reason that tells that 500 from any
  other, so U-05 stays KNOWN-UNKNOWN. The Interactions variant (E-35, https://ai.google.dev/gemini-api/docs/api-errors)
  uses snake_case codes, an error object of `code` and `message` only and SSE error events with
  `event_type` "error", and names no over-window code either.
- **The docs' default changed.** Four Gemini URLs served the **Interactions API** variant, which the
  docs label "Interactions API (Recommended)" (E-01, E-03, E-04, E-35), and the generateContent
  pages label their own API "Legacy" (E-34, E-36, E-37). Interactions: `POST v1beta/interactions`,
  steps (`function_call` with id, name, arguments; `function_result` with call_id), streaming with
  `?alt=sse` plus `"stream": true`, partial tool arguments in `step.delta` events (E-03,
  https://ai.google.dev/gemini-api/docs/function-calling), `event:`-named SSE ending in
  `data: [DONE]`, and a `max_output_tokens` that includes thought tokens (E-04).

### Anthropic Messages

- **Request.** `POST https://api.anthropic.com/v1/messages`; `anthropic-version` required (example
  2023-06-01), `content-type: application/json` required, and the key as `Authorization: Bearer <key>`,
  with `x-api-key` a "Legacy fallback for Authorization, still supported", and `anthropic-workspace-id`
  "Required with a multi-workspace API key" (E-08, https://platform.claude.com/docs/en/api/overview).
  `max_tokens`, `messages`, `model` are the unmarked fields; `stream`, `system`, `tools` are optional (E-09,
  https://platform.claude.com/docs/en/api/messages/create).
- **Tools.** Definitions `name`, `description`, `input_schema`; `tool_use` blocks with `id`, `name`,
  `input` (object); results as `tool_result` blocks (`tool_use_id`, `content`) in the next user
  message (E-09), one per `tool_use`, placed first: a missing one, or one after other content, fails
  with "tool_use ids were found without tool_result blocks immediately after". Text after the results
  is accepted but discouraged ("Never add text blocks immediately after tool results"), because it can
  produce an empty `end_turn` response. The stricter rule - the message "must contain nothing except
  the `tool_result` blocks" and keeps the same `tools` array, else a 400 - is stated only for a
  response that also holds an unfinished `server_tool_use`; Moonzila sends no server tools and sends
  only the tool_result blocks, which satisfies both (E-11,
  https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons).
- **Stream.** `message_start`, then per block `content_block_start` / `content_block_delta` /
  `content_block_stop` keyed by `index` - a block may have zero deltas, since during server-side
  fallback a `fallback` block arrives as start and stop only - one or more `message_delta`,
  `message_stop`; any number of `ping` events; `error` events inside a 200 stream; unknown event types
  to be ignored; deltas `text_delta`, `input_json_delta` (partial JSON strings, final input an
  object), `thinking_delta`, `signature_delta` just before `content_block_stop` (E-10,
  https://platform.claude.com/docs/en/build-with-claude/streaming).
- **Usage.** `input_tokens`/`output_tokens` on `message_start` and `output_tokens` on `message_delta`
  in the basic example (the thinking example omits usage, an abbreviated example); the counts in
  `message_delta` usage "are cumulative" (E-10's ledgered source HTML, line 39), so output usage is
  the last `message_delta`'s value, never a sum. Usage fields include
  `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens_details.thinking_tokens` (E-09).
- **Stop reasons.** end_turn, max_tokens, stop_sequence, tool_use, pause_turn (server tools only),
  refusal ("a normal HTTP 200 response, not an error"), model_context_window_exceeded ("Treat the
  response as truncated") (E-11).
- **Thinking.** "Thinking blocks must be passed back unmodified and in their original order; a
  modified block results in a 400 invalid_request_error" (E-09); with tool use every `thinking` and
  `redacted_thinking` block must go back exactly as received (E-12,
  https://platform.claude.com/docs/en/api/errors; E-13). Thinking "is always on" for Fable 5.1,
  Mythos 5.1, Fable 5, Mythos 5, Opus 5.5 and Mythos Preview, and on Sonnet 5.5 it "can't be set to
  `disabled`": its lowest setting, `between_tools`, still returns the short updates it writes between
  tool calls as thinking blocks (E-12). **Replay is bound to the prefix:** on Fable 5.1, Opus 5.5 and
  Sonnet 5.5 a replayed thinking block is accepted "only while the `system` prompt, `tools`, and
  messages that preceded it are unchanged"; for accounts created on or after 2026-08-31 a changed
  prefix gets a 400, and the documented remedies are an append-only history or the
  `thinking-binding-controls-2026-08-01` beta header with `prefix_mismatch_behavior: "drop_block"`
  (on Sonnet 5.5 only with adaptive thinking) (E-12). Legacy extended thinking
  (`{type: enabled, budget_tokens}`, minimum 1,024 tokens, E-09) is refused with a 400 on Claude 4.7
  and later (E-12; Contradictions, 13).
- **Over-window.** Input alone over the window: 400 `invalid_request_error` ("prompt is too long") on
  every model; on Claude 4.5 and newer, input plus `max_tokens` over the window is accepted and stops
  with `model_context_window_exceeded` (E-13,
  https://platform.claude.com/docs/en/build-with-claude/context-windows). 413 `request_too_large`
  comes from Cloudflare for bodies over 32 MB (E-12, E-08); 529 `overloaded_error` (E-12).
- **Throttling.** 429 with `retry-after` in seconds and `anthropic-ratelimit-*` headers; a monthly
  spend-cap 429 has no `retry-after` and `error.details.error_code` `enforced_spend_limit_reached`
  (E-14, https://platform.claude.com/docs/en/api/rate-limits).

### OpenAI Responses

- **Request.** `POST /responses` with Bearer; `max_output_tokens` covers visible output and
  reasoning tokens; `store` defaults to true; `truncation` is deprecated and its default (disabled)
  fails an over-window input with a 400 (E-16,
  https://developers.openai.com/api/docs/api-reference/responses/create).
- **Result.** `status` completed, failed, in_progress, cancelled, queued or incomplete;
  `incomplete_details.reason` max_output_tokens, max_messages, content_filter or steered; `usage`
  input_tokens, input_tokens_details.cached_tokens, output_tokens, output_tokens_details.reasoning_tokens,
  total_tokens; `function_call` items with `call_id` and string `arguments`; results as
  `function_call_output` items (E-16).
- **Stream events.** Every event has a `type` and a `sequence_number`. Terminal: `response.completed`,
  `response.incomplete` ("emitted when a response finishes as incomplete") and `response.failed`, each
  carrying the whole Response, plus a separate `error` event (`code`, `message`, `param`). Items:
  `response.output_item.added` / `.done` (`item`, `output_index`). Calls:
  `response.function_call_arguments.delta` (`delta` string, `item_id`, `output_index`) and `.done`
  with the whole `arguments` string. Text: `response.output_text.delta` (`content_index`, `delta`,
  `item_id`, `output_index`) (E-33, the Responses reference served at
  https://developers.openai.com/api/docs/api-reference/responses-streaming). The guide lists the
  common events and defers the full list to that reference (E-17,
  https://developers.openai.com/api/docs/guides/streaming-responses).
- **Reasoning state.** Reaching `max_output_tokens` gives status incomplete, possibly before any
  visible output; OpenAI "highly recommend[s]" passing back reasoning items with function-call
  outputs; in stateless mode (`store: false`) reasoning items carry `encrypted_content` by default;
  persisted reasoning is reusable only within one model family (E-18,
  https://developers.openai.com/api/docs/guides/reasoning). The item to resend is the one from
  `response.output_item.done`, because `encrypted_content` "may be incomplete while the item is in
  progress" (E-33).

### The existing 'openai-compatible' kind, per vendor

Moonzila's body today: `model, messages, tools, stream: true, max_completion_tokens,
stream_options.include_usage` with `Authorization: Bearer` (src/main/inference.ts:145,153-155).
"Documented" means an owner page says so; nothing here is proven on the wire until U-18 runs.

| Vendor | Base URL and auth | Moonzila's current body | Tool turns | Verdict |
|---|---|---|---|---|
| Gemini layer | `https://generativelanguage.googleapis.com/v1beta/openai/`, Bearer (E-07) | max_completion_tokens and stream_options not stated (E-07) | a Gemini 3 thought signature arrives as `extra_content.google.thought_signature` on the first tool call of each step - of parallel calls only the first carries one, the others arrive with no `extra_content` (E-37) - and every signature the current turn received must go back on its call's `tool_calls` entry in the assistant message, else a 4xx (E-37); the streamed tool-call shape and which chunk carries `extra_content` are not stated (E-07, E-37); beta | plain chat documented; Gemini 3 tool turns break on the second request until the kind keeps `extra_content` when a call arrives with it (never requiring it) in the provider-state slot and sends back exactly what arrived on each call (design point 10); untested - U-18 (1), (8) |
| Anthropic layer | `https://api.anthropic.com/v1/`, Bearer (E-15); a multi-workspace key also needs `anthropic-workspace-id` on every request (E-15, E-08), which the kind cannot send | documented as accepted: max_completion_tokens, stream, stream_options, tools fully supported (E-15) | response tool_calls supported; replayed assistant tool_calls and tool tool_call_id fully supported per the source HTML's tables, collapsed in the markdown (E-15); thinking on by default on Claude 5 and never returned (E-15, E-12) | works unchanged per docs for single-workspace keys only; Anthropic says the layer "is not considered a long-term or production-ready solution for most use cases" (E-15 source HTML); loses thinking, cache counts, refusal and pause stop reasons; multi-turn tool use with always-on thinking unproven - U-18 (1), (8) |
| DeepSeek | `https://api.deepseek.com/chat/completions`, Bearer (E-20) | max_tokens is the documented cap, max_completion_tokens undocumented; stream_options documented (E-20) | on any request with tools, the reasoning_content of all previous assistant turns - tool-call turns and plain answers alike - must be sent back, else 400; thinking on by default (E-19) | loses a mandatory feature: breaks on any request with tools that follows an assistant turn whose reasoning_content was not carried, unless thinking is disabled (top-level `thinking` object or reasoning_effort none, E-20); finish_reason `insufficient_system_resource` and `aborted` map to failure (E-20); cap needs mapping - U-18 (7) |
| Mistral | `https://api.mistral.ai/v1/chat/completions`, Bearer (E-22) | max_tokens documented; max_completion_tokens and stream_options not in the schema (E-22) | stream delta.tool_calls with id and index, finish_reason tool_calls in the page source (E-22); id format not stated (E-23); reasoning models may stream ThinkChunk content parts whose signature is "to replay some reasoning blocks across turns" (E-22), replay untested | needs the cap mapped (likely); streamed finish_reason `error` maps to failure, `length` (and the non-streaming `model_length`) to incomplete (E-22); untested - U-18 (1), (5), (8) |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions`, Bearer (E-25) | accepted: max_completion_tokens (E-24); stream_options deprecated, no effect, usage always sent (E-26) | tools in OpenAI shape on every request, transformed upstream; finish_reason tool_calls; results as role tool with tool_call_id (E-32, E-24); preserving reasoning_details is recommended for continuity and described as necessary for Claude-like models (E-27); which upstreams refuse without it is U-18 (8) | body works; `readSse` must skip `:` comment lines and the accumulator must fail on an in-stream error chunk (E-25); carry reasoning_details in wire state; streamed chunk fields and per-model refusals untested - U-18 (1), (8) |

### Ollama behind a loopback address

A signed-in local Ollama serves cloud models through `http://localhost:11434` (E-29,
https://docs.ollama.com/api/authentication); cloud models are named like `gemma4:cloud` (E-28,
https://docs.ollama.com/cloud). At v0.34.4, chat, generate, show and list responses carry
`remote_model`/`remote_host`, and `GET /api/status` returns `cloud.disabled` and `cloud.source`
(E-30); a cloud-sourced reference is proxied, a model with a remote host is refused with 403 while
cloud is disabled, and `/v1/chat/completions` puts `cloudPassthroughMiddleware` in front of the same
`ChatHandler` that proxies a cloud-sourced reference (E-31).

## Contradictions and how they were resolved

1. **Gemini function-response role - resolved: `user`.** The generateContent reference says
   `Content.role` "Must be either 'user' or 'model'" and, under Tool, that the next turn may hold a
   FunctionResponse "with the Content.role \"function\"" (E-02). The generateContent function-calling
   guide sends every functionResponse in a `user` turn, in Python, JavaScript, Go and REST (E-34).
   Trust `user`: it is what the field definition allows and what the dedicated guide does throughout;
   the Tool sentence is the outlier.
2. **Gemini key placement.** E-02's examples put the key in `?key=`; E-01, E-06 and E-34 put it in
   `x-goog-api-key`, E-34 on `:generateContent` itself. Not a contradiction of fact but of form; the
   header is trusted for Moonzila because a key in a URL breaks the no-credentials-in-URLs rule, and
   U-18 (4) confirms the header on `:streamGenerateContent`.
3. **Gemini compatible base URL.** Every example on E-07 uses `.../v1beta/openai/` except the
   `extra_body` example, which uses `.../v1beta/`. Trust `.../v1beta/openai/`: it is repeated
   throughout and is the URL the page's own explanation names.
4. **OpenAI reasoning include.** E-16 presents `include: ["reasoning.encrypted_content"]` as the way to
   get encrypted reasoning for stateless use; E-18 says stateless responses carry `encrypted_content`
   by default and the include value is accepted but not required. Both accept the include value, so
   the adapter sends it; E-18 is trusted for the default because it is the more specific statement.
5. **OpenAI: recommended or required.** E-18 "highly recommend[s]" passing reasoning items back; the
   contract's "Reused" list records, from the function-calling guide captured in
   docs/research/2026-09-29-streaming-tool-calls, that they "must also be passed back" (not re-read
   here). The design treats it as required, which satisfies both wordings.
6. **DeepSeek reasoning_content on requests.** E-20 documents a request-side `reasoning_content` only
   for the beta Chat Prefix Completion feature; E-19 requires it on every request with tools and names
   the 400. E-19 is trusted (it states the consequence); U-18 (7) records the actual 400 body.
7. **Mistral tool-call ids - not a real contradiction.** E-23's example id is `D681PevKs`; the UUID
   in E-22's captured source is the reference's generic placeholder, repeated 14 times as the example
   of unrelated id-like fields, so it says nothing about the form of a minted tool-call id. No format
   is stated, so none is assumed; U-18 (5) tests a minted id.
8. **Anthropic system role.** E-09 says "there is no \"system\" role for input messages" while its
   role enum lists "system". Moonzila sends the system prompt in the top-level `system` field, which
   both readings allow.
9. **OpenAI incomplete event - resolved: it exists.** The streaming guide's SDK type union names a
   failed event and no incomplete one (E-17); the Responses reference defines `response.incomplete`
   (E-33). Trust E-33: the guide itself defers the full event list to that reference, and its union is
   a code sample.
10. **A Gemini sample against its own rules.** E-34's compositional JavaScript example rebuilds the
    model turn from the `functionCall` object alone, which would drop a signature carried on its Part,
    while the same page says signatures go back "inside its original Part" and are mandatory for
    function calling. Trust the rules, which E-02 and E-04 support; the adapter resends the model's
    whole content.
11. **OpenRouter's streaming sample is not a schema.** E-32's sample reads `finish_reason` from the
    delta object and appends raw `tool_calls` fragments without merging them by index, unlike the
    index-keyed deltas on record for Chat Completions (DISCOVERY "Reused", the 2026-09-29
    streaming-tool-calls corpus). Nothing is taken from the sample; U-18 (1) records the real chunks.
12. **Captured subject drift (not a contradiction, recorded so nobody re-reads it as one).** The
    planned Gemini api-key, function-calling, thought-signatures and api-errors URLs served Interactions
    API pages (E-01, E-03, E-04, E-35) - the generateContent variants of the last three are captured as
    E-34, E-37 and E-36 - the troubleshooting page no longer holds the error table (E-05), and the
    responses-streaming URL served the whole Responses reference (E-33). Claims from those rows are
    labelled with the variant they describe.
13. **Anthropic thinking budget - resolved: legacy only.** E-09 says the thinking parameter "Requires a
    minimum budget of 1,024 tokens" with no qualification; E-12 says Claude 4.7 and later models have
    removed extended thinking and answer `{type: enabled}` with a 400, and E-15 calls manually
    configured extended thinking a legacy mode. Trust E-12 for current models: the budget applies only
    where extended thinking is accepted (Claude 4.5 and earlier, Mythos Preview). Nothing in the design
    sets a budget.
14. **Anthropic tool_result placement - one case, not the rule.** E-11's "must contain nothing except
    the `tool_result` blocks" is stated for a response that also holds an unfinished server tool call;
    for client tools the same page shows text after the results accepted but able to cause an empty
    `end_turn`. Sending only the tool_result blocks, as Moonzila does, satisfies both.
15. **Gemini's OpenAI-compatibility samples - kept: role `assistant`, decided by U-18 (8).** In E-37's
    section "Signatures for OpenAI compatibility" the two samples disagree: the sequential example
    sends the assistant message back with `"role": "model"`, the parallel example with
    `"role": "assistant"`, and the parallel example's first request is a native
    `contents`/`functionDeclarations` body, not a chat-completions one. No other page decides it: E-07's
    examples carry only system and user messages, with no assistant turn and no `tool_calls`. Moonzila
    keeps `assistant` because it is the Chat Completions role it already sends; the signature field
    (`extra_content.google.thought_signature` on the tool call) is the same in both examples. U-18 (8)
    sends `assistant` and records the result, and that recording decides it.
16. **Gemini missing signature - resolved: a 400 for a current-turn call.** E-37 says omitting the
    signature of the first `functionCall` part of any step of the current turn fails the request with
    a 400; E-02 also defines a FinishReason MISSING_THOUGHT_SIGNATURE, "Request has at least one
    thought signature missing", without saying when it is used. Trust E-37 for the request rule: it is
    the dedicated guide and states the consequence. The outcome map treats the finish reason as
    failure, so the design holds whichever one a request meets.
17. **Gemini signature key spelling - resend as received; write `thoughtSignature`.** E-02 names the
    Part field `thoughtSignature` and most of E-37's native examples use it, but two write
    `thought_signature`: the parallel example's request (capture line 473) and the text-part model
    response (capture line 532). A signature the adapter received goes back in the part exactly as the
    response delivered it, so for those it picks no spelling. The one signature it writes itself - the
    dummy for a current-turn call no Gemini response produced (U-03, design point 10) - does need a
    key: on the native API it goes in E-02's field name, `thoughtSignature`; on the compatible
    endpoint in `extra_content.google.thought_signature`, the only form E-37's OpenAI section shows.

## Known unknowns

### KNOWN-UNKNOWN - U-05, Gemini's over-window refusal

The owner page was collected and does not state it. The generateContent error reference (E-36,
https://ai.google.dev/gemini-api/docs/generate-content/api-errors, linked from the E-35 capture, line
69) gives the error format and every code, but names an over-long input context only in the Example
column of 500 INTERNAL, whose description is "An unexpected error occurred on Google's side" (and an
over-large prompt under 504 DEADLINE_EXCEEDED). Not on the page: the message, ErrorInfo `reason` or any
other field that tells an over-window 500 from any other INTERNAL error, and whether an over-window
prompt can get a 400 INVALID_ARGUMENT instead. The troubleshooting page (E-05) and the reference (E-02)
do not state it either. Until the probe runs, the Gemini adapter adds **no** Gemini-specific
CONTEXT_LIMIT rule - a rule on every 500 would turn real server faults into CONTEXT_LIMIT - so a 500 is
retried within the bounded backoff and then surfaces as PROVIDER_ERROR, `refusalCode`
(src/main/inference.ts:99-122, which reads 400, 413 and 422 bodies only) is unchanged, and the UTF-8/2
estimate (src/engine/context.ts:30-32) stays. Day one: U-18 (2) records the HTTP status, gRPC status,
message and `details` byte for byte - if the status is 500, `refusalCode` must also read a 500 body for
the Gemini kind - and U-18 (9) records what `countTokens` accepts beyond `contents` (E-06).

### KNOWN-UNKNOWN - U-18, the day-one wire probes

Each needs that vendor's own key, supplied by the user on the collector machine and never written
into a repository; a vendor without a key stays untested in the design and the table above.

1. Moonzila's exact body with one tool against each compatible endpoint; log every raw SSE line;
   check `OpenAIAccumulator` gets one call, `finish_reason: tool_calls` and a usage chunk.
2. A prompt about 1.5 times the window to every compatible and native route (Gemini's
   `:generateContent` and `:streamGenerateContent` included); record status and body; extend
   `refusalCode` only from these bodies. For Gemini, record the gRPC `status`, the `message` and every
   `details` entry, and whatever HTTP status comes back - 400, 500 (E-36 names over-long input under
   500), or a 429 RESOURCE_EXHAUSTED when the one prompt passes the key's tokens-per-minute limit
   (E-36's 429 row names "using too many tokens"); a 429 is a rate limit and is never classed as
   CONTEXT_LIMIT.
3. CRLF, comment lines and ping events, and whether the OpenAI Responses stream sends any line after
   its terminal event, recorded as fixtures in tests/provider-stream.test.ts.
4. Gemini native `streamGenerateContent?alt=sse` with `x-goog-api-key`: last bytes before close,
   whole or fragmented `functionCall`, `usageMetadata` on every chunk, and the `finishReason` on the
   chunk that carries a `functionCall`.
5. Mistral replay of a tool call whose id Moonzila minted (src/main/inference.ts:78).
6. Anthropic, a cross-check only: usage on `message_start` and every `message_delta` against the
   non-streamed usage (E-10's source says `message_delta` usage is cumulative).
7. DeepSeek: `max_completion_tokens` 64 versus `max_tokens` 64 with thinking on; a tool turn without
   `reasoning_content` (record the 400).
8. Two-turn tool round trips where thinking state may not travel: Gemini's compatible layer with a
   Gemini 3 model, streamed (record which chunk carries `extra_content` - E-37 shows it only on whole
   messages - and send the second turn with it and without it, expecting a 4xx without, U-20),
   Anthropic's compatible layer, OpenRouter with a
   Claude model and a Gemini 3 model sending the second turn without `reasoning_details`, and Mistral
   with a reasoning model sending the second turn without its ThinkChunk parts.
9. Gemini `countTokens` with tools, and with a `generateContentRequest`.
10. Ollama, against the user's own server (no key): `/api/status` and the version; `/api/show` and
    `/api/tags` for a `:cloud` name, a `-cloud` tag and a local model built FROM a cloud model; with
    cloud disabled, a cloud-suffixed model through `/v1/chat/completions` (expect a refusal); with the
    user's consent, whether an OpenAI-shaped response from a cloud model carries any remote field.
11. Any 429 met during the probes: status, headers and body byte for byte, looking for a retry-delay
    field (E-36 gives the generateContent error body, whose `details` names ErrorInfo and
    LocalizedMessage only, and no captured page states a retry delay).

### Not stated on any captured page (the design must not depend on these)

An `is_error` field on tool_result (E-09, collapsed); when `generateContent` ends a candidate with
MISSING_THOUGHT_SIGNATURE rather than refusing with the 400 that E-37 states (E-02, E-37);
which `finishReason` a Gemini `functionCall` turn ends with (E-02, E-34; U-18 (4)); whether a
terminal line follows the last Responses stream event (E-33); the message of a Gemini over-window
refusal (E-36; U-05, U-18 (2)), any retry delay in a `generateContent` 429 body (E-36; U-18 (11)),
and how a failure after a `streamGenerateContent` response has started is signalled (E-02, E-36);
which streamed chunk carries a Gemini thought signature on the compatible endpoint (E-37; U-18 (8));
whether reasoning counts against DeepSeek's `max_tokens` (E-19, E-20); what OpenRouter does with a
parameter an upstream does not support (E-24); whether OpenAI refuses `previous_response_id` with
`store: false` (E-18); and how Ollama classes a reference as cloud-sourced and whether `/api/status`
exists before v0.34.4 (E-31; U-18 (10)). Two facts an earlier draft listed here are stated after all,
in callouts the markdown conversion dropped and the ledgered source HTML keeps: Anthropic's
`message_delta` usage is cumulative (E-10), and Anthropic calls its compatible layer not
production-ready for most use cases (E-15). OpenRouter's own data-use and logging
terms are covered by neither this corpus nor the sibling docs/research/2026-10-05-coding-model-shortlist
(named to the lead in MAP D-4).

## What this means for Moonzila's design

1. **The wire-state store stops being optional.** Anthropic thinking blocks must go back unchanged
   with tool results (E-09, E-12, E-13) and thinking cannot be disabled on several current Claude
   models, Sonnet 5.5 included (E-12); the Gemini adapter resends the model content of every step of
   the current turn whole, signatures in their original parts - the design, following E-34's rule that
   each signature goes back inside its original Part (E-34, E-02, E-04) - while the 400 E-37 states is
   narrower: a missing signature on the first `functionCall` part of any step of the current turn, or
   a step's calls interleaved with their responses; a signature on any other part is not validated
   (E-37);
   OpenAI reasoning items should be replayed with
   `encrypted_content`, taken from `response.output_item.done`, under `store: false` (E-18, E-33);
   DeepSeek needs `reasoning_content` back for **every** earlier assistant turn on any request with
   tools, plain answers included (E-19); OpenRouter recommends resending `reasoning_details` and calls
   it necessary for Claude-like models (E-27); a Gemini 3 signature on the compatible endpoint arrives
   as `extra_content` on the first tool call of each step (of parallel calls only the first carries
   one) and must go back on that call for every step of the current turn (E-37), so the slot holds
   per-tool-call state as well (design point 10); a Mistral ThinkChunk signature
   (E-22) may need it too (untested, U-18 (8)).
   `InferenceMessage` (src/main/inference.ts:10) needs an opaque per-message provider-state slot fed
   from src/shared/contracts.ts:38-44 and src/engine/store.ts:227-238, kept on every assistant turn
   the vendor requires it for - for DeepSeek every assistant turn, not only those with tool calls -
   and history assembly (src/engine/application.ts:347) must keep it. Gemini validates signatures
   only within the current turn, from the last user message holding text, so dropping earlier runs'
   tool messages breaks no Gemini request (E-37); kept signatures are still resent, as Google
   recommends. **Anthropic adds a prefix
   rule:** on Fable 5.1, Opus 5.5 and Sonnet 5.5 a replayed thinking block is refused with a 400
   (accounts created on or after 2026-08-31) once the system prompt, the tools or any earlier message
   changed (E-12). Dropping earlier runs' tool messages at application.ts:347, or any context
   trimming, changes that prefix, so the Anthropic adapter either keeps the history it replays
   thinking into append-only or sends the `thinking-binding-controls-2026-08-01` beta header with
   `prefix_mismatch_behavior: "drop_block"` (adaptive thinking only on Sonnet 5.5), which drops the
   stale block instead of failing. Which of the two is a Mandate choice.
2. **Auth is mostly Bearer, so :145 becomes a per-kind builder, not three.** Anthropic accepts
   `Authorization: Bearer` (E-08) and adds `anthropic-version`, plus `anthropic-workspace-id` on every
   request when the key spans several workspaces (E-08, E-15) - so an Anthropic profile, native or
   through the compatible layer, needs an optional workspace setting, and until it has one only
   single-workspace keys work; DeepSeek, Mistral, OpenRouter and both compatible layers are Bearer
   (E-20, E-22, E-25, E-07, E-15); Gemini native wants `x-goog-api-key` (E-34, E-06, E-01). Gemini's
   `?alt=sse` is a fixed parameter main appends to the route it builds - the user's endpoint still
   carries no query string (:17).
3. **SSE parsing must widen before any new vendor works.** `readSse` must skip `:` comment lines
   (E-25), tolerate `event:` lines and ignore unknown event types (E-10), and an in-stream failure
   signal - Anthropic's `error` event (E-10, E-12), OpenRouter's error chunk with `finish_reason: "error"`
   (E-25), the Responses `error` event (E-33), Mistral's `finish_reason: "error"` (E-22) and
   DeepSeek's `insufficient_system_resource` and `aborted` (E-20) - must end the run as a failure,
   never as a successful answer. Mistral's `model_length` (the model's context length reached, in the
   non-streaming schema, E-22) maps to incomplete, and `OpenAIAccumulator` maps any `finish_reason` it
   does not know to failure, never to complete. OpenRouter repeats `finish_reason` on its usage chunk
   (E-25), so a second terminal chunk is not an error.
4. **Accumulators and outcome maps** (proposed from the documented enums and events): Anthropic
   end_turn and stop_sequence to complete, tool_use to tool_calls, max_tokens and
   model_context_window_exceeded to incomplete, refusal to blocked, pause_turn to failure (E-11);
   Gemini, every part walked for `functionCall`s (E-34) and every part kept as received for the wire
   state, an empty-text part carrying a signature included (E-37): a candidate with a `functionCall` part ends
   as tool_calls when its finishReason is STOP or absent - FinishReason has no tool-call value and no
   captured page states which one a call turn carries (U-18 (4)) - and otherwise follows its
   finishReason, so a tool turn never closes as complete; STOP to complete; MAX_TOKENS to incomplete;
   SAFETY, RECITATION, LANGUAGE, BLOCKLIST, PROHIBITED_CONTENT, SPII, IMAGE_SAFETY,
   IMAGE_PROHIBITED_CONTENT, IMAGE_RECITATION, ESCALATION, PUP_LIMITED_DISABLED and any
   `promptFeedback.blockReason` to blocked; MALFORMED_FUNCTION_CALL, UNEXPECTED_TOOL_CALL,
   TOO_MANY_TOOL_CALLS, MISSING_THOUGHT_SIGNATURE, MALFORMED_RESPONSE, OTHER, NO_IMAGE, IMAGE_OTHER,
   FINISH_REASON_UNSPECIFIED, any unknown value and a stream that closes with no finishReason to
   failure (E-02); Responses calls keyed by `item_id` from `response.output_item.added`, argument
   deltas appended and the `.done` string taken as final, `response.completed` to complete or
   tool_calls, `response.incomplete` to incomplete (content_filter to blocked), `response.failed` and
   `error` to failure, usage from the terminal Response when present (E-33, E-16).
5. **CONTEXT_LIMIT.** Anthropic: 400 with "prompt is too long" before the stream (E-13) and
   `model_context_window_exceeded` as an incomplete outcome (E-11); OpenAI Responses: a 400 with
   truncation left at its default (E-16); Gemini: no rule until U-18 (2) records the body (U-05) -
   E-36 names over-long input only as an example cause of a generic 500 INTERNAL, which `refusalCode`
   does not read and which a rule must not match wholesale. The
   exact bytes for every vendor come from U-18 (2).
6. **Rate limits.** Wait `retry-after` when present (E-14), never retry an Anthropic spend-cap 429
   (E-14), back off exponentially for Gemini 429, 500 and 503 (E-05, E-36), never retry a Gemini 402
   although it shares 429's gRPC status RESOURCE_EXHAUSTED - key on the HTTP code (E-36); no captured
   page documents a delay field for generateContent (E-36 names ErrorInfo and LocalizedMessage details
   only) and U-18 (11) records any 429 body met; surface PROVIDER_ERROR once a wait would pass the
   120 s timeout (:146).
7. **Usage only when observed.** Anthropic's output usage is the last `message_delta` value, which is
   cumulative (E-10's source HTML), and an event without usage leaves the count unset, never 0;
   Gemini's carrier chunk is unknown until U-18 (4); DeepSeek and OpenRouter put it on the last chunk
   (E-20, E-25); Responses carries it on the terminal event's Response (E-33, E-16).
8. **Locality, fail-closed.** Under a local-only policy a loopback Ollama is accepted only when
   `GET /api/status` reports `cloud.disabled: true` - the branch Ollama documents (E-28: "To use only
   local models, disable cloud features") and its source enforces for remote-host models (E-31). The
   finer rule (the chosen model's `/api/show`, answered locally, has an empty `remote_host`, and its
   name has no `:cloud` or `-cloud` tag) depends on how Ollama classes a reference as cloud-sourced,
   which no capture states, so it stays off until U-18 (10) records the classification; `/api/show`
   for a cloud-sourced name is itself proxied to ollama.com (the model name only, E-31). A
   `remote_host` on a response is not a control - the prompt has already left - and the OpenAI-shaped
   `/v1/chat/completions` response is not shown carrying it. `/api/status` is read through a client
   method named `CloudStatusExperimental` (E-30), so a missing endpoint counts as cloud not known to be
   disabled. This changes src/main/inference.ts:18-20 from a host check to a host check plus an Ollama
   status check (E-29, E-30, E-31).
9. **Gemini format is a Mandate choice.** generateContent is documented and is what the intent
   names, and this corpus closes it except for the overflow body (U-05); but Google's docs now default
   to the Interactions API (E-01, E-03, E-04, E-35) and label generateContent "Legacy" (E-34, E-36,
   E-37).
   Building Interactions would need its reference `https://ai.google.dev/api/interactions-api` (linked
   from the E-04 capture, line 68, and the E-35 capture) collected first; no unknown needs it today.
10. **Gemini 3 through the existing 'openai-compatible' kind needs the slot per tool call.** In a
    Gemini 3 response the first tool call of each step carries `extra_content.google.thought_signature`;
    of parallel calls only the first carries one, and the rest arrive with no `extra_content` at all
    (E-37: `"type": "function" // No signature on Parallel FC`). The next request must carry every
    signature the current turn received back on its call's `tool_calls` entry, or Gemini answers with
    a 4xx (E-37). So `OpenAIAccumulator` keeps the `extra_content` object only when a call arrives with
    one, unchanged, in the provider-state slot, and never requires it: a call without it is the normal
    shape of every parallel call after the first, not a protocol error, and a fail-closed check on it
    would break every parallel tool step. The request builder sends back exactly what arrived on each
    call - the object on the call that had it, nothing on a call that did not. Which streamed chunk
    carries it is recorded by U-18 (8) before the accumulator reads it, and until then Gemini 3 tool
    turns through this kind stay untested. A dummy signature (`skip_thought_signature_validator`, E-37)
    is only for a current-turn call that no Gemini response produced (a profile switched mid-run),
    never a substitute for a received one and never added to a parallel call that arrived without one.

## Decision

Build order, as this corpus supports it (the Mandate may reorder it; nothing here decides which
vendors the user wants):

1. **First: the shared stream and state groundwork**, which every later step needs and which rests
   only on closed rows - `readSse` comment-line and event-name tolerance, in-stream error chunks and
   events as failures, fixtures for each documented event shape (E-10, E-25, E-33), and the
   per-message provider-state slot through the wire-state store (E-09, E-12, E-13, E-19, E-27, E-34,
   E-37).
2. **Then the Anthropic native adapter** - U-07, U-08, U-09, U-16 are all closed (E-08 to E-14); it
   needs the optional workspace setting (E-08) and one of the two prefix remedies for thinking replay
   (E-12, design point 1).
3. **Then the OpenAI Responses adapter** - U-11 and U-12 are closed (E-16, E-18, E-33); its over-window
   400 is documented (E-16) and its exact body is U-18 (2).
4. **Then fixes to the existing kind:** DeepSeek's per-vendor mapping (send the top-level `thinking`
   object disabled, or carry `reasoning_content` on every assistant turn; map the cap to `max_tokens`;
   map `insufficient_system_resource` and `aborted` to failure) (E-19, E-20); Mistral's finish_reason
   mapping (E-22); OpenRouter's `reasoning_details` carried on assistant tool turns (E-27, E-32);
   Gemini's `extra_content` carried per tool call for Gemini 3 tool turns, once U-18 (8) has recorded
   which chunk carries it (E-37, design point 10); and the fail-closed Ollama locality rule (E-28 to
   E-31).
5. **Then the Gemini native adapter, once the Mandate picks generateContent** - U-01 to U-04 are
   closed (E-02, E-34, E-37); its overflow classifier ships without a Gemini rule, so an over-window
   refusal surfaces as PROVIDER_ERROR until U-18 (2) records the body (U-05).

Out of scope here (other corpora own them): per-token prices, model ids, context windows and output
caps, vendor data-use terms, local model selection (DISCOVERY "Already decided"). Out of scope until
the Mandate asks for it: the Gemini Interactions API.

**First build step:** in src/main/provider-stream.ts, make `readSse` skip lines that start with `:`
and pass `event:` names through, and add `tests/provider-stream.test.ts` fixtures copied from E-10
(Anthropic's basic and tool-use streams, including `ping` and an `error` event) and E-25
(OpenRouter's `: OPENROUTER PROCESSING` line, its usage chunk that repeats `finish_reason`, and its
mid-stream error chunk), with the error cases asserting a failed outcome, not a successful answer, and
a content block with zero deltas accepted (E-10's fallback exception).

## Next steps

1. Ask the user which vendor keys they will supply for U-18 (DISCOVERY, "Questions for the human",
   1), and run the probes as the first day-one task; U-05 closes only from probes (2) and (9), since
   its owner page (E-36) is collected and does not state the over-window body, and probe (8) fixes
   where Gemini's compatible stream carries `extra_content` (U-20).
2. Hand this file to the builder; the gate passes.
3. If the Mandate chooses the Gemini Interactions API, collect its reference
   https://ai.google.dev/api/interactions-api on the collector machine first; no unknown needs it today.

<!-- research-kit:brief-draft body=ff91ab8172f10b03 inputs=ccf8b8ba889440d6 gate=pass -->
