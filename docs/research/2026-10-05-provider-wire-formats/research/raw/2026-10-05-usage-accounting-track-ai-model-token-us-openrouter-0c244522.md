---
url: https://openrouter.ai/docs/use-cases/usage-accounting
retrieved: 2026-10-05
command: firecrawl scrape https://openrouter.ai/docs/use-cases/usage-accounting --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Usage Accounting - Track AI Model Token Usage
---
> ## Documentation Index
>
> Fetch the complete documentation index at: [/docs/llms.txt](https://openrouter.ai/docs/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://openrouter.ai/docs/cookbook/administration/usage-accounting#content-area)

The OpenRouter API provides built-in **Usage Accounting** that allows you to track AI model usage without making additional API calls. This feature provides detailed information about token counts, costs, and caching status directly in your API responses.

## [​](https://openrouter.ai/docs/cookbook/administration/usage-accounting\#usage-information)  Usage Information

OpenRouter automatically returns detailed usage information with every response, including:

1. Prompt and completion token counts using the model’s native tokenizer
2. Cost in credits
3. Reasoning token counts (if applicable)
4. Cached token counts (if available)

This information is included in the last SSE message for streaming responses, or in the complete response for non-streaming requests. No additional parameters are required.

**Deprecated Parameters**The `usage: { include: true }` and `stream_options: { include_usage: true }` parameters are deprecated and have no effect. Full usage details are now always included automatically in every response.

## [​](https://openrouter.ai/docs/cookbook/administration/usage-accounting\#response-format)  Response Format

Every response includes a `usage` object with detailed token information:

```
{
  "object": "chat.completion.chunk",
  "usage": {
    "completion_tokens": 2,
    "completion_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.95,
    "cost_details": {
      "upstream_inference_cost": 19
    },
    "prompt_tokens": 194,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 100,
      "audio_tokens": 0
    },
    "total_tokens": 196
  }
}
```

`cached_tokens` is the number of tokens that were _read_ from the cache. `cache_write_tokens` is the number of tokens that were _written_ to the cache (only returned for models with explicit caching and cache write pricing).

## [​](https://openrouter.ai/docs/cookbook/administration/usage-accounting\#cost-breakdown)  Cost Breakdown

The usage response includes detailed cost information:

- `cost`: The total amount charged to your account
- `cost_details.upstream_inference_cost`: The actual cost charged by the upstream AI provider

## [​](https://openrouter.ai/docs/cookbook/administration/usage-accounting\#benefits)  Benefits

1. **Efficiency**: Get usage information without making separate API calls
2. **Accuracy**: Token counts are calculated using the model’s native tokenizer
3. **Transparency**: Track costs and cached token usage in real-time
4. **Detailed Breakdown**: Separate counts for prompt, completion, reasoning, and cached tokens

## [​](https://openrouter.ai/docs/cookbook/administration/usage-accounting\#best-practices)  Best Practices

1. Use the usage data to monitor token consumption and costs
2. Consider tracking usage in development to optimize token usage before production
3. Use the cached token information to optimize your application’s performance

## [​](https://openrouter.ai/docs/cookbook/administration/usage-accounting\#alternative-getting-usage-via-generation-id)  Alternative: Getting Usage via Generation ID

You can also retrieve usage information asynchronously by using the generation ID returned from your API calls. This is particularly useful when you want to fetch usage statistics after the completion has finished or when you need to audit historical usage.To use this method:

1. Make your chat completion request as normal
2. Note the `id` field in the response
3. Use that ID to fetch usage information via the `/generation` endpoint

For more details on this approach, see the [Get a Generation](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation) documentation.

When obtaining usage information via generation ID, the `upstream_inference_cost` field is only available for BYOK (Bring Your Own Key) requests. For all other requests it will be 0 or null.

## [​](https://openrouter.ai/docs/cookbook/administration/usage-accounting\#examples)  Examples

### [​](https://openrouter.ai/docs/cookbook/administration/usage-accounting\#basic-usage-with-token-tracking)  Basic Usage with Token Tracking

TypeScript SDK

Python (OpenAI SDK)

TypeScript (OpenAI SDK)

```
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({
  apiKey: '<OPENROUTER_API_KEY>',
});

const response = await openRouter.chat.send({
  chatRequest: {
    model: 'anthropic/claude-3-opus',
    messages: [\
      {\
        role: 'user',\
        content: 'What is the capital of France?',\
      },\
    ],
  },
});

if (response instanceof ReadableStream) {
  throw new Error('Expected a non-streaming response');
}

console.log('Response:', response.choices[0].message.content);
// Usage is always included automatically
console.log('Usage Stats:', response.usage);
```

```
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="<OPENROUTER_API_KEY>",
)

response = client.chat.completions.create(
    model="anthropic/claude-3-opus",
    messages=[\
        {"role": "user", "content": "What is the capital of France?"}\
    ]
)

print("Response:", response.choices[0].message.content)
# Usage is always included automatically
print("Usage Stats:", response.usage)
```

```
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '<OPENROUTER_API_KEY>',
});

async function getResponseWithUsage() {
  const response = await openai.chat.completions.create({
    model: 'anthropic/claude-3-opus',
    messages: [\
      {\
        role: 'user',\
        content: 'What is the capital of France?',\
      },\
    ],
  });

  console.log('Response:', response.choices[0].message.content);
  // Usage is always included automatically
  console.log('Usage Stats:', response.usage);
}

getResponseWithUsage();
```

### [​](https://openrouter.ai/docs/cookbook/administration/usage-accounting\#streaming-with-usage-information)  Streaming with Usage Information

This example shows how to handle usage information in streaming mode:

Python

TypeScript

```
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="<OPENROUTER_API_KEY>",
)

def chat_completion_streaming(messages):
    response = client.chat.completions.create(
        model="anthropic/claude-3-opus",
        messages=messages,
        stream=True
    )
    return response

# Usage is always included in the final chunk when streaming
for chunk in chat_completion_streaming([\
    {"role": "user", "content": "Write a haiku about Paris."}\
]):
    if hasattr(chunk, 'usage') and chunk.usage:
        if hasattr(chunk.usage, 'total_tokens'):
            print(f"\nUsage Statistics:")
            print(f"Total Tokens: {chunk.usage.total_tokens}")
            print(f"Prompt Tokens: {chunk.usage.prompt_tokens}")
            print(f"Completion Tokens: {chunk.usage.completion_tokens}")
            print(f"Cost: {chunk.usage.cost} credits")
    elif chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

See all 28 lines

```
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '<OPENROUTER_API_KEY>',
});

async function chatCompletionStreaming(messages) {
  const response = await openai.chat.completions.create({
    model: 'anthropic/claude-3-opus',
    messages,
    stream: true,
  });

  return response;
}

// Usage is always included in the final chunk when streaming
(async () => {
  for await (const chunk of chatCompletionStreaming([\
    { role: 'user', content: 'Write a haiku about Paris.' },\
  ])) {
    if (chunk.usage) {
      console.log('\nUsage Statistics:');
      console.log(`Total Tokens: ${chunk.usage.total_tokens}`);
      console.log(`Prompt Tokens: ${chunk.usage.prompt_tokens}`);
      console.log(`Completion Tokens: ${chunk.usage.completion_tokens}`);
      console.log(`Cost: ${chunk.usage.cost} credits`);
    } else if (chunk.choices[0]?.delta?.content) {
      process.stdout.write(chunk.choices[0].delta.content);
    }
  }
})();
```

Assistant

Responses are generated using AI and may contain mistakes.
