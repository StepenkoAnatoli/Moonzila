---
url: https://platform.claude.com/docs/en/api/messages/create
retrieved: 2026-10-05
command: firecrawl scrape https://platform.claude.com/docs/en/api/messages/create --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Create a Message - Claude API Reference
---
Copy page



cURL

# Create a Message

POST/v1/messages

Send a structured list of input messages with text and/or image content, and the model will generate the next message in the conversation.

The Messages API can be used for either single queries or stateless multi-turn conversations.

Learn more about the Messages API in our [user guide](https://platform.claude.com/docs/en/get-started)

##### Headers

"anthropic-user-profile-id": optional string

The user profile ID to attribute this request to. Use when acting on behalf of a party other than your organization. Requires the `user-profiles` beta header.



"anthropic-workspace-id": optional string

Optional header to select the Workspace for this request. The value is a Workspace ID (for example, `wrkspc_011CZkZaBF1tNoB5wlCeusgy`).

Only needed for credentials that can act on more than one Workspace. A credential that belongs to a specific Workspace may omit it; if sent, it must match that Workspace.

##### Body



max\_tokens: number

The maximum number of tokens to generate before stopping.

Note that our models may stop _before_ reaching this maximum. This parameter only specifies the absolute maximum number of tokens to generate.

Set to `0` to populate the [prompt cache](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#pre-warming-the-cache) without generating a response.

Different models have different maximum values for this parameter. See [models](https://platform.claude.com/docs/en/about-claude/models/overview) for details.

minimum0



messages: array of [MessageParam](https://platform.claude.com/docs/en/api/http/messages#message_param) { content, role }

Input messages.

Our models are trained to operate on alternating `user` and `assistant` conversational turns. When creating a new `Message`, you specify the prior conversational turns with the `messages` parameter, and the model then generates the next `Message` in the conversation. Consecutive `user` or `assistant` turns in your request will be combined into a single turn.

Each input message must be an object with a `role` and `content`. You can specify a single `user`-role message, or you can include multiple `user` and `assistant` messages.

If the final message uses the `assistant` role, the response content will continue immediately from the content in that message. This can be used to constrain part of the model's response.

Example with a single `user` message:

```
[{"role": "user", "content": "Hello, Claude"}]
```



Example with multiple conversational turns:

```
[\
  {"role": "user", "content": "Hello there."},\
  {"role": "assistant", "content": "Hi, I'm Claude. How can I help you?"},\
  {"role": "user", "content": "Can you explain LLMs in plain English?"},\
]
```



Example with a partially-filled response from Claude:

```
[\
  {"role": "user", "content": "What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun"},\
  {"role": "assistant", "content": "The best answer is ("},\
]
```



Each input message `content` may be either a single `string` or an array of content blocks, where each block has a specific `type`. Using a `string` for `content` is shorthand for an array of one content block of type `"text"`. The following input messages are equivalent:

```
{"role": "user", "content": "Hello, Claude"}
```



```
{"role": "user", "content": [{"type": "text", "text": "Hello, Claude"}]}
```



See [input examples](https://platform.claude.com/docs/en/build-with-claude/working-with-messages).

Note that if you want to include a [system prompt](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#give-claude-a-role), you can use the top-level `system` parameter — there is no `"system"` role for input messages in the Messages API.

There is a limit of 100,000 messages in a single request.



content: stringorarray of [ContentBlockParam](https://platform.claude.com/docs/en/api/http/messages#content_block_param)

One of the following:

string



array of [ContentBlockParam](https://platform.claude.com/docs/en/api/http/messages#content_block_param)

One of the following:



TextBlockParamobject{ type: "text", text, cache\_control, citations }



ImageBlockParamobject{ type: "image", source, cache\_control, transformations }



DocumentBlockParamobject{ type: "document", source, cache\_control, 3 more }



SearchResultBlockParamobject{ type: "search\_result", content, source, 3 more }



ThinkingBlockParamobject{ type: "thinking", signature, thinking }

type: "thinking"



signature: string

The `signature` value of this thinking block, exactly as returned by the API in a previous response. Used to verify that the block was generated by Claude.

Thinking blocks must be passed back unmodified and in their original order; a modified block results in a 400 `invalid_request_error`.

thinking: string

The `thinking` text of this block as returned by the API.



RedactedThinkingBlockParamobject{ type: "redacted\_thinking", data }

type: "redacted\_thinking"

data: string

The `data` value of this redacted thinking block, exactly as returned by the API in a previous response. Opaque and encrypted; pass it back unchanged.



ToolUseBlockParamobject{ type: "tool\_use", id, input, 4 more }



ToolResultBlockParamobject{ type: "tool\_result", tool\_use\_id, cache\_control, 3 more }



ServerToolUseBlockParamobject{ type: "server\_tool\_use", id, input, 3 more }



WebSearchToolResultBlockParamobject{ type: "web\_search\_tool\_result", content, tool\_use\_id, 2 more }



WebFetchToolResultBlockParamobject{ type: "web\_fetch\_tool\_result", content, tool\_use\_id, 2 more }



CodeExecutionToolResultBlockParamobject{ type: "code\_execution\_tool\_result", content, tool\_use\_id, cache\_control }

type: "code\_execution\_tool\_result"



content: [CodeExecutionToolResultBlockParamContent](https://platform.claude.com/docs/en/api/http/messages#code_execution_tool_result_block_param_content)

One of the following:



tool\_use\_id: string

pattern^srvtoolu\_\[a-zA-Z0-9\_\]+$



cache\_control: optional [CacheControlEphemeral](https://platform.claude.com/docs/en/api/http/messages#cache_control_ephemeral) { type: "ephemeral", ttl } or null

Create a cache control breakpoint at this content block.

type: "ephemeral"



ttl: optional "5m"or"1h"

The time-to-live for the cache control breakpoint.

This may be one the following values:

- `5m`: 5 minutes
- `1h`: 1 hour

Defaults to `5m`. See [prompt caching pricing](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) for details.

One of the following:

"5m"

"1h"



BashCodeExecutionToolResultBlockParamobject{ type: "bash\_code\_execution\_tool\_result", content, tool\_use\_id, cache\_control }



TextEditorCodeExecutionToolResultBlockParamobject{ type: "text\_editor\_code\_execution\_tool\_result", content, tool\_use\_id, cache\_control }



ToolSearchToolResultBlockParamobject{ type: "tool\_search\_tool\_result", content, tool\_use\_id, cache\_control }



ContainerUploadBlockParamobject{ type: "container\_upload", file\_id, cache\_control }

A content block that represents a file to be uploaded to the container
Files uploaded via this block will be available in the container's input directory.

type: "container\_upload"

file\_id: string



cache\_control: optional [CacheControlEphemeral](https://platform.claude.com/docs/en/api/http/messages#cache_control_ephemeral) { type: "ephemeral", ttl } or null

Create a cache control breakpoint at this content block.

type: "ephemeral"



ttl: optional "5m"or"1h"

The time-to-live for the cache control breakpoint.

This may be one the following values:

- `5m`: 5 minutes
- `1h`: 1 hour

Defaults to `5m`. See [prompt caching pricing](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) for details.

One of the following:

"5m"

"1h"



role: "user"or"assistant"or"system"

One of the following:

"user"

"assistant"

"system"



model: [Model](https://platform.claude.com/docs/en/api/http/messages#model)

The model that will complete your prompt.

See [models](https://docs.anthropic.com/en/docs/models-overview) for additional details and options.

One of the following:

"claude-sonnet-5-5"

Efficient model for coding and agents

"claude-fable-5-1"

Frontier intelligence for ambitious tasks across coding, scientific discovery, and enterprise workflows

"claude-opus-5-5"

Powerful intelligence for coding, knowledge work, and long-running agents

"claude-mythos-5-1"

Our most capable model for cybersecurity and biology research, available through trusted access programs

"claude-sonnet-5"

Efficient model for coding and agents

"claude-fable-5"

Next generation of intelligence for the hardest knowledge work and coding problems

"claude-mythos-5"

Most capable model for cybersecurity and biology research

"claude-opus-5"

Powerful intelligence for long-running agents and coding

"claude-opus-4-8"

Powerful intelligence for long-running agents and coding

"claude-opus-4-7"

Powerful intelligence for long-running agents and coding

"claude-opus-4-6"

Powerful intelligence for long-running agents and coding

"claude-sonnet-4-6"

Best combination of speed and intelligence

"claude-haiku-4-5"

Fastest model with near-frontier intelligence

"claude-haiku-4-5-20251001"

Fastest model with near-frontier intelligence

"claude-opus-4-5"

Powerful intelligence for long-running agents and coding

"claude-opus-4-5-20251101"

Powerful intelligence for long-running agents and coding



"claude-mythos-preview"⁠Deprecated

New class of intelligence, strongest in coding and cybersecurity

Will reach end-of-life on June 30, 2026. Please migrate to claude-mythos-5. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.



"claude-sonnet-4-5"⁠Deprecated

High-performance model for agents and coding

Will reach end-of-life on November 30, 2026. Please migrate to claude-sonnet-5-5. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.



"claude-sonnet-4-5-20250929"⁠Deprecated

High-performance model for agents and coding

Will reach end-of-life on November 30, 2026. Please migrate to claude-sonnet-5-5. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.

string



cache\_control: optional [CacheControlEphemeral](https://platform.claude.com/docs/en/api/http/messages#cache_control_ephemeral) { type: "ephemeral", ttl } or null

Top-level cache control automatically applies a cache\_control marker to the last cacheable block in the request.

type: "ephemeral"



ttl: optional "5m"or"1h"

The time-to-live for the cache control breakpoint.

This may be one the following values:

- `5m`: 5 minutes
- `1h`: 1 hour

Defaults to `5m`. See [prompt caching pricing](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) for details.

One of the following:

"5m"

"1h"



container: optional [MessageCreateParamsContainer](https://platform.claude.com/docs/en/api/http/messages#message_create_params_container) or null

Container identifier for reuse across requests.

One of the following:



ContainerParamsobject{ id, skills }

Container parameters with skills to be loaded.

id: optional string or null

Container id



skills: optional array of [SkillParams](https://platform.claude.com/docs/en/api/http/messages#skill_params) { type, skill\_id, version } or null

List of skills to load in the container

maxItems20



type: "anthropic"or"custom"

Type of skill - either 'anthropic' (built-in) or 'custom' (user-defined)

One of the following:

"anthropic"

"custom"



skill\_id: string

Skill ID

minLength1

maxLength64



version: optional string

Skill version or 'latest' for most recent version

minLength1

maxLength64

string



diagnostics: optional [DiagnosticsParam](https://platform.claude.com/docs/en/api/http/messages#diagnostics_param) { previous\_message\_id } or null

Request-level diagnostics. Supply `previous_message_id` to have the response include `diagnostics.cache_miss_reason` explaining any prompt-cache divergence from that prior request.



previous\_message\_id: optional string or null

The `id` (`msg_...`) from this client's previous /v1/messages response. The server compares that request's prompt fingerprint against this one and returns `diagnostics.cache_miss_reason` when the prompt-cache prefix could not be reused. Pass `null` on the first turn to opt in without a prior message to compare.

maxLength256

inference\_geo: optional string or null

Specifies the geographic region for inference processing. If not specified, the workspace's `default_inference_geo` is used.



metadata: optional [Metadata](https://platform.claude.com/docs/en/api/http/messages#metadata) { user\_id }

An object describing metadata about the request.



user\_id: optional string or null

An external identifier for the user who is associated with the request.

This should be a uuid, hash value, or other opaque identifier. Anthropic may use this id to help detect abuse. Do not include any identifying information such as name, email address, or phone number.

maxLength512



output\_config: optional [OutputConfig](https://platform.claude.com/docs/en/api/http/messages#output_config) { effort, format }

Configuration options for the model's output, such as the output format.



effort: optional "low"or"medium"or"high"or2 more or null

How much effort the model should put into its response. Higher effort levels may result in more thorough analysis but take longer.

Valid values are `low`, `medium`, `high`, `xhigh`, or `max`.

One of the following:

"low"

"medium"

"high"

"xhigh"

"max"



format: optional [JSONOutputFormat](https://platform.claude.com/docs/en/api/http/messages#json_output_format) { type: "json\_schema", schema } or null

A schema to specify Claude's output format in responses. See [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

type: "json\_schema"

schema: map\[unknown\]

The JSON schema of the format



service\_tier: optional "auto"or"standard\_only"

Determines whether to use priority capacity (if available) or standard capacity for this request.

Anthropic offers different levels of service for your API requests. See [service-tiers](https://platform.claude.com/docs/en/api/service-tiers) for details.

One of the following:

"auto"

"standard\_only"



stop\_sequences: optional array of string

Custom text sequences that will cause the model to stop generating.

Our models will normally stop when they have naturally completed their turn, which will result in a response `stop_reason` of `"end_turn"`.

If you want the model to stop generating when it encounters custom strings of text, you can use the `stop_sequences` parameter. If the model encounters one of the custom sequences, the response `stop_reason` value will be `"stop_sequence"` and the response `stop_sequence` value will contain the matched stop sequence.



stream: optional boolean

Whether to incrementally stream the response using server-sent events. When `true`, SDKs return a raw event stream.

In the TypeScript, Python and Ruby SDKs, the recommended way to stream is `messages.stream()`. It sets `stream` for you and accumulates the events into the final message. See [Streaming with SDKs](https://platform.claude.com/docs/en/build-with-claude/streaming#streaming-with-sdks) for an example in each language.



system: optional stringorarray of [TextBlockParam](https://platform.claude.com/docs/en/api/http/messages#text_block_param)

System prompt.

A system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role. See our [guide to system prompts](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#give-claude-a-role).

One of the following:

string



array of [TextBlockParam](https://platform.claude.com/docs/en/api/http/messages#text_block_param) { type: "text", text, cache\_control, citations }

type: "text"



text: string

minLength1



cache\_control: optional [CacheControlEphemeral](https://platform.claude.com/docs/en/api/http/messages#cache_control_ephemeral) { type: "ephemeral", ttl } or null

Create a cache control breakpoint at this content block.

type: "ephemeral"



ttl: optional "5m"or"1h"

The time-to-live for the cache control breakpoint.

This may be one the following values:

- `5m`: 5 minutes
- `1h`: 1 hour

Defaults to `5m`. See [prompt caching pricing](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) for details.

One of the following:

"5m"

"1h"



citations: optional array of [TextCitationParam](https://platform.claude.com/docs/en/api/http/messages#text_citation_param) or null

One of the following:



CitationCharLocationParamobject{ type: "char\_location", cited\_text, document\_index, 3 more }

type: "char\_location"

cited\_text: string



document\_index: number

minimum0



document\_title: string or null

minLength1

maxLength500

end\_char\_index: number



start\_char\_index: number

minimum0



CitationPageLocationParamobject{ type: "page\_location", cited\_text, document\_index, 3 more }

type: "page\_location"

cited\_text: string



document\_index: number

minimum0



document\_title: string or null

minLength1

maxLength500

end\_page\_number: number



start\_page\_number: number

minimum1



CitationContentBlockLocationParamobject{ type: "content\_block\_location", cited\_text, document\_index, 3 more }

type: "content\_block\_location"



cited\_text: string

The full text of the cited block range, concatenated.

Always equals the contents of `content[start_block_index:end_block_index]` joined together. The text block is the minimal citable unit; this field is never a substring of a single block. Not counted toward output tokens, and not counted toward input tokens when sent back in subsequent turns.



document\_index: number

minimum0



document\_title: string or null

minLength1

maxLength500



end\_block\_index: number

Exclusive 0-based end index of the cited block range in the source's `content` array.

Always greater than `start_block_index`; a single-block citation has `end_block_index = start_block_index + 1`.



start\_block\_index: number

0-based index of the first cited block in the source's `content` array.

minimum0



CitationWebSearchResultLocationParamobject{ type: "web\_search\_result\_location", cited\_text, encrypted\_index, 2 more }

type: "web\_search\_result\_location"

cited\_text: string

encrypted\_index: string



title: string or null

minLength1

maxLength512



url: string

minLength1



CitationSearchResultLocationParamobject{ type: "search\_result\_location", cited\_text, end\_block\_index, 4 more }

type: "search\_result\_location"



cited\_text: string

The full text of the cited block range, concatenated.

Always equals the contents of `content[start_block_index:end_block_index]` joined together. The text block is the minimal citable unit; this field is never a substring of a single block. Not counted toward output tokens, and not counted toward input tokens when sent back in subsequent turns.



end\_block\_index: number

Exclusive 0-based end index of the cited block range in the source's `content` array.

Always greater than `start_block_index`; a single-block citation has `end_block_index = start_block_index + 1`.



search\_result\_index: number

0-based index of the cited search result among all `search_result` content blocks in the request, in the order they appear across messages and tool results.

Counted separately from `document_index`; server-side web search results are not included in this count.

minimum0

source: string



start\_block\_index: number

0-based index of the first cited block in the source's `content` array.

minimum0

title: string or null



thinking: optional [ThinkingConfigParam](https://platform.claude.com/docs/en/api/http/messages#thinking_config_param)

Configuration for enabling Claude's extended thinking.

When enabled, responses include `thinking` content blocks showing Claude's thinking process before the final answer. Requires a minimum budget of 1,024 tokens and counts towards your `max_tokens` limit.

See [extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) for details.

One of the following:



tool\_choice: optional [ToolChoice](https://platform.claude.com/docs/en/api/http/messages#tool_choice)

How the model should use the provided tools. The model can use a specific tool, any available tool, decide by itself, or not use tools at all.

One of the following:



tools: optional array of [ToolUnion](https://platform.claude.com/docs/en/api/http/messages#tool_union)

Definitions of tools that the model may use.

If you include `tools` in your API request, the model may return `tool_use` content blocks that represent the model's use of those tools. You can then run those tools using the tool input generated by the model and then optionally return results back to the model using `tool_result` content blocks.

There are two types of tools: **client tools** and **server tools**. The behavior described below applies to client tools. For [server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools), see their individual documentation as each has its own behavior (e.g., the [web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)).

Each tool definition includes:

- `name`: Name of the tool.
- `description`: Optional, but strongly-recommended description of the tool.
- `input_schema`: [JSON schema](https://json-schema.org/draft/2020-12) for the tool `input` shape that the model will produce in `tool_use` output content blocks.

For example, if you defined `tools` as:

```
[\
  {\
    "name": "get_stock_price",\
    "description": "Get the current stock price for a given ticker symbol.",\
    "input_schema": {\
      "type": "object",\
      "properties": {\
        "ticker": {\
          "type": "string",\
          "description": "The stock ticker symbol, e.g. AAPL for Apple Inc."\
        }\
      },\
      "required": ["ticker"]\
    }\
  }\
]
```



And then asked the model "What's the S&P 500 at today?", the model might produce `tool_use` content blocks in the response like this:

```
[\
  {\
    "type": "tool_use",\
    "id": "toolu_01D7FLrfh4GYq7yT1ULFeyMV",\
    "name": "get_stock_price",\
    "input": { "ticker": "^GSPC" }\
  }\
]
```



You might then run your `get_stock_price` tool with `{"ticker": "^GSPC"}` as an input, and return the following back to the model in a subsequent `user` message:

```
[\
  {\
    "type": "tool_result",\
    "tool_use_id": "toolu_01D7FLrfh4GYq7yT1ULFeyMV",\
    "content": "259.75 USD"\
  }\
]
```



Tools can be used for workflows that include running client-side tools and functions, or more generally whenever you want the model to produce a particular JSON structure of output.

See our [guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) for more details.

One of the following:



Toolobject{ type, input\_schema, name, 7 more }



ToolBash20250124object{ type: "bash\_20250124", name, allowed\_callers, 4 more }



CodeExecutionTool20250522object{ type: "code\_execution\_20250522", name, allowed\_callers, 3 more }



CodeExecutionTool20250825object{ type: "code\_execution\_20250825", name, allowed\_callers, 3 more }



CodeExecutionTool20260120object{ type: "code\_execution\_20260120", name, allowed\_callers, 3 more }

Code execution tool with REPL state persistence (daemon mode + gVisor checkpoint).



CodeExecutionTool20260521object{ type: "code\_execution\_20260521", name, allowed\_callers, 3 more }

Code execution tool with REPL state persistence.



BrowserToolset20260801object{ type: "browser\_toolset\_20260801", cache\_control, configs }

The browser toolset: a single `tools[]` entry (carrying no
`name`) that declares the browser tool family. The model is served
the family's tool with any members disabled via `configs` removed
from its schema.



MemoryTool20250818object{ type: "memory\_20250818", name, allowed\_callers, 4 more }



ComputerToolset20260801object{ type: "computer\_toolset\_20260801", cache\_control, configs }

The computer toolset: a single `tools[]` entry (carrying no
`name`) that declares the computer tool family. The model is
served the family's tool with any members disabled via `configs`
removed from its schema. Every member is enabled by default, zoom
included. The single-tool options `display_number` and
`enable_zoom` are not fields of a toolset entry — it carries only
`type`, `configs`, and `cache_control`; zoom is controlled
via `configs.zoom.enabled`.



ToolTextEditor20250124object{ type: "text\_editor\_20250124", name, allowed\_callers, 4 more }



ToolTextEditor20250429object{ type: "text\_editor\_20250429", name, allowed\_callers, 4 more }



ToolTextEditor20250728object{ type: "text\_editor\_20250728", name, allowed\_callers, 5 more }



WebSearchTool20250305object{ type: "web\_search\_20250305", name, allowed\_callers, 7 more }



WebFetchTool20250910object{ type: "web\_fetch\_20250910", name, allowed\_callers, 9 more }



WebSearchTool20260209object{ type: "web\_search\_20260209", name, allowed\_callers, 7 more }



WebFetchTool20260209object{ type: "web\_fetch\_20260209", name, allowed\_callers, 9 more }



WebFetchTool20260309object{ type: "web\_fetch\_20260309", name, allowed\_callers, 10 more }

Web fetch tool with use\_cache parameter for bypassing cached content.



WebSearchTool20260318object{ type: "web\_search\_20260318", name, allowed\_callers, 8 more }



WebFetchTool20260318object{ type: "web\_fetch\_20260318", name, allowed\_callers, 11 more }



ToolSearchToolBm25\_20251119object{ type, name, allowed\_callers, 3 more }



ToolSearchToolRegex20251119object{ type, name, allowed\_callers, 3 more }



temperature: optional number⁠Deprecated

Amount of randomness injected into the response.

Deprecated. Models released after Claude Opus 4.6 do not support setting temperature. A value of 1.0 will be accepted for backwards compatibility, all other values will be rejected with a 400 error.

Defaults to `1.0`. Ranges from `0.0` to `1.0`. Use `temperature` closer to `0.0` for analytical / multiple choice, and closer to `1.0` for creative and generative tasks.

Note that even with `temperature` of `0.0`, the results will not be fully deterministic.

minimum0

maximum1



top\_k: optional number⁠Deprecated

Only sample from the top K options for each subsequent token.

Deprecated. Models released after Claude Opus 4.6 do not accept top\_k; any value will be rejected with a 400 error.

Used to remove "long tail" low probability responses. [Learn more technical details here](https://towardsdatascience.com/how-to-sample-from-language-models-682bceb97277).

Recommended for advanced use cases only.

minimum0



top\_p: optional number⁠Deprecated

Use nucleus sampling.

Deprecated. Models released after Claude Opus 4.6 do not support setting top\_p. A value >= 0.99 will be accepted for backwards compatibility, all other values will be rejected with a 400 error.

In nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by `top_p`.

Recommended for advanced use cases only.

minimum0

maximum1

##### Returns



Messageobject{ type: "message", id, container, 8 more }



RawMessageStreamEvent = [RawMessageStartEvent](https://platform.claude.com/docs/en/api/http/messages#raw_message_start_event)or[RawMessageDeltaEvent](https://platform.claude.com/docs/en/api/http/messages#raw_message_delta_event)or[RawMessageStopEvent](https://platform.claude.com/docs/en/api/http/messages#raw_message_stop_event)or3 more

One of the following:

Create a Message

cURL

```
curl https://api.anthropic.com/v1/messages \
    -H 'Content-Type: application/json' \
    -H 'anthropic-version: 2023-06-01' \
    -H "X-Api-Key: $ANTHROPIC_API_KEY" \
    --max-time 600 \
    -d '{
          "max_tokens": 1024,
          "messages": [\
            {\
              "content": "Hello, world",\
              "role": "user"\
            }\
          ],
          "model": "claude-opus-5",
          "stream": false,
          "system": [\
            {\
              "text": "Today'\''s date is 2024-06-01.",\
              "type": "text"\
            }\
          ],
          "temperature": 1,
          "thinking": {
            "type": "adaptive"
          },
          "tools": [\
            {\
              "input_schema": {\
                "type": "object",\
                "properties": {\
                  "location": "bar",\
                  "unit": "bar"\
                },\
                "required": [\
                  "location"\
                ]\
              },\
              "name": "name"\
            }\
          ],
          "top_k": 5,
          "top_p": 0.7
        }'
```

Response 200



```
{
  "id": "msg_013Zva2CMHLNnXjNJJKqJ2EF",
  "container": {
    "id": "container_011CpZohnwH4vuy7gazohgSP",
    "expires_at": "2019-12-27T18:11:19.117Z",
    "skills": [\
      {\
        "skill_id": "pdf",\
        "type": "anthropic",\
        "version": "latest"\
      }\
    ]
  },
  "content": [\
    {\
      "citations": [\
        {\
          "cited_text": "The grass is green. The sky is blue.",\
          "document_index": 0,\
          "document_title": "My Document",\
          "end_char_index": 0,\
          "file_id": "file_011CNha8iCJcU1wXNR6q4V8w",\
          "start_char_index": 0,\
          "type": "char_location"\
        }\
      ],\
      "text": "Hi! My name is Claude.",\
      "type": "text"\
    }\
  ],
  "diagnostics": {
    "cache_miss_reason": {
      "cache_missed_input_tokens": 0,
      "type": "model_changed"
    }
  },
  "model": "claude-opus-5",
  "role": "assistant",
  "stop_details": {
    "category": "cyber",
    "explanation": "This request was declined because it conflicts with Anthropic's Usage Policy.",
    "type": "refusal"
  },
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "type": "message",
  "usage": {
    "cache_creation": {
      "ephemeral_1h_input_tokens": 0,
      "ephemeral_5m_input_tokens": 0
    },
    "cache_creation_input_tokens": 2051,
    "cache_read_input_tokens": 2051,
    "inference_geo": "global",
    "input_tokens": 2095,
    "output_tokens": 503,
    "output_tokens_details": {
      "thinking_tokens": 0
    },
    "server_tool_use": {
      "web_fetch_requests": 2,
      "web_search_requests": 0
    },
    "service_tier": "standard"
  }
}
```

##### Returns Examples

Response 200



```
{
  "id": "msg_013Zva2CMHLNnXjNJJKqJ2EF",
  "container": {
    "id": "container_011CpZohnwH4vuy7gazohgSP",
    "expires_at": "2019-12-27T18:11:19.117Z",
    "skills": [\
      {\
        "skill_id": "pdf",\
        "type": "anthropic",\
        "version": "latest"\
      }\
    ]
  },
  "content": [\
    {\
      "citations": [\
        {\
          "cited_text": "The grass is green. The sky is blue.",\
          "document_index": 0,\
          "document_title": "My Document",\
          "end_char_index": 0,\
          "file_id": "file_011CNha8iCJcU1wXNR6q4V8w",\
          "start_char_index": 0,\
          "type": "char_location"\
        }\
      ],\
      "text": "Hi! My name is Claude.",\
      "type": "text"\
    }\
  ],
  "diagnostics": {
    "cache_miss_reason": {
      "cache_missed_input_tokens": 0,
      "type": "model_changed"
    }
  },
  "model": "claude-opus-5",
  "role": "assistant",
  "stop_details": {
    "category": "cyber",
    "explanation": "This request was declined because it conflicts with Anthropic's Usage Policy.",
    "type": "refusal"
  },
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "type": "message",
  "usage": {
    "cache_creation": {
      "ephemeral_1h_input_tokens": 0,
      "ephemeral_5m_input_tokens": 0
    },
    "cache_creation_input_tokens": 2051,
    "cache_read_input_tokens": 2051,
    "inference_geo": "global",
    "input_tokens": 2095,
    "output_tokens": 503,
    "output_tokens_details": {
      "thinking_tokens": 0
    },
    "server_tool_use": {
      "web_fetch_requests": 2,
      "web_search_requests": 0
    },
    "service_tier": "standard"
  }
}
```

Ask Docs
