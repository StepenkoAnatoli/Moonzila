---
url: https://openrouter.ai/docs/guides/features/tool-calling
retrieved: 2026-10-05
command: firecrawl scrape https://openrouter.ai/docs/guides/features/tool-calling --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Tool & Function Calling - Use Tools with OpenRouter
---
> ## Documentation Index
>
> Fetch the complete documentation index at: [/docs/llms.txt](https://openrouter.ai/docs/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://openrouter.ai/docs/guides/features/tool-calling#content-area)

Tool calls (also known as function calls) give an LLM access to external tools. The LLM does not call the tools directly. Instead, it suggests the tool to call. The user then calls the tool separately and provides the results back to the LLM. Finally, the LLM formats the response into an answer to the user’s original question.OpenRouter standardizes the tool calling interface across models and providers, making it easy to integrate external tools with any supported model.**Supported Models**: You can find models that support tool calling by filtering on [openrouter.ai/models?supported\_parameters=tools](https://openrouter.ai/models?supported_parameters=tools).If you prefer to learn from a full end-to-end example, keep reading.

## [​](https://openrouter.ai/docs/guides/features/tool-calling\#request-body-examples)  Request Body Examples

Tool calling with OpenRouter involves three key steps. Here are the essential request body formats for each step:

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#step-1-inference-request-with-tools)  Step 1: Inference Request with Tools

```
{
  "model": "google/gemini-3-flash-preview",
  "messages": [\
    {\
      "role": "user",\
      "content": "What are the titles of some James Joyce books?"\
    }\
  ],
  "tools": [\
    {\
      "type": "function",\
      "function": {\
        "name": "search_gutenberg_books",\
        "description": "Search for books in the Project Gutenberg library",\
        "parameters": {\
          "type": "object",\
          "properties": {\
            "search_terms": {\
              "type": "array",\
              "items": {"type": "string"},\
              "description": "List of search terms to find books"\
            }\
          },\
          "required": ["search_terms"]\
        }\
      }\
    }\
  ]
}
```

See all 29 lines

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#step-2-tool-execution-client-side)  Step 2: Tool Execution (Client-Side)

After receiving the model’s response with `tool_calls`, execute the requested tool locally and prepare the result:

```
// Model responds with tool_calls, you execute the tool locally
const toolResult = await searchGutenbergBooks(["James", "Joyce"]);
```

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#step-3-inference-request-with-tool-results)  Step 3: Inference Request with Tool Results

```
{
  "model": "google/gemini-3-flash-preview",
  "messages": [\
    {\
      "role": "user",\
      "content": "What are the titles of some James Joyce books?"\
    },\
    {\
      "role": "assistant",\
      "content": null,\
      "tool_calls": [\
        {\
          "id": "call_abc123",\
          "type": "function",\
          "function": {\
            "name": "search_gutenberg_books",\
            "arguments": "{\"search_terms\": [\"James\", \"Joyce\"]}"\
          }\
        }\
      ]\
    },\
    {\
      "role": "tool",\
      "tool_call_id": "call_abc123",\
      "content": "[{\"id\": 4300, \"title\": \"Ulysses\", \"authors\": [{\"name\": \"Joyce, James\"}]}]"\
    }\
  ],
  "tools": [\
    {\
      "type": "function",\
      "function": {\
        "name": "search_gutenberg_books",\
        "description": "Search for books in the Project Gutenberg library",\
        "parameters": {\
          "type": "object",\
          "properties": {\
            "search_terms": {\
              "type": "array",\
              "items": {"type": "string"},\
              "description": "List of search terms to find books"\
            }\
          },\
          "required": ["search_terms"]\
        }\
      }\
    }\
  ]
}
```

See all 48 lines

**Note**: The `tools` parameter must be included in every request (Steps 1 and 3) so the router can validate the tool schema on each call.

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#tool-calling-example)  Tool Calling Example

Here is an end-to-end example that gives LLMs the ability to call an external API — in this case Project Gutenberg, to search for books.First, let’s do some basic setup:

TypeScript SDK

Python

TypeScript (fetch)

```
import type { ChatFunctionTool, ChatMessages, ChatResult, ChatToolCall } from '@openrouter/sdk/models';
import { OpenRouter } from '@openrouter/sdk';

const OPENROUTER_API_KEY = "<OPENROUTER_API_KEY>";

// You can use any model that supports tool calling
const MODEL = "google/gemini-3-flash-preview";

const openRouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY,
});

const task = "What are the titles of some James Joyce books?";

const messages: ChatMessages[] = [\
  {\
    role: "system",\
    content: "You are a helpful assistant."\
  },\
  {\
    role: "user",\
    content: task,\
  }\
];
```

See all 24 lines

```
import json, requests
from openai import OpenAI

OPENROUTER_API_KEY = f"<OPENROUTER_API_KEY>"

# You can use any model that supports tool calling
MODEL = "google/gemini-3-flash-preview"

openai_client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=OPENROUTER_API_KEY,
)

task = "What are the titles of some James Joyce books?"

messages = [\
  {\
    "role": "system",\
    "content": "You are a helpful assistant."\
  },\
  {\
    "role": "user",\
    "content": task,\
  }\
]
```

```
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer <OPENROUTER_API_KEY>`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'google/gemini-3-flash-preview',
    messages: [\
      { role: 'system', content: 'You are a helpful assistant.' },\
      {\
        role: 'user',\
        content: 'What are the titles of some James Joyce books?',\
      },\
    ],
  }),
});
```

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#define-the-tool)  Define the Tool

Next, we define the tool that we want to call. Remember, the tool is going to get _requested_ by the LLM, but the code we are writing here is ultimately responsible for executing the call and returning the results to the LLM.

TypeScript SDK

Python

```
type Book = {
  id: number;
  title: string;
  authors: { name: string }[];
};

