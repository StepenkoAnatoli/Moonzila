---
url: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
retrieved: 2026-10-05
command: firecrawl scrape https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Stop reasons and fallback - Claude Platform Docs
---
Copy page



Every Messages API response includes a `stop_reason` field that tells you why Claude stopped generating. Check this field to decide whether to use the response as-is, continue the conversation, retry, or fall back to another model.

For the full response schema, see the [Messages API reference](https://platform.claude.com/docs/en/api/messages/create).

## Quick reference

| Value | When it occurs | What to do |
| --- | --- | --- |
| [`end_turn`](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#end-turn) | Claude finished its response naturally. | Use the response. |
| [`max_tokens`](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#max-tokens) | The response reached your `max_tokens` limit. | Raise `max_tokens` or [continue the response](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#ensuring-complete-responses). |
| [`stop_sequence`](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#stop-sequence) | Claude emitted one of your `stop_sequences`. | Read `stop_sequence` to see which one fired. |
| [`tool_use`](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#tool-use) | Claude is calling a tool. | Run the tool and return the result. A server tool call still missing its result block completes in a later response. |
| [`pause_turn`](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#pause-turn) | A server-tool loop reached its iteration limit. | Send the assistant content back to continue. |
| [`refusal`](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#refusal) | Claude declined to respond. | Read `stop_details` and [retry on a fallback model](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback). |
| [`model_context_window_exceeded`](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#model-context-window-exceeded) | The response filled the model's context window. | Treat the response as truncated. |

## The stop\_reason field

The `stop_reason` field is part of every successful Messages API response. Unlike errors, which indicate failures in processing your request, `stop_reason` tells you why Claude completed its response generation.

Example response



```
{
  "id": "msg_01234",
  "type": "message",
  "role": "assistant",
  "content": [\
    {\
      "type": "text",\
      "text": "Here's the answer to your question..."\
    }\
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "stop_details": null,
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50
  }
}
```

## Stop reason values

### end\_turn

The most common stop reason. Indicates Claude finished its response naturally.

cURLCLIPythonTypeScriptC#GoJavaPHPRuby



```
client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
)
if response.stop_reason == "end_turn":
    # Process the complete response
    for block in response.content:
        if block.type == "text":
            print(block.text)
```

### Empty responses with end\_turn

Sometimes Claude returns an empty response (exactly 2–3 tokens with no content) with `stop_reason: "end_turn"`. This typically occurs when Claude interprets that the assistant turn is complete, particularly after tool results.

**Common causes:**

- Adding text blocks immediately after tool results (Claude learns to expect the user to always insert text after tool results, so it ends its turn to follow the pattern)
- Sending Claude's completed response back without adding anything (Claude already determined it's done, so it will remain done)

**How to prevent empty responses:**

PythonTypeScriptC#GoJavaPHPRuby



```
# INCORRECT: Adding text immediately after tool_result
messages = [\
    {"role": "user", "content": "Calculate the sum of 1234 and 5678"},\
    {\
        "role": "assistant",\
        "content": [\
            {\
                "type": "tool_use",\
                "id": "toolu_123",\
                "name": "calculator",\
                "input": {"operation": "add", "a": 1234, "b": 5678},\
            }\
        ],\
    },\
    {\
        "role": "user",\
        "content": [\
            {"type": "tool_result", "tool_use_id": "toolu_123", "content": "6912"},\
            {\
                "type": "text",\
                "text": "Here's the result",  # Don't add text after tool_result\
            },\
        ],\
    },\
]

# CORRECT: Send tool results directly without additional text
messages = [\
    {"role": "user", "content": "Calculate the sum of 1234 and 5678"},\
    {\
        "role": "assistant",\
        "content": [\
            {\
                "type": "tool_use",\
                "id": "toolu_123",\
                "name": "calculator",\
                "input": {"operation": "add", "a": 1234, "b": 5678},\
            }\
        ],\
    },\
    {\
        "role": "user",\
        "content": [\
            {"type": "tool_result", "tool_use_id": "toolu_123", "content": "6912"}\
        ],\
    },  # Just the tool_result, no additional text\
]
```

If you still get empty responses after fixing the message structure, add a continuation prompt in a new user message rather than retrying with the empty response:

PythonTypeScriptC#GoJavaPHPRuby



```
def handle_empty_response(client, messages):
    response = client.messages.create(
        model="claude-opus-5-5", max_tokens=1024, messages=messages
    )

    # Check if response is empty
    if response.stop_reason == "end_turn" and not response.content:
        # INCORRECT: Don't just retry with the empty response
        # This won't work because Claude already decided it's done

        # CORRECT: Add a continuation prompt in a NEW user message
        messages.append({"role": "user", "content": "Please continue"})

        response = client.messages.create(
            model="claude-opus-5-5", max_tokens=1024, messages=messages
        )

    return response
```

**Best practices:**

1. **Never add text blocks immediately after tool results:** This teaches Claude to expect user input after every tool use.
2. **Don't retry empty responses without modification:** Sending the empty response back won't help.
3. **Use continuation prompts as a last resort:** Only if these fixes don't resolve the issue.

### max\_tokens

Claude stopped because it reached the `max_tokens` limit specified in your request.

cURLCLIPythonTypeScriptC#GoJavaPHPRuby



```
client = anthropic.Anthropic()
# Request with limited tokens
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=10,
    messages=[{"role": "user", "content": "Explain quantum physics"}],
)

if response.stop_reason == "max_tokens":
    # Response was truncated
    print("Response was cut off at token limit")
    # Consider making another request to continue
```

### Incomplete tool use blocks

If Claude's response is cut off because it hit the `max_tokens` limit, and the truncated response contains an incomplete tool use block, you'll need to retry the request with a higher `max_tokens` value to get the full tool use.

CLIPythonTypeScriptC#GoJavaPHPRuby



```
# Check if response was truncated during tool use
if response.stop_reason == "max_tokens":
    # Check if the last content block is an incomplete tool_use
    last_block = response.content[-1]
    if last_block.type == "tool_use":
        # Send the request with higher max_tokens
        response = client.messages.create(
            model="claude-opus-5-5",
            max_tokens=4096,  # Increased limit
            messages=messages,
            tools=tools,
        )
```

### stop\_sequence

Claude encountered one of your custom stop sequences.

cURLCLIPythonTypeScriptC#GoJavaPHPRuby



```
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=1024,
    stop_sequences=["END", "STOP"],
    messages=[{"role": "user", "content": "Generate text until you say END"}],
)

if response.stop_reason == "stop_sequence":
    print(f"Stopped at sequence: {response.stop_sequence}")
```

### tool\_use

Claude is calling a tool and expects you to run it.

cURLCLIPythonTypeScriptC#GoJavaPHPRuby



```
client = anthropic.Anthropic()
weather_tool = {
    "name": "get_weather",
    "description": "Get the current weather in a given location",
    "input_schema": {
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "City and state"},
        },
        "required": ["location"],
    },
}

def execute_tool(name, tool_input):
    """Execute a tool and return the result."""
    return f"Weather in {tool_input.get('location', 'unknown')}: 72°F"

response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=1024,
    tools=[weather_tool],
    messages=[{"role": "user", "content": "What is the weather in San Francisco?"}],
)

if response.stop_reason == "tool_use":
    # Extract and execute the tool
    for block in response.content:
        if block.type == "tool_use":
            result = execute_tool(block.name, block.input)
            # Return result to Claude for final response
```

A `tool_use` response can also contain a `server_tool_use` block whose `id` has no matching result block. That server tool call is not finished, and this response does not carry its result. In the common case, Claude calls a [server tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools) and one of your client tools in the same group of parallel tool calls: the API returns without running the server tool so that you can run the client tools first. There is no other marker for the state; detect it by checking each `server_tool_use` or `mcp_tool_use` block's `id` for a matching result block.

A mixed tool\_use response



```
{
  "stop_reason": "tool_use",
  "content": [\
    {\
      "type": "server_tool_use",\
      "id": "srvtoolu_01HxbWnMRmbWyMfUtJKC45rA",\
      "name": "web_search",\
      "input": { "query": "example article" }\
    },\
    {\
      "type": "tool_use",\
      "id": "toolu_01PjgRJLbXrXEMZwDNYLnBqk",\
      "name": "run_command",\
      "input": { "command": "uname -a" }\
    }\
  ]
}
```

The continuation is a user message of `tool_result` blocks, one for every `tool_use` block in the response (see [Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)), with two extra rules: that message must contain nothing except the `tool_result` blocks, and the request must keep the same `tools` array. A resume request that no longer defines the waiting server tool fails with a 400 whose message ends ``but no `web_search` tool was provided``. The API attaches your results to the still-open assistant turn, runs the deferred server tool (for paused code execution, resumes it), and continues the turn. For a server tool Claude called directly, the next response's `content` starts with the result block that answers the previous response's `server_tool_use``id`.

The follow-up user message



```
{
  "role": "user",
  "content": [\
    {\
      "type": "tool_result",\
      "tool_use_id": "toolu_01PjgRJLbXrXEMZwDNYLnBqk",\
      "content": "Linux demo-host 6.8.0-52-generic x86_64 GNU/Linux"\
    }\
  ]
}
```

Adding anything after the `tool_result` blocks in that user message, such as text, ends the assistant turn; for a server tool Claude called directly, the request then fails with a 400 `invalid_request_error` that names the unresolved server tool:

```
`web_search` tool use with id `srvtoolu_01HxbWnMRmbWyMfUtJKC45rA` was found without a corresponding `web_search_tool_result` block
```



Leaving out a `tool_result`, or putting one after other content, fails earlier with the standard `tool_use ids were found without tool_result blocks immediately after` error instead. To give Claude more input, send it as a separate user message after the turn completes.

### pause\_turn

Returned when the server-side sampling loop reaches its iteration limit while executing [server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools) such as web search. The default limit is 10 iterations per request.

When this happens, the response may contain a `server_tool_use` block without a corresponding result block. To let Claude finish processing, continue the conversation by sending the response back as-is. A response that leaves a client `tool_use` block waiting on you never has a `stop_reason` of `pause_turn`: when Claude stops to call your tools, `stop_reason` is [`tool_use`](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#tool-use), and you continue it by sending the client `tool_result` blocks instead of the response itself.

cURLCLIPythonTypeScriptC#GoJavaPHPRuby



```
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=4096,
    tools=[{"type": "web_search_20250305", "name": "web_search"}],
    messages=[{"role": "user", "content": "Search for latest AI news"}],
)

if response.stop_reason == "pause_turn":
    # Continue the conversation by sending the response back
    messages = [\
        {"role": "user", "content": "Search for latest AI news"},\
        {"role": "assistant", "content": response.content},\
    ]
    continuation = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=4096,
        messages=messages,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
    )
```

### refusal

Claude declined to generate a response. Safety classifiers return this stop reason as a normal HTTP 200 response, not an error.

cURLCLIPythonTypeScriptC#GoJavaPHPRuby



```
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "[Unsafe request]"}],
)

if response.stop_reason == "refusal":
    # Claude declined to respond
    print("Claude was unable to process this request")
    # Consider rephrasing or modifying the request
```

On a refusal, the `stop_details` object identifies the policy category that triggered it. The categories and the full refusal response shape are covered on [Refusals and fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback#refusal-response). `stop_details` is `null` for all stop reasons other than `refusal`.

A refused request on Claude Fable 5.1, Claude Fable 5, Claude Opus 5.5, Claude Opus 5, or Claude Sonnet 5.5 can usually be served by retrying on another Claude model. [Refusals and fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback) shows how to set up that retry, server-side or in your client. If you build the retry yourself from Claude Fable 5.1, Claude Fable 5, Claude Opus 5.5, Claude Opus 5, or Claude Sonnet 5.5, [fallback credit](https://platform.claude.com/docs/en/build-with-claude/fallback-credit) covers how to avoid paying the prompt-cache cost twice.

### model\_context\_window\_exceeded

Claude stopped because it reached the model's context window limit. This lets you request the maximum possible tokens without knowing the exact input size.

cURLCLIPythonTypeScriptC#GoJavaPHPRuby



```
# Request with maximum tokens to get as much as possible
response = client.beta.messages.create(
    model="claude-opus-5-5",
    max_tokens=20000,  # Python SDK requires streaming for max_tokens above ~21k
    messages=[\
        {"role": "user", "content": "Large input that uses most of context window..."}\
    ],
)

if response.stop_reason == "model_context_window_exceeded":
    # Response hit context window limit before max_tokens
    print("Response reached model's context window limit")
    # The response is still valid but was limited by context window
```

## Best practices for handling stop reasons

### Always check stop\_reason

Make it a habit to check the `stop_reason` in your response handling logic:

PythonTypeScriptC#GoJavaPHPRuby



```
def handle_response(response):
    match response.stop_reason:
        case "tool_use":
            return handle_tool_use(response)
        case "max_tokens":
            return handle_truncation(response)
        case "model_context_window_exceeded":
            return handle_context_limit(response)
        case "pause_turn":
            return handle_pause(response)
        case "refusal":
            return handle_refusal(response)
        case _:
            # Handle end_turn and other cases
            return next(
                (block.text for block in response.content if block.type == "text"),
                "",
            )
```

### Handle truncated responses gracefully

When a response is truncated because of token limits or the context window, append a notice so the reader knows the output is incomplete. To continue generating from where the response left off instead, see [Ensuring complete responses](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#ensuring-complete-responses).

PythonTypeScriptC#GoJavaPHPRuby



```
def handle_truncated_response(response):
    text = next((block.text for block in response.content if block.type == "text"), "")
    if response.stop_reason in ["max_tokens", "model_context_window_exceeded"]:
        if response.stop_reason == "max_tokens":
            note = "[Response truncated due to max_tokens limit]"
        else:
            note = "[Response truncated due to context window limit]"
        return f"{text}\n\n{note}"
    return text
```

### Implement retry logic for pause\_turn

When using [server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools), the API may return `pause_turn` if the server-side sampling loop reaches its iteration limit (default 10). Handle this by continuing the conversation:

PythonTypeScriptC#GoJavaPHPRuby



```
def handle_server_tool_conversation(client, user_query, tools, max_continuations=5):
    """
    Handle server tool conversations that may require multiple continuations.

    The server runs a sampling loop when executing server tools. If the loop
    reaches its iteration limit, the API returns pause_turn. Continue the
    conversation by sending the response back to let Claude finish.
    """
    messages = [{"role": "user", "content": user_query}]

    for _ in range(max_continuations):
        response = client.messages.create(
            model="claude-opus-5-5",
            max_tokens=4096,
            messages=messages,
            tools=tools,
        )

        if response.stop_reason != "pause_turn":
            # Claude finished processing - return the final response
            return response

        # pause_turn: replace the full message list to maintain alternating roles
        messages = [\
            {"role": "user", "content": user_query},\
            {"role": "assistant", "content": response.content},\
        ]

    # Reached max continuations - return the last response
    return response
```

## Stop reasons vs. errors

It's important to distinguish between `stop_reason` values and actual errors:

### Stop reasons (successful responses)

- Part of the response body
- Indicate why generation stopped normally
- Response contains valid content

### Errors (failed requests)

- HTTP status codes 4xx or 5xx
- Indicate request processing failures
- Response contains error details

cURLCLIPythonTypeScriptC#GoJavaPHPRuby



```
client = anthropic.Anthropic()

try:
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hello!"}],
    )

    # Handle successful response with stop_reason
    if response.stop_reason == "max_tokens":
        print("Response was truncated")

except anthropic.APIStatusError as e:
    # Handle actual errors
    match e.status_code:
        case 429:
            print("Rate limit exceeded")
        case 500:
            print("Server error")
```

## Streaming considerations

When using streaming, `stop_reason` is:

- `null` in the initial `message_start` event
- Provided in the `message_delta` event
- Not provided in any other events

cURLCLIPythonTypeScriptC#GoJavaPHPRuby



```
client = anthropic.Anthropic()

with client.messages.stream(
    model="claude-opus-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
) as stream:
    for event in stream:
        if event.type == "message_delta":
            stop_reason = event.delta.stop_reason
            if stop_reason:
                print(f"Stream ended with: {stop_reason}")
```

## Common patterns

### Handling tool use workflows

PythonTypeScriptC#GoJavaPHPRuby



```
def complete_tool_workflow(client, user_query, tools):
    messages = [{"role": "user", "content": user_query}]

    while True:
        response = client.messages.create(
            model="claude-opus-5-5",
            max_tokens=1024,
            messages=messages,
            tools=tools,
        )

        if response.stop_reason == "tool_use":
            # Execute tools and continue
            tool_results = execute_tools(response.content)
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})
        else:
            # Final response
            return response
```

### Ensuring complete responses

PythonTypeScriptC#GoJavaPHPRuby



```
def get_complete_response(client, prompt, max_attempts=3):
    messages = [{"role": "user", "content": prompt}]
    full_response = ""

    for _ in range(max_attempts):
        response = client.messages.create(
            model="claude-opus-5-5", messages=messages, max_tokens=4096
        )

        full_response += next(
            (block.text for block in response.content if block.type == "text"), ""
        )

        if response.stop_reason != "max_tokens":
            break

        # Continue from where it left off
        messages = [\
            {"role": "user", "content": prompt},\
            {"role": "assistant", "content": full_response},\
            {"role": "user", "content": "Please continue from where you left off."},\
        ]

    return full_response
```

### Getting maximum tokens without knowing input size

With the `model_context_window_exceeded` stop reason, you can request the maximum possible tokens without calculating input size:

PythonTypeScriptC#GoJavaPHPRuby



```
def get_max_possible_tokens(client, prompt):
    """
    Get as many tokens as possible within the model's context window
    without needing to calculate input token count
    """
    response = client.beta.messages.create(
        model="claude-opus-5-5",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=20000,  # Python SDK requires streaming for max_tokens above ~21k
    )

    match response.stop_reason:
        case "model_context_window_exceeded":
            # Got the maximum possible tokens given input size
            print(
                f"Generated {response.usage.output_tokens} tokens (context limit reached)"
            )
        case "max_tokens":
            # Got exactly the requested tokens
            print(
                f"Generated {response.usage.output_tokens} tokens (max_tokens reached)"
            )
        case _:
            # Natural completion
            print(
                f"Generated {response.usage.output_tokens} tokens (natural completion)"
            )

    return next((block.text for block in response.content if block.type == "text"), "")
```

## Next steps



[Refusals and fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback)

Retry refused requests on a fallback model, server-side or in your client.



[Tool Runner (SDK)](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner)

Let the SDK manage the `tool_use` loop, result formatting, and retries for you.



[Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)

Read `stop_reason` from the `message_delta` event when streaming.



[Errors](https://platform.claude.com/docs/en/api/errors)

Handle 4xx and 5xx HTTP errors, which are distinct from stop reasons.

Was this page helpful?



Stop reasons and fallback/

Quick reference

Ask Docs
