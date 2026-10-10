---
url: https://developers.openai.com/api/docs/models/gpt-6-luna
retrieved: 2026-10-05
command: firecrawl scrape https://developers.openai.com/api/docs/models/gpt-6-luna --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: GPT-6 Luna Model | OpenAI API
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

OverviewModelsAgentsToolsAudio & voiceProductionAPI referenceDocsModels

- [Model catalog](https://developers.openai.com/api/docs/models)

### Choose a model

- [Pricing](https://developers.openai.com/api/docs/pricing)
- [Model selection](https://developers.openai.com/api/docs/guides/model-selection)

### Text and code

- [Text generation](https://developers.openai.com/api/docs/guides/text)
- [Code generation](https://developers.openai.com/api/docs/guides/code-generation)
- [Structured output](https://developers.openai.com/api/docs/guides/structured-outputs)

### Prompting

- [Overview](https://developers.openai.com/api/docs/guides/prompting)
- [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering)
- [Citation formatting](https://developers.openai.com/api/docs/guides/citation-formatting)
- [Migration guide](https://developers.openai.com/api/docs/guides/prompting/migrate-from-prompt-object)
- [Prompt generation](https://developers.openai.com/api/docs/guides/prompt-generation)
- [Frontend prompting](https://developers.openai.com/api/docs/guides/frontend-prompt)

### Reasoning

- [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)
- [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices)

### Images

- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision)

  - [Image input cost calculator](https://developers.openai.com/api/docs/guides/image-cost-calculator)

- [Image generation](https://developers.openai.com/api/docs/guides/image-generation)

  - [Overview](https://developers.openai.com/api/docs/guides/image-generation)
  - [Image prompting](https://developers.openai.com/api/docs/guides/image-prompting)

### Realtime and audio

- [Audio and speech](https://developers.openai.com/api/docs/guides/audio)
- [Getting started](https://developers.openai.com/api/docs/guides/realtime)
- [Voice agents](https://developers.openai.com/api/docs/guides/voice-agents)

### Specialized models

- [Deep research](https://developers.openai.com/api/docs/guides/deep-research)
- [Embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [Moderation](https://developers.openai.com/api/docs/guides/moderation)

[API Dashboard](https://platform.openai.com/login)

[Try ChatGPT](https://chatgpt.com/)

[Models](https://developers.openai.com/api/docs/models)

![gpt-6-luna](https://developers.openai.com/images/api/models/icons/gpt-6-luna.png)

GPT-6 Luna

Default

Our most efficient model for focused, high-volume tasks.

Our most efficient model for focused, high-volume tasks.

CompareTry in Playground

Reasoning

High

Speed

Fast

Price

$0.1•$0.5

Input•Output

Input

Text, Image

Output

Text

GPT-6 Luna is our most efficient model for focused, high-volume tasks.

`reasoning.effort` supports `none`, `low`, `medium` (default), `high`, `xhigh`, and `max`.
Use the Responses API for built-in tools and function calling. Chat Completions supports function calling only with `reasoning_effort` set to `none`.

EU data residency is available with Standard, Flex, and Batch processing.
See [data residency eligibility](https://developers.openai.com/api/docs/guides/your-data#which-models-and-features-are-eligible-for-data-residency).

1,050,000 context window

128,000 max output tokens

May 18, 2026 knowledge cutoff

Reasoning token support

Pricing

Pricing is based on the number of tokens used, or other metrics based on the model type. For tool-specific models, like search and computer use, there’s a fee per tool call. See details in the [pricing page](https://developers.openai.com/api/docs/pricing).

Text tokens

Per 1M tokens

Input

$0.10

Cached input

$0.01

Cache writes

$0.125

Output

$0.50

Cached input tokens are priced at 10% of the uncached input token rate.

Cache writes are billed at 1.25x the uncached input token rate.

Prompts with more than 272K input tokens are priced at 2x input and cache rates and 1.5x output for the full request.

Regional processing adds a 10% premium where available. EU data residency is available with Standard, Flex, and Batch processing.

Batch and Flex are priced at 50% of Standard rates. Fast mode is priced at 2x the applicable rates.

Modalities

Text

Input and output

Image

Input only

Audio

Not supported

Video

Not supported

Endpoints

Live

v1/live/sessions

Chat Completions

v1/chat/completions

Responses

v1/responses

Realtime

v1/realtime

Realtime translation

v1/realtime/translations

Realtime transcription

v1/realtime/transcription\_sessions

Assistants

v1/assistants

Batch

v1/batch

Fine-tuning

v1/fine-tuning

Embeddings

v1/embeddings

Image generation

v1/images/generations

Videos

v1/videos

Image edit

v1/images/edits

Speech generation

v1/audio/speech

Transcription

v1/audio/transcriptions

Translation

v1/audio/translations

Moderation

v1/moderations

Completions (legacy)

v1/completions

Features

Streaming

Supported

Function calling

Supported

Structured outputs

Supported

Fine-tuning

Not supported

Tools

Tools supported by this model when using the Responses API.

Web search

Supported

File search

Supported

Image generation

Supported

Code interpreter

Supported

Hosted shell

Supported

Apply patch

Supported

Skills

Supported

Computer use

Supported

MCP

Supported

Tool search

Supported

Snapshots

Use `gpt-6-luna` in your API requests.

![gpt-6-luna](https://developers.openai.com/images/api/models/icons/gpt-6-luna.png)

gpt-6-luna

gpt-6-luna

gpt-6-luna

Rate limits

Rate limits ensure fair and reliable access to the API by placing specific caps on requests, tokens, audio duration, or other usage within a given time period. Your usage tier determines how high these limits are set and automatically increases as you send more requests and spend more on the API.

| Tier | RPM | TPM | Batch queue limit |
| --- | --- | --- | --- |
| Free | Not supported |
| Tier 1 | 500 | 500,000 | 5,000,000 |
| Tier 2 | 5,000 | 2,000,000 | 20,000,000 |
| Tier 3 | 5,000 | 4,000,000 | 40,000,000 |
| Tier 4 | 10,000 | 10,000,000 | 1,000,000,000 |
| Tier 5 | 30,000 | 180,000,000 | 15,000,000,000 |

Ask AI

Loading docs agent...
