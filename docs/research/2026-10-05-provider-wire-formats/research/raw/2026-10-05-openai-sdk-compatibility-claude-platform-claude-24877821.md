---
url: https://platform.claude.com/docs/en/api/openai-sdk
retrieved: 2026-10-05
command: firecrawl scrape https://platform.claude.com/docs/en/api/openai-sdk --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: OpenAI SDK compatibility - Claude Platform Docs
---
Copy page



## Getting started with the OpenAI SDK

To use the OpenAI SDK compatibility feature, you'll need to:

1. Use an official OpenAI SDK
2. Change the following
   - Update your base URL to point to the Claude API
   - Replace your API key with a [Claude API key](https://platform.claude.com/settings/keys)
   - If your key is a [personal or service account key](https://platform.claude.com/docs/en/manage-claude/authentication#key-types) with access to multiple workspaces, also send the `anthropic-workspace-id` header on every request (for example, `default_headers` in the Python SDK or `defaultHeaders` in TypeScript); see [Select a workspace](https://platform.claude.com/docs/en/manage-claude/authentication#select-a-workspace)
   - Update your model name to use a [Claude model](https://platform.claude.com/docs/en/models/overview)
3. Review the following sections for what features are supported

### Quick start example

PythonTypeScriptC#GoJavaPHPRuby



```
import os

from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("ANTHROPIC_API_KEY"),  # Your Claude API key
    base_url="https://api.anthropic.com/v1/",  # the Claude API endpoint
)

response = client.chat.completions.create(
    model="claude-opus-5-5",  # Claude model name
    messages=[\
        {"role": "system", "content": "You are a helpful assistant."},\
        {"role": "user", "content": "Who are you?"},\
    ],
)

print(response.choices[0].message.content)
```

## Important OpenAI compatibility limitations

### API behavior

Here are the most substantial differences from using OpenAI:

- The `strict` parameter for function calling is ignored, which means the tool use JSON is not guaranteed to follow the supplied schema. For guaranteed schema conformance, use the native [Claude API with Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
- Audio input is not supported; it will be ignored and stripped from input
- Prompt caching is not supported, but it is supported in the [Anthropic SDKs](https://platform.claude.com/docs/en/cli-sdks-libraries/overview)
- System/developer messages are hoisted and concatenated to the beginning of the conversation, as Anthropic only supports a single initial system message.

Most unsupported fields are silently ignored rather than producing errors. These are all documented in the following sections.

### Output quality considerations

If you’ve done lots of tweaking to your prompt, it’s likely to be well-tuned to OpenAI specifically. Consider reworking it for Claude using the [prompting best practices guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices).

### System / developer message hoisting

Most of the inputs to the OpenAI SDK clearly map directly to Anthropic’s API parameters, but one distinct difference is the handling of system / developer prompts. These two prompts can be put throughout a chat conversation via OpenAI. Since Anthropic only supports an initial system message, the API takes all system/developer messages and concatenates them together with a single newline (`\n`) in between them. This full string is then supplied as a single system message at the start of the messages.

### Thinking support

You can enable [thinking](https://platform.claude.com/docs/en/build-with-claude/thinking) by adding the `thinking` parameter. On current models thinking is adaptive, with Claude deciding when and how deeply to think, and on Claude 5 models it is on by default; manually configured extended thinking is a legacy mode. Although thinking improves Claude's reasoning for complex tasks, the OpenAI SDK doesn't return Claude's thinking. For full thinking features, including [summarized thinking](https://platform.claude.com/docs/en/build-with-claude/thinking#summarized-thinking), use the native Claude API.

PythonTypeScriptC#GoJavaPHPRuby



```
response = client.chat.completions.create(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": "Who are you?"}],
    extra_body={"thinking": {"type": "enabled", "budget_tokens": 2000}},
)
```

## Rate limits

Rate limits follow Anthropic's [standard limits](https://platform.claude.com/docs/en/api/rate-limits) for the `/v1/messages` endpoint.

## Detailed OpenAI compatible API support

### Request fields

#### Simple fields

| Field | Support status |
| --- | --- |
| `model` | Use Claude model names |
| `max_tokens` | Fully supported |
| `max_completion_tokens` | Fully supported |
| `stream` | Fully supported |
| `stream_options` | Fully supported |
| `top_p` | Fully supported |
| `parallel_tool_calls` | Fully supported |
| `stop` | All non-whitespace stop sequences work |
| `temperature` | Between 0 and 1 (inclusive). Values greater than 1 are capped at 1. |
| `n` | Must be exactly 1 |
| `logprobs` | Ignored |
| `metadata` | Ignored |
| `response_format` | Ignored. For JSON output, use [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) with the native Claude API |
| `prediction` | Ignored |
| `presence_penalty` | Ignored |
| `frequency_penalty` | Ignored |
| `seed` | Ignored |
| `service_tier` | Ignored |
| `audio` | Ignored |
| `logit_bias` | Ignored |
| `store` | Ignored |
| `user` | Ignored |
| `modalities` | Ignored |
| `top_logprobs` | Ignored |
| `reasoning_effort` | Ignored |

#### `tools` / `functions` fields

### Show fields

ToolsFunctions

`tools[n].function` fields

| Field | Support status |
| --- | --- |
| `name` | Fully supported |
| `description` | Fully supported |
| `parameters` | Fully supported |
| `strict` | Ignored. Use [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) with native Claude API for strict schema validation |

#### `messages` array fields

### Show fields

Developer roleSystem roleUser roleAssistant roleTool roleFunction role

Fields for `messages[n].role == "developer"`

| Field | Support status |
| --- | --- |
| `content` | Fully supported, but hoisted |
| `name` | Ignored |

### Response fields

| Field | Support status |
| --- | --- |
| `id` | Fully supported |
| `choices[]` | Will always have a length of 1 |
| `choices[].finish_reason` | Fully supported |
| `choices[].index` | Fully supported |
| `choices[].message.role` | Fully supported |
| `choices[].message.content` | Fully supported |
| `choices[].message.tool_calls` | Fully supported |
| `object` | Fully supported |
| `created` | Fully supported |
| `model` | Fully supported |
| `finish_reason` | Fully supported |
| `content` | Fully supported |
| `usage.completion_tokens` | Fully supported |
| `usage.prompt_tokens` | Fully supported |
| `usage.total_tokens` | Fully supported |
| `usage.completion_tokens_details` | Always empty |
| `usage.prompt_tokens_details` | Always empty |
| `choices[].message.refusal` | Always empty |
| `choices[].message.audio` | Always empty |
| `logprobs` | Always empty |
| `service_tier` | Always empty |
| `system_fingerprint` | Always empty |

### Error message compatibility

The compatibility layer maintains consistent error formats with the OpenAI API. However, the detailed error messages will not be equivalent. Only use the error messages for logging and debugging.

### Header compatibility

While the OpenAI SDK automatically manages headers, here is the complete list of headers supported by the Claude API for developers who need to work with them directly.

| Header | Support Status |
| --- | --- |
| `x-ratelimit-limit-requests` | Fully supported |
| `x-ratelimit-limit-tokens` | Fully supported |
| `x-ratelimit-remaining-requests` | Fully supported |
| `x-ratelimit-remaining-tokens` | Fully supported |
| `x-ratelimit-reset-requests` | Fully supported |
| `x-ratelimit-reset-tokens` | Fully supported |
| `retry-after` | Fully supported |
| `request-id` | Fully supported |
| `openai-version` | Always `2020-10-01` |
| `authorization` | Fully supported |
| `openai-processing-ms` | Always empty |

Was this page helpful?



OpenAI SDK compatibility/

Header compatibility

Ask Docs
