---
url: https://ai.google.dev/gemini-api/docs/api-errors
retrieved: 2026-10-05
command: firecrawl scrape https://ai.google.dev/gemini-api/docs/api-errors --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: API errors - Interactions API | Google AI for Developers
---
[Skip to main content](https://ai.google.dev/gemini-api/docs/api-errors#main-content)

[![Gemini API](https://ai.google.dev/_static/googledevai/images/gemini-api-logo.svg)](https://ai.google.dev/)

`/`

Language

- [English](https://ai.google.dev/gemini-api/docs/api-errors)
- [Deutsch](https://ai.google.dev/gemini-api/docs/api-errors?hl=de)
- [Español – América Latina](https://ai.google.dev/gemini-api/docs/api-errors?hl=es-419)
- [Français](https://ai.google.dev/gemini-api/docs/api-errors?hl=fr)
- [Indonesia](https://ai.google.dev/gemini-api/docs/api-errors?hl=id)
- [Italiano](https://ai.google.dev/gemini-api/docs/api-errors?hl=it)
- [Polski](https://ai.google.dev/gemini-api/docs/api-errors?hl=pl)
- [Português – Brasil](https://ai.google.dev/gemini-api/docs/api-errors?hl=pt-br)
- [Shqip](https://ai.google.dev/gemini-api/docs/api-errors?hl=sq)
- [Tiếng Việt](https://ai.google.dev/gemini-api/docs/api-errors?hl=vi)
- [Türkçe](https://ai.google.dev/gemini-api/docs/api-errors?hl=tr)
- [Русский](https://ai.google.dev/gemini-api/docs/api-errors?hl=ru)
- [עברית](https://ai.google.dev/gemini-api/docs/api-errors?hl=he)
- [العربيّة](https://ai.google.dev/gemini-api/docs/api-errors?hl=ar)
- [فارسی](https://ai.google.dev/gemini-api/docs/api-errors?hl=fa)
- [हिंदी](https://ai.google.dev/gemini-api/docs/api-errors?hl=hi)
- [বাংলা](https://ai.google.dev/gemini-api/docs/api-errors?hl=bn)
- [ภาษาไทย](https://ai.google.dev/gemini-api/docs/api-errors?hl=th)
- [中文 – 简体](https://ai.google.dev/gemini-api/docs/api-errors?hl=zh-cn)
- [中文 – 繁體](https://ai.google.dev/gemini-api/docs/api-errors?hl=zh-tw)
- [日本語](https://ai.google.dev/gemini-api/docs/api-errors?hl=ja)
- [한국어](https://ai.google.dev/gemini-api/docs/api-errors?hl=ko)

[Get API key](https://aistudio.google.com/apikey) [Cookbook](https://github.com/google-gemini/cookbook) [Community](https://discuss.ai.google.dev/c/gemini-api/)

[Sign in](https://ai.google.dev/_d/signin?continue=https%3A%2F%2Fai.google.dev%2Fgemini-api%2Fdocs%2Fapi-errors&prompt=select_account)

- On this page
- [Standard API error codes](https://ai.google.dev/gemini-api/docs/api-errors#api-error-codes)
- [Generation blocked codes](https://ai.google.dev/gemini-api/docs/api-errors#generation-blocked-codes)
- [Generation error codes](https://ai.google.dev/gemini-api/docs/api-errors#generation-error-codes)
- [Error response format](https://ai.google.dev/gemini-api/docs/api-errors#error-schema)
- [How errors are delivered](https://ai.google.dev/gemini-api/docs/api-errors#error-delivery)
  - [Standard HTTP requests](https://ai.google.dev/gemini-api/docs/api-errors#http-errors)
  - [Streaming (SSE) requests](https://ai.google.dev/gemini-api/docs/api-errors#sse-errors)
- [What's next](https://ai.google.dev/gemini-api/docs/api-errors#whats-next)

Gemini 3.8 Flash is now available. [Try it out](https://aistudio.google.com/prompts/new_chat?model=gemini-3.8-flash).


- [Home](https://ai.google.dev/)
- [Gemini API](https://ai.google.dev/gemini-api)
- [Docs](https://ai.google.dev/gemini-api/docs)

Was this helpful?

Interactions API (Recommended)generateContent APILearn more

Select an optionInteractions API (Recommended)

- [Interactions API (Recommended)](https://ai.google.dev/gemini-api/docs/api-errors)
- [generateContent API](https://ai.google.dev/gemini-api/docs/generate-content/api-errors)
- [Learn more](https://ai.google.dev/gemini-api/docs/interactions)



 Send feedback



# API errors

- On this page
- [Standard API error codes](https://ai.google.dev/gemini-api/docs/api-errors#api-error-codes)
- [Generation blocked codes](https://ai.google.dev/gemini-api/docs/api-errors#generation-blocked-codes)
- [Generation error codes](https://ai.google.dev/gemini-api/docs/api-errors#generation-error-codes)
- [Error response format](https://ai.google.dev/gemini-api/docs/api-errors#error-schema)
- [How errors are delivered](https://ai.google.dev/gemini-api/docs/api-errors#error-delivery)
  - [Standard HTTP requests](https://ai.google.dev/gemini-api/docs/api-errors#http-errors)
  - [Streaming (SSE) requests](https://ai.google.dev/gemini-api/docs/api-errors#sse-errors)
- [What's next](https://ai.google.dev/gemini-api/docs/api-errors#whats-next)

This page provides a reference for all Interactions API error codes, describes the
error response format, and explains how the API delivers errors for different request types.

## Standard API error codes

These general request-level error codes correspond to standard HTTP status codes.
Use the `code` field in your application logic to handle errors programmatically.

| Code | HTTP Status | Description | Recommended action |
| --- | --- | --- | --- |
| `invalid_request` | 400 Bad Request | The request payload is malformed or contains invalid parameters. | Check your request syntax and parameters against the [API reference](https://ai.google.dev/api/interactions-api). |
| `failed_precondition` | 400 Bad Request | The request cannot be processed because a prerequisite is not met (for example, disabled billing). | Verify project billing status or account prerequisites. |
| `out_of_range` | 416 Requested Range Not Satisfiable | Request parameter is outside the valid range. | Check parameter values and limits. |
| `parameter_unknown` | 400 Bad Request | The request contains an unknown parameter. | Remove the unrecognized parameter and retry. |
| `authentication` | 401 Unauthorized | The API key is missing, invalid, or expired. | Verify your [API key](https://ai.google.dev/gemini-api/docs/api-key). |
| `payment_required` | 402 Payment Required | Your Prepay credit balance is depleted. | [Add credits](https://ai.google.dev/gemini-api/docs/billing#buy-credits) to your billing account, or turn on [auto-reload](https://ai.google.dev/gemini-api/docs/billing#auto-reload). Don't retry: the request won't succeed until credits are added. |
| `permission_denied` | 403 Forbidden | Your API key does not have permission for this resource. | Check your API key permissions and project access. |
| `not_found` | 404 Not Found | The requested resource was not found. | Verify the resource path and parameters. |
| `model_not_found` | 404 Not Found | The specified model was not found. | Verify the model name or fall back to a different model. |
| `already_exists` | 409 Conflict | The entity you attempted to create already exists. | Check if the resource already exists before re-creating. |
| `aborted` | 409 Conflict | The operation was aborted due to a conflict or concurrency check failure. | Retry the request at a higher application level. |
| `rate_limit_exceeded` | 429 Too Many Requests | You have exceeded the per-minute or per-second request or token limit. | Wait and retry with exponential backoff. |
| `quota_exceeded` | 429 Too Many Requests | You have exceeded your daily quota. | Wait until the quota resets or request a quota increase. |
| `too_many_requests` | 429 Too Many Requests | You have made too many requests in a short period of time. | Wait and retry with exponential backoff. |
| `cancelled` | 499 Client Closed Request | The client cancelled the request before it completed. | No action needed. This usually means the client disconnected. |
| `api_error` | 500 Internal Server Error | An unexpected error occurred on the server. | Retry the request. If it persists, contact support. |
| `unimplemented` | 501 Not Implemented | The operation or feature is not implemented or supported. | Check API capabilities or switch to a supported feature. |
| `service_unavailable` | 503 Service Unavailable | The service is temporarily overloaded or down. | Wait and retry with exponential backoff. |
| `deadline_exceeded` | 504 Gateway Timeout | The request didn't finish within the deadline. | Remove or increase client deadline setting to use the server default. |

## Generation blocked codes

These error codes indicate that policy, safety, or content restrictions blocked the model's output. When you receive one of these codes, modify your input and retry.

| Code | Description |
| --- | --- |
| `safety` | Safety violations (harmful content) blocked the request. |
| `recitation` | Copyright or recitation restrictions blocked the request. |
| `language` | An unsupported language blocked the request. |
| `prohibited_content` | Prohibited content guidelines blocked the request. |
| `spii` | Sensitive Personally Identifiable Information restrictions blocked the request. |
| `blocklist` | Prohibited terms on a blocklist blocked the request. |
| `image_safety` | Safety violations blocked image generation. |
| `image_prohibited_content` | Prohibited content guidelines blocked image generation. |
| `image_recitation` | Copyright or recitation restrictions blocked image generation. |
| `image_other` | Unspecified reasons blocked image generation. |
| `content_blocked` | An unspecified policy reason blocked the request. |

## Generation error codes

These error codes indicate a structural issue with the model's generated output (such as a malformed function call or an undeclared tool call).

| Code | Description |
| --- | --- |
| `malformed_function_call` | The model produced a function call that could not be parsed. |
| `malformed_tool_call` | The model produced a tool call that could not be parsed. |
| `unexpected_tool_call` | The model called a tool that was not declared in the request. |
| `no_image` | The model was unable to generate an image. |
| `too_many_tool_calls` | The model generated more tool calls than allowed. |
| `missing_thought_signature` | The response is missing a required thought signature. |

## Error response format

All errors from the Interactions API return an `error` object containing a `code` and `message`. For example, passing an unsupported tool type returns:

```
{
  "error": {
    "code": "invalid_request",
    "message": "The value 'invalid_tool_type_xyz' is not supported for 'type' at 'tools[0]'. Supported values: 'function', 'code_execution', 'mcp_server', 'filesystem', 'google_maps', 'google_search', 'bash', 'computer_use', 'file_search', 'url_context'."
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `code` | string | A machine-readable error code in `snake_case`. |
| `message` | string | A human-readable description of what went wrong. |

## How errors are delivered

The API delivers errors differently depending on whether you make a standard HTTP request or a streaming (SSE) request.

### Standard HTTP requests

For standard (non-streaming) requests, the API sets the HTTP response status code (such as `400 Bad Request`, `401 Unauthorized`, or `429 Too Many Requests`) and returns an `error` object in the JSON response body:

```
{
  "error": {
    "code": "invalid_request",
    "message": "The value 'invalid_tool_type_xyz' is not supported for 'type' at 'tools[0]'."
  }
}
```

### Streaming (SSE) requests

For streaming requests (`stream: true`), the API sends error events over the Server-Sent Events (SSE) stream with `event_type` set to `"error"`. The `error` field contains the same `code` and `message` structure:

```
{
  "event_type": "error",
  "error": {
    "code": "not_found",
    "message": "Failed to get completed interaction: Result not found."
  }
}
```

For the full SSE event schema, see the [Interactions API Reference](https://ai.google.dev/api/interactions-api).

## What's next

- [API troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting): Resolve common issues and error scenarios.
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits): Learn about request limits and quota handling.

Was this helpful?



 Send feedback



Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-09-20 UTC.


Need to tell us more?






\[\[\["Easy to understand","easyToUnderstand","thumb-up"\],\["Solved my problem","solvedMyProblem","thumb-up"\],\["Other","otherUp","thumb-up"\]\],\[\["Missing the information I need","missingTheInformationINeed","thumb-down"\],\["Too complicated / too many steps","tooComplicatedTooManySteps","thumb-down"\],\["Out of date","outOfDate","thumb-down"\],\["Samples / code issue","samplesCodeIssue","thumb-down"\],\["Other","otherDown","thumb-down"\]\],\["Last updated 2026-09-20 UTC."\],\[\],\[\]\]