async function searchGutenbergBooks(searchTerms: string[]): Promise<Book[]> {
  const searchQuery = searchTerms.join(' ');
  const url = 'https://gutendex.com/books';
  const response = await fetch(`${url}?search=${searchQuery}`);
  const data: unknown = await response.json();

  if (!isGutenbergResponse(data)) {
    throw new Error('Invalid response from the Gutenberg API');
  }

  return data.results.map((book) => ({
    id: book.id,
    title: book.title,
    authors: book.authors.map((author) => ({ name: author.name })),
  }));
}

const tools: ChatFunctionTool[] = [\
  {\
    type: 'function',\
    function: {\
      name: 'searchGutenbergBooks',\
      description:\
        'Search for books in the Project Gutenberg library based on specified search terms',\
      parameters: {\
        type: 'object',\
        properties: {\
          search_terms: {\
            type: 'array',\
            items: {\
              type: 'string',\
            },\
            description:\
              "List of search terms to find books in the Gutenberg library (e.g. ['dickens', 'great'] to search for books by Dickens with 'great' in the title)",\
          },\
        },\
        required: ['search_terms'],\
      },\
    },\
  },\
];

function parseSearchTerms(argumentsJson: string): string[] {
  const args: unknown = JSON.parse(argumentsJson);

  if (
    !isRecord(args) ||
    !isStringArray(args.search_terms)
  ) {
    throw new Error('Invalid arguments for searchGutenbergBooks');
  }

  return args.search_terms;
}

function isGutenbergResponse(value: unknown): value is { results: Book[] } {
  return isRecord(value) && Array.isArray(value.results) && value.results.every(isBook);
}

function isBook(value: unknown): value is Book {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.title === 'string' &&
    Array.isArray(value.authors) &&
    value.authors.every(isBookAuthor)
  );
}

