---
url: https://developers.openai.com/api/docs/guides/streaming-responses
retrieved: 2026-10-05
command: firecrawl scrape https://developers.openai.com/api/docs/guides/streaming-responses --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Streaming API responses | OpenAI API
---
For the complete documentation index, see [llms.txt](https://developers.openai.com/llms.txt). Markdown versions of documentation pages are available by appending
`.md` to the page URL.

## Search the API docs

Search docs

### Suggested

response\_formatreasoning\_effortstreamingtools

Primary navigation

Search docs

### Suggested

response\_formatreasoning\_effortstreamingtools

Overview  Models  Agents  Tools  Audio & voice  Production  API reference

OverviewModelsAgentsToolsAudio & voiceProductionAPI referenceDocsOverview

- [Home](https://developers.openai.com/api/docs)

### Get started

- [Quickstart](https://developers.openai.com/api/docs/quickstart)
- [Using GPT-6](https://developers.openai.com/api/docs/guides/latest-model)
- [Key concepts](https://developers.openai.com/api/docs/concepts)

### Core concepts

- [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [Background mode](https://developers.openai.com/api/docs/guides/background)
- [Streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [WebSocket mode](https://developers.openai.com/api/docs/guides/websocket-mode)
- [Mid-turn steering](https://developers.openai.com/api/docs/guides/steering)
- [Multi-agent](https://developers.openai.com/api/docs/guides/responses-multi-agent)
- [Webhooks](https://developers.openai.com/api/docs/guides/webhooks)
- [File inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [Compaction](https://developers.openai.com/api/docs/guides/compaction)
- [Counting tokens](https://developers.openai.com/api/docs/guides/token-counting)

### SDKs and CLI

- [OpenAI SDK](https://developers.openai.com/api/docs/libraries)
- [OpenAI CLI](https://developers.openai.com/api/docs/libraries/openai-cli)

### Resources

- [Changelog](https://developers.openai.com/api/docs/changelog)
- [Deprecations](https://developers.openai.com/api/docs/deprecations)
- [Supported countries](https://developers.openai.com/api/docs/supported-countries)
- [OpenAI Crawlers](https://developers.openai.com/api/docs/bots)
- [Terms and policies](https://openai.com/policies)

### Legacy APIs

- Agent Builder

  - [Overview](https://developers.openai.com/api/docs/guides/agent-builder)
  - [Migration guide](https://developers.openai.com/api/docs/guides/agent-builder/migrate-from-agent-builder)
  - [Node reference](https://developers.openai.com/api/docs/guides/node-reference)
  - [Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety)

- Evals

  - [Getting started](https://developers.openai.com/api/docs/guides/evaluation-getting-started)
  - [Working with evals](https://developers.openai.com/api/docs/guides/evals)
  - [Prompt optimizer](https://developers.openai.com/api/docs/guides/prompt-optimizer)
  - [External models](https://developers.openai.com/api/docs/guides/external-models)
  - [Best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
  - [Graders](https://developers.openai.com/api/docs/guides/graders)

- Fine-tuning

  - [Optimization cycle](https://developers.openai.com/api/docs/guides/model-optimization)
  - [Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)
  - [Vision fine-tuning](https://developers.openai.com/api/docs/guides/vision-fine-tuning)
  - [Direct preference optimization](https://developers.openai.com/api/docs/guides/direct-preference-optimization)
  - [Reinforcement fine-tuning](https://developers.openai.com/api/docs/guides/reinforcement-fine-tuning)
  - [RFT use cases](https://developers.openai.com/api/docs/guides/rft-use-cases)
  - [Best practices](https://developers.openai.com/api/docs/guides/fine-tuning-best-practices)

- Assistants API

  - [Migration guide](https://developers.openai.com/api/docs/assistants/migration)

[API Dashboard](https://platform.openai.com/login)

[Try ChatGPT](https://chatgpt.com/)

Responses

Copy Page

By default, when you make a request to the OpenAI API, we generate the model’s entire output before sending it back in a single HTTP response. When generating long outputs, waiting for a response can take time. Streaming responses lets you start printing or processing the beginning of the model’s output while it continues generating the full response.

This guide focuses on HTTP streaming (`stream=true`) over server-sent events (SSE). For persistent WebSocket transport with incremental inputs via `previous_response_id`, see [the Responses API WebSocket mode](https://developers.openai.com/api/docs/guides/websocket-mode).

## Enable streaming

To start streaming responses, set `stream=True` in your request to the Responses endpoint:

Python

```
import { OpenAI } from "openai";
const client = new OpenAI();

const stream = await client.responses.create({
  model: "gpt-6-astra",
  input: [\
    {\
      role: "user",\
      content: "Say 'double bubble bath' ten times fast.",\
    },\
  ],
  stream: true,
});

for await (const event of stream) {
  console.log(event);
}
```

```
from openai import OpenAI

client = OpenAI()

stream = client.responses.create(
    model="gpt-6-astra",
    input=[\
        {\
            "role": "user",\
            "content": "Say 'double bubble bath' ten times fast.",\
        },\
    ],
    stream=True,
)

for event in stream:
    print(event)
```

```
package main

import (
	"context"
	"fmt"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/responses"
)

func main() {
	client := openai.NewClient()
	stream := client.Responses.NewStreaming(context.Background(), responses.ResponseNewParams{
		Model: "gpt-6-astra",
		Input: responses.ResponseNewParamsInputUnion{OfString: openai.String("Say 'double bubble bath' ten times fast.")},
	})
	for stream.Next() {
		fmt.Println(stream.Current().Type)
	}
	if err := stream.Err(); err != nil {
		panic(err)
	}
}
```

```
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.core.http.StreamResponse;
import com.openai.models.responses.ResponseCreateParams;
import com.openai.models.responses.ResponseStreamEvent;

ResponseCreateParams params =
    ResponseCreateParams.builder()
        .model("gpt-6-astra")
        .input("Say 'double bubble bath' ten times fast.")
        .build();

try (StreamResponse<ResponseStreamEvent> stream = client.responses().createStreaming(params)) {
  stream.stream().forEach(System.out::println);
}
```

```
using OpenAI.Responses;
#pragma warning disable OPENAI001

string key = Environment.GetEnvironmentVariable("OPENAI_API_KEY")!;
ResponsesClient client = new(key);

var responses = client.CreateResponseStreamingAsync(
    "gpt-6-astra",
    "Say 'double bubble bath' ten times fast."
);

await foreach (StreamingResponseUpdate response in responses)
{
    if (response is StreamingResponseOutputTextDeltaUpdate delta)
    {
        Console.Write(delta.Delta);
    }
}
```

```
require "openai"

openai = OpenAI::Client.new

stream = openai.responses.stream(
  model: "gpt-6-astra",
  input: [\
    {\
      role: "user",\
      content: "Say 'double bubble bath' ten times fast."\
    }\
  ]
)

stream.each do |event|
  puts(event)
end
```

The Responses API uses semantic events for streaming. Each event is typed with a predefined schema, so you can listen for events you care about.

For a full list of event types, see the [API reference for streaming](https://developers.openai.com/api/docs/api-reference/responses-streaming). Here are a few examples:

JavaScript

```
for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  } else if (event.type === "response.completed") {
    console.log("\nResponse completed.");
  } else if (event.type === "error") {
    console.error(event.message);
  }
}
```

```
StreamingEvent = (
    ResponseCreatedEvent
    | ResponseInProgressEvent
    | ResponseFailedEvent
    | ResponseCompletedEvent
    | ResponseOutputItemAdded
    | ResponseOutputItemDone
    | ResponseContentPartAdded
    | ResponseContentPartDone
    | ResponseOutputTextDelta
    | ResponseOutputTextAnnotationAdded
    | ResponseTextDone
    | ResponseRefusalDelta
    | ResponseRefusalDone
    | ResponseFunctionCallArgumentsDelta
    | ResponseFunctionCallArgumentsDone
    | ResponseFileSearchCallInProgress
    | ResponseFileSearchCallSearching
    | ResponseFileSearchCallCompleted
    | ResponseCodeInterpreterInProgress
    | ResponseCodeInterpreterCallCodeDelta
    | ResponseCodeInterpreterCallCodeDone
    | ResponseCodeInterpreterCallInterpreting
    | ResponseCodeInterpreterCallCompleted
    | Error
)
```

```
type StreamingEvent = responses.ResponseStreamEventUnion
```

```
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.core.http.StreamResponse;
import com.openai.models.responses.ResponseCreateParams;
import com.openai.models.responses.ResponseStreamEvent;

ResponseCreateParams params =
    ResponseCreateParams.builder().model("gpt-5.5").input("Say hello.").build();

try (StreamResponse<ResponseStreamEvent> stream = client.responses().createStreaming(params)) {
  stream.stream().forEach(System.out::println);
}
```

```
require "openai"

client = OpenAI::Client.new
stream = client.responses.stream(model: "gpt-5.5", input: "Say hello.")
stream.each { |event| puts(event) }
```

Streaming Chat Completions is fairly straightforward. However, we recommend using the [Responses API for streaming](https://developers.openai.com/api/docs/guides/streaming-responses?api-mode=responses), as we designed it with streaming in mind. The Responses API uses semantic events for streaming and is type-safe.

### Stream a chat completion

To stream completions, set `stream=True` when calling the Chat Completions or legacy Completions endpoints. This returns an object that streams back the response as data-only server-sent events.

The response is sent back incrementally in chunks with an event stream. You can iterate over the event stream with a `for` loop, like this:

Python

```
import OpenAI from "openai";
const openai = new OpenAI();

const stream = await openai.chat.completions.create({
  model: "gpt-6-astra",
  messages: [\
    {\
      role: "user",\
      content: "Say 'double bubble bath' ten times fast.",\
    },\
  ],
  stream: true,
});

for await (const chunk of stream) {
  console.log(chunk);
  console.log(chunk.choices[0].delta);
  console.log("****************");
}
```

```
from openai import OpenAI

client = OpenAI()

stream = client.chat.completions.create(
    model="gpt-6-astra",
    messages=[\
        {\
            "role": "user",\
            "content": "Say 'double bubble bath' ten times fast.",\
        },\
    ],
    stream=True,
)

for chunk in stream:
    print(chunk)
    print(chunk.choices[0].delta)
    print("****************")
```

```
package main

import (
	"context"
	"fmt"

	"github.com/openai/openai-go/v3"
)

func main() {
	client := openai.NewClient()
	stream := client.Chat.Completions.NewStreaming(context.Background(), openai.ChatCompletionNewParams{
		Model: "gpt-6-astra",
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage("Say 'double bubble bath' ten times fast."),
		},
	})
	for stream.Next() {
		fmt.Println(stream.Current())
	}
	if err := stream.Err(); err != nil {
		panic(err)
	}
}
```

```
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.core.http.StreamResponse;
import com.openai.models.chat.completions.ChatCompletionChunk;
import com.openai.models.chat.completions.ChatCompletionCreateParams;

ChatCompletionCreateParams params =
    ChatCompletionCreateParams.builder()
        .model("gpt-6-astra")
        .addUserMessage("Say hello.")
        .build();

try (StreamResponse<ChatCompletionChunk> stream =
    client.chat().completions().createStreaming(params)) {
  stream.stream().forEach(System.out::println);
}
```

```
using System.ClientModel.Primitives;
using OpenAI.Chat;

string key = Environment.GetEnvironmentVariable("OPENAI_API_KEY")!;
string model = "gpt-6-astra";
ChatClient client = new(model, key);

await foreach (
    StreamingChatCompletionUpdate update in client.CompleteChatStreamingAsync(
        new UserChatMessage("Say double bubble bath ten times fast.")
    )
)
{
    Console.WriteLine(ModelReaderWriter.Write(update));
}
```

```
require "openai"

client = OpenAI::Client.new
stream = client.chat.completions.stream(
  model: "gpt-6-astra", messages: [\
    {\
      role: :user,\
      content: "Say hello."\
    }\
  ]
)
stream.each { |event| puts(event) }
```

## Read the responses

If you’re using our SDK, every event is a typed instance. You can also identity individual events using the `type` property of the event.

Some key lifecycle events are emitted only once, while others are emitted multiple times as the response is generated. Common events to listen for when streaming text are:

```
- `response.created`
- `response.output_text.delta`
- `response.completed`
- `error`


```

For a full list of events you can listen for, see the [API reference for streaming](https://developers.openai.com/api/docs/api-reference/responses-streaming).

When you stream a chat completion, the responses has a `delta` field rather than a `message` field. The `delta` field can hold a role token, content token, or nothing.

```
{ role: 'assistant', content: '', refusal: null }
****************
{ content: 'Why' }
****************
{ content: " don't" }
****************
{ content: ' scientists' }
****************
{ content: ' trust' }
****************
{ content: ' atoms' }
****************
{ content: '?\n\n' }
****************
{ content: 'Because' }
****************
{ content: ' they' }
****************
{ content: ' make' }
****************
{ content: ' up' }
****************
{ content: ' everything' }
****************
{ content: '!' }
****************
{}
****************


```

To stream only the text response of your chat completion, your code would like this:

Python

```
import OpenAI from "openai";
const client = new OpenAI();

const stream = await client.chat.completions.create({
  model: "gpt-6-astra",
  messages: [\
    {\
      role: "user",\
      content: "Say 'double bubble bath' ten times fast.",\
    },\
  ],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

```
from openai import OpenAI

client = OpenAI()

stream = client.chat.completions.create(
    model="gpt-6-astra",
    messages=[\
        {\
            "role": "user",\
            "content": "Say 'double bubble bath' ten times fast.",\
        },\
    ],
    stream=True,
)

for chunk in stream:
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="")
```

```
package main

import (
	"context"
	"fmt"

	"github.com/openai/openai-go/v3"
)

func main() {
	client := openai.NewClient()
	stream := client.Chat.Completions.NewStreaming(context.Background(), openai.ChatCompletionNewParams{
		Model: "gpt-6-astra",
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage("Say 'double bubble bath' ten times fast."),
		},
	})
	for stream.Next() {
		if len(stream.Current().Choices) > 0 {
			fmt.Print(stream.Current().Choices[0].Delta.Content)
		}
	}
	if err := stream.Err(); err != nil {
		panic(err)
	}
}
```

```
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.core.http.StreamResponse;
import com.openai.models.chat.completions.ChatCompletionChunk;
import com.openai.models.chat.completions.ChatCompletionCreateParams;

ChatCompletionCreateParams params =
    ChatCompletionCreateParams.builder()
        .model("gpt-6-astra")
        .addUserMessage("Say 'double bubble bath' ten times fast.")
        .build();

try (StreamResponse<ChatCompletionChunk> stream =
    client.chat().completions().createStreaming(params)) {
  stream.stream()
      .flatMap(chunk -> chunk.choices().stream())
      .flatMap(choice -> choice.delta().content().stream())
      .forEach(System.out::print);
}
```

```
using OpenAI.Chat;

string key = Environment.GetEnvironmentVariable("OPENAI_API_KEY")!;
string model = "gpt-6-astra";
ChatClient client = new(model, key);

await foreach (
    StreamingChatCompletionUpdate update in client.CompleteChatStreamingAsync(
        new UserChatMessage("Say double bubble bath ten times fast.")
    )
)
{
    foreach (ChatMessageContentPart part in update.ContentUpdate)
    {
        Console.Write(part.Text);
    }
}
```

```
require "openai"

client = OpenAI::Client.new
stream = client.chat.completions.stream(
  model: "gpt-6-astra",
  messages: [\
    {\
      role: :user,\
      content: "Say 'double bubble bath' ten times fast."\
    }\
  ]
)
stream.text.each { |text| print(text) }
```

## Advanced use cases

For more advanced use cases, like streaming tool calls, check out the following dedicated guides:

- [Streaming function calls](https://developers.openai.com/api/docs/guides/function-calling#streaming)
- [Streaming structured output](https://developers.openai.com/api/docs/guides/structured-outputs#streaming)

## Moderation risk

Note that streaming the model’s output in a production application makes it more difficult to moderate the content of the completions, as partial completions may be more difficult to evaluate. This may have implications for approved usage.

If you request [moderation scores with a generation request](https://developers.openai.com/api/docs/guides/moderation#moderate-generated-content), the scores arrive after the full generated output is available. They aren’t included with partial output deltas.

Ask AI

Loading docs agent...