function isBookAuthor(value: unknown): value is { name: string } {
  return isRecord(value) && typeof value.name === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```

See all 86 lines

```
def search_gutenberg_books(search_terms):
    search_query = " ".join(search_terms)
    url = "https://gutendex.com/books"
    response = requests.get(url, params={"search": search_query})

    simplified_results = []
    for book in response.json().get("results", []):
        simplified_results.append({
            "id": book.get("id"),
            "title": book.get("title"),
            "authors": book.get("authors")
        })

    return simplified_results

tools = [\
  {\
    "type": "function",\
    "function": {\
      "name": "search_gutenberg_books",\
      "description": "Search for books in the Project Gutenberg library based on specified search terms",\
      "parameters": {\
        "type": "object",\
        "properties": {\
          "search_terms": {\
            "type": "array",\
            "items": {\
              "type": "string"\
            },\
            "description": "List of search terms to find books in the Gutenberg library (e.g. ['dickens', 'great'] to search for books by Dickens with 'great' in the title)"\
          }\
        },\
        "required": ["search_terms"]\
      }\
    }\
  }\
]

TOOL_MAPPING = {
    "search_gutenberg_books": search_gutenberg_books
}
```

Note that the “tool” is just a normal function. We then write a JSON “spec” compatible with the OpenAI function calling parameter. We’ll pass that spec to the LLM so that it knows this tool is available and how to use it. It will request the tool when needed, along with any arguments. We’ll then marshal the tool call locally, make the function call, and return the results to the LLM.

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#tool-use-and-tool-results)  Tool use and tool results

Let’s make the first OpenRouter API call to the model:

TypeScript SDK

Python

TypeScript (fetch)

```
const result = await openRouter.chat.send({
  chatRequest: {
    model: 'google/gemini-3-flash-preview',
    tools,
    messages,
    stream: false,
  },
});

if (result instanceof ReadableStream) {
  throw new Error('Expected a non-streaming response');
}

const firstChoice = result.choices[0];

if (!firstChoice) {
  throw new Error('Expected the model to return a choice');
}

const response_1 = firstChoice.message;
```

```
request_1 = {
    "model": google/gemini-3-flash-preview,
    "tools": tools,
    "messages": messages
}

response_1 = openai_client.chat.completions.create(**request_1).choices[0].message
```

```
const request_1 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer <OPENROUTER_API_KEY>`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'google/gemini-3-flash-preview',
    tools,
    messages,
  }),
});

const data = await request_1.json();
const response_1 = data.choices[0].message;
```

The LLM responds with a finish reason of `tool_calls`, and a `tool_calls` array. In a generic LLM response-handler, you would want to check the `finish_reason` before processing tool calls, but here we will assume it’s the case. Let’s keep going, by processing the tool call:

TypeScript SDK

Python

```
// Append the response to the messages array so the LLM has the full context
// It's easy to forget this step!
messages.push(response_1);

// Now we process the requested tool calls, and use our book lookup tool
if (!response_1.toolCalls || response_1.toolCalls.length === 0) {
  throw new Error('Expected the model to request a tool call');
}

for (const toolCall of response_1.toolCalls) {
  if (toolCall.function.name !== 'searchGutenbergBooks') {
    throw new Error(`Unknown tool: ${toolCall.function.name}`);
  }

  const searchTerms = parseSearchTerms(toolCall.function.arguments);
  const toolResponse = await searchGutenbergBooks(searchTerms);
  messages.push({
    role: 'tool',
    toolCallId: toolCall.id,
    content: JSON.stringify(toolResponse),
  });
}
```

```
# Append the response to the messages array so the LLM has the full context
# It's easy to forget this step!
messages.append(response_1)

# Now we process the requested tool calls, and use our book lookup tool
for tool_call in response_1.tool_calls:
    '''
    In this case we only provided one tool, so we know what function to call.
    When providing multiple tools, you can inspect `tool_call.function.name`
    to figure out what function you need to call locally.
    '''
    tool_name = tool_call.function.name
    tool_args = json.loads(tool_call.function.arguments)
    tool_response = TOOL_MAPPING[tool_name](**tool_args)
    messages.append({
      "role": "tool",
      "tool_call_id": tool_call.id,
      "content": json.dumps(tool_response),
    })
```

The messages array now has:

1. Our original request
2. The LLM’s response (containing a tool call request)
3. The result of the tool call (a json object returned from the Project Gutenberg API)

Now, we can make a second OpenRouter API call, and hopefully get our result!

TypeScript SDK

Python

TypeScript (fetch)

```
const response_2 = await openRouter.chat.send({
  chatRequest: {
    model: 'google/gemini-3-flash-preview',
    messages,
    tools,
    stream: false,
  },
});

if (response_2 instanceof ReadableStream) {
  throw new Error('Expected a non-streaming response');
}

const finalChoice = response_2.choices[0];

if (!finalChoice) {
  throw new Error('Expected the model to return a choice');
}

console.log(finalChoice.message.content);
```

```
request_2 = {
  "model": MODEL,
  "messages": messages,
  "tools": tools
}

response_2 = openai_client.chat.completions.create(**request_2)

print(response_2.choices[0].message.content)
```

```
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer <OPENROUTER_API_KEY>`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'google/gemini-3-flash-preview',
    messages,
    tools,
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

The output will be something like:

```
Here are some books by James Joyce:

*   *Ulysses*
*   *Dubliners*
*   *A Portrait of the Artist as a Young Man*
*   *Chamber Music*
*   *Exiles: A Play in Three Acts*
```

We did it! We’ve successfully used a tool in a prompt.

## [​](https://openrouter.ai/docs/guides/features/tool-calling\#interleaved-thinking)  Interleaved Thinking

Interleaved thinking allows models to reason between tool calls, enabling more sophisticated decision-making after receiving tool results. This feature helps models chain multiple tool calls with reasoning steps in between and make nuanced decisions based on intermediate results.**Important**: Interleaved thinking increases token usage and response latency. Consider your budget and performance requirements when enabling this feature.

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#how-interleaved-thinking-works)  How Interleaved Thinking Works

With interleaved thinking, the model can:

- Reason about the results of a tool call before deciding what to do next
- Chain multiple tool calls with reasoning steps in between
- Make more nuanced decisions based on intermediate results
- Provide transparent reasoning for its tool selection process

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#example-multi-step-research-with-reasoning)  Example: Multi-Step Research with Reasoning

Here’s an example showing how a model might use interleaved thinking to research a topic across multiple sources:**Initial Request:**

```
{
  "model": "anthropic/claude-sonnet-4.5",
  "messages": [\
    {\
      "role": "user",\
      "content": "Research the environmental impact of electric vehicles and provide a comprehensive analysis."\
    }\
  ],
  "tools": [\
    {\
      "type": "function",\
      "function": {\
        "name": "search_academic_papers",\
        "description": "Search for academic papers on a given topic",\
        "parameters": {\
          "type": "object",\
          "properties": {\
            "query": {"type": "string"},\
            "field": {"type": "string"}\
          },\
          "required": ["query"]\
        }\
      }\
    },\
    {\
      "type": "function",\
      "function": {\
        "name": "get_latest_statistics",\
        "description": "Get latest statistics on a topic",\
        "parameters": {\
          "type": "object",\
          "properties": {\
            "topic": {"type": "string"},\
            "year": {"type": "integer"}\
          },\
          "required": ["topic"]\
        }\
      }\
    }\
  ]
}
```

See all 41 lines

**Model’s Reasoning and Tool Calls:**

1. **Initial Thinking**: “I need to research electric vehicle environmental impact. Let me start with academic papers to get peer-reviewed research.”
2. **First Tool Call**: `search_academic_papers({"query": "electric vehicle lifecycle environmental impact", "field": "environmental science"})`
3. **After First Tool Result**: “The papers show mixed results on manufacturing impact. I need current statistics to complement this academic research.”
4. **Second Tool Call**: `get_latest_statistics({"topic": "electric vehicle carbon footprint", "year": 2024})`
5. **After Second Tool Result**: “Now I have both academic research and current data. Let me search for manufacturing-specific studies to address the gaps I found.”
6. **Third Tool Call**: `search_academic_papers({"query": "electric vehicle battery manufacturing environmental cost", "field": "materials science"})`
7. **Final Analysis**: Synthesizes all gathered information into a comprehensive response.

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#best-practices-for-interleaved-thinking)  Best Practices for Interleaved Thinking

- **Clear Tool Descriptions**: Provide detailed descriptions so the model can reason about when to use each tool
- **Structured Parameters**: Use well-defined parameter schemas to help the model make precise tool calls
- **Context Preservation**: Maintain conversation context across multiple tool interactions
- **Error Handling**: Design tools to provide meaningful error messages that help the model adjust its approach

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#implementation-considerations)  Implementation Considerations

When implementing interleaved thinking:

- Models may take longer to respond due to additional reasoning steps
- Token usage will be higher due to the reasoning process
- The quality of reasoning depends on the model’s capabilities
- Some models may be better suited for this approach than others

## [​](https://openrouter.ai/docs/guides/features/tool-calling\#a-simple-agentic-loop)  A Simple Agentic Loop

In the example above, the calls are made explicitly and sequentially. To handle a wide variety of user inputs and tool calls, you can use an agentic loop.Here’s an example of a simple agentic loop (using the same `tools` and initial `messages` as above):

TypeScript SDK

Python

```
async function callLLM(messages: ChatMessages[]): Promise<ChatResult> {
  const result = await openRouter.chat.send({
    chatRequest: {
      model: 'google/gemini-3-flash-preview',
      tools,
      messages,
      stream: false,
    },
  });

  if (result instanceof ReadableStream) {
    throw new Error('Expected a non-streaming response');
  }

  const choice = result.choices[0];

  if (!choice) {
    throw new Error('Expected the model to return a choice');
  }

  messages.push(choice.message);
  return result;
}

async function getToolResponse(toolCall: ChatToolCall): Promise<ChatMessages> {
  if (toolCall.function.name !== 'searchGutenbergBooks') {
    throw new Error(`Unknown tool: ${toolCall.function.name}`);
  }

  const searchTerms = parseSearchTerms(toolCall.function.arguments);
  const toolResult = await searchGutenbergBooks(searchTerms);

  return {
    role: 'tool',
    toolCallId: toolCall.id,
    content: JSON.stringify(toolResult),
  };
}

const maxIterations = 10;
let iterationCount = 0;
let didReachMaxIterations = true;

while (iterationCount < maxIterations) {
  iterationCount++;
  const response = await callLLM(messages);
  const choice = response.choices[0];

  if (!choice) {
    throw new Error('Expected the model to return a choice');
  }

  const toolCalls = choice.message.toolCalls;

  if (!toolCalls || toolCalls.length === 0) {
    didReachMaxIterations = false;
    break;
  }

  for (const toolCall of toolCalls) {
    messages.push(await getToolResponse(toolCall));
  }
}

if (didReachMaxIterations) {
  console.warn("Warning: Maximum iterations reached");
}

console.log(messages[messages.length - 1].content);
```

See all 69 lines

```
def call_llm(msgs):
    resp = openai_client.chat.completions.create(
        model=google/gemini-3-flash-preview,
        tools=tools,
        messages=msgs
    )
    msgs.append(resp.choices[0].message.dict())
    return resp

def get_tool_response(tool_call):
    tool_name = tool_call.function.name
    tool_args = json.loads(tool_call.function.arguments)

    # Look up the correct tool locally, and call it with the provided arguments
    # Other tools can be added without changing the agentic loop
    tool_result = TOOL_MAPPING[tool_name](**tool_args)

    return {
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": json.dumps(tool_result),
    }

max_iterations = 10
iteration_count = 0
reached_max_iterations = True

while iteration_count < max_iterations:
    iteration_count += 1
    resp = call_llm(messages)

    tool_calls = resp.choices[0].message.tool_calls
    if not tool_calls:
        reached_max_iterations = False
        break

    for tool_call in tool_calls:
        messages.append(get_tool_response(tool_call))

if reached_max_iterations:
    print("Warning: Maximum iterations reached")

print(messages[-1]['content'])
```

## [​](https://openrouter.ai/docs/guides/features/tool-calling\#best-practices-and-advanced-patterns)  Best Practices and Advanced Patterns

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#function-definition-guidelines)  Function Definition Guidelines

When defining tools for LLMs, follow these best practices:**Clear and Descriptive Names**: Use descriptive function names that clearly indicate the tool’s purpose.

```
// Good: Clear and specific
{ "name": "get_weather_forecast" }
```

```
// Avoid: Too vague
{ "name": "weather" }
```

**Comprehensive Descriptions**: Provide detailed descriptions that help the model understand when and how to use the tool.

```
{
  "description": "Get current weather conditions and 5-day forecast for a specific location. Supports cities, zip codes, and coordinates.",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name, zip code, or coordinates (lat,lng). Examples: 'New York', '10001', '40.7128,-74.0060'"
      },
      "units": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "description": "Temperature unit preference",
        "default": "celsius"
      }
    },
    "required": ["location"]
  }
}
```

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#streaming-with-tool-calls)  Streaming with Tool Calls

When using streaming responses with tool calls, handle the different content types appropriately:

```
const stream = await fetch('/api/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'anthropic/claude-sonnet-4.5',
    messages: messages,
    tools: tools,
    stream: true
  })
});

const reader = stream.body.getReader();
let toolCalls = [];

while (true) {
  const { done, value } = await reader.read();
  if (done) {
    break;
  }

  const chunk = new TextDecoder().decode(value);
  const lines = chunk.split('\n').filter(line => line.trim());

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));

      if (data.choices[0].delta.tool_calls) {
        toolCalls.push(...data.choices[0].delta.tool_calls);
      }

      if (data.choices[0].delta.finish_reason === 'tool_calls') {
        await handleToolCalls(toolCalls);
      } else if (data.choices[0].delta.finish_reason === 'stop') {
        // Regular completion without tool calls
        break;
      }
    }
  }
}
```

See all 40 lines

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#tool-choice-configuration)  Tool Choice Configuration

Control tool usage with the `tool_choice` parameter:

```
// Let model decide (default)
{ "tool_choice": "auto" }
```

```
// Disable tool usage
{ "tool_choice": "none" }
```

```
// Force specific tool
{
  "tool_choice": {
    "type": "function",
    "function": {"name": "search_database"}
  }
}
```

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#parallel-tool-calls)  Parallel Tool Calls

Control whether multiple tools can be called simultaneously with the `parallel_tool_calls` parameter (default is true for most models):

```
// Disable parallel tool calls - tools will be called sequentially
{ "parallel_tool_calls": false }
```

When `parallel_tool_calls` is `false`, the model will only request one tool call at a time instead of potentially multiple calls in parallel.

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#multi-tool-workflows)  Multi-Tool Workflows

Design tools that work well together:

```
{
  "tools": [\
    {\
      "type": "function",\
      "function": {\
        "name": "search_products",\
        "description": "Search for products in the catalog"\
      }\
    },\
    {\
      "type": "function",\
      "function": {\
        "name": "get_product_details",\
        "description": "Get detailed information about a specific product"\
      }\
    },\
    {\
      "type": "function",\
      "function": {\
        "name": "check_inventory",\
        "description": "Check current inventory levels for a product"\
      }\
    }\
  ]
}
```

See all 25 lines

This allows the model to naturally chain operations: search → get details → check inventory.

### [​](https://openrouter.ai/docs/guides/features/tool-calling\#reliability-tracking)  Reliability Tracking

OpenRouter tracks how reliably each provider completes tool calls and surfaces this as the **Tool Call Error Rate** on the Performance tab of every model page. The same signal drives [Auto Exacto](https://openrouter.ai/docs/guides/routing/auto-exacto) provider ordering on tool-calling requests. For the exact validator, JSON Schema draft, regex semantics, and per-tool-call classification, see [How Tool-Calling Success Rate Is Measured](https://openrouter.ai/docs/guides/routing/auto-exacto#how-tool-calling-success-rate-is-measured).For more details on OpenRouter’s message format and tool parameters, see the [API Reference](https://openrouter.ai/docs/api_reference/overview).

Assistant

Responses are generated using AI and may contain mistakes.
