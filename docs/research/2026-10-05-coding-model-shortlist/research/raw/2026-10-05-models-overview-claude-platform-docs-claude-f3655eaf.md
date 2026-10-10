---
url: https://platform.claude.com/docs/en/models/overview
retrieved: 2026-10-05
command: firecrawl scrape https://platform.claude.com/docs/en/models/overview --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Models overview - Claude Platform Docs
---
## Compare models

If you're unsure which model to use, start with [Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/overview) for most workloads. Use [Claude Fable 5.1](https://platform.claude.com/docs/en/models/fable-5-1/overview) for demanding reasoning and long-horizon agentic work, or when your evals on Claude Opus 5.5 at higher effort still fall short. All current models support text and image input, text output, multilingual capabilities, vision, and tool use. Each model's page lists the platforms it's available on.

| Feature | ![](https://platform.claude.com/images/dashboard-discovery/head.svg)<br>[Claude Fable 5.1](https://platform.claude.com/docs/en/models/fable-5-1/overview) For demanding reasoning and long-horizon agentic work | ![](https://platform.claude.com/images/dashboard-discovery/cursor.svg)<br>[Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/overview) For long-running agentic coding and knowledge work | ![](https://platform.claude.com/images/dashboard-discovery/bubble.svg)<br>[Claude Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview) The best combination of speed and intelligence | ![](https://platform.claude.com/images/dashboard-discovery/bird.svg)<br>[Claude Haiku 4.5](https://platform.claude.com/docs/en/models/haiku-4-5/overview) The fastest model with near-frontier intelligence |
| --- | --- | --- | --- | --- |
| Comparative latency | Slower | Moderate | Fast | Fastest |
| Pricing | $10 / input MTok$50 / output MTok | $4 / input MTok$20 / output MTok | $2 / input MTok$10 / output MTok | $1 / input MTok$5 / output MTok |
| Claude API ID | claude-fable-5-1 | claude-opus-5-5 | claude-sonnet-5-5 | claude-haiku-4-5-20251001 |
| Capabilities |  |
| Thinking | Adaptive (always on) | Adaptive (always on) | Adaptive | Extended |
| Default effort | `high` | `medium` | `high` | Not supported |
| Context window | 1M tokens | 1M tokens | 1M tokens | 200K tokens |
| Max output | 128K tokens | 128K tokens | 128K tokens | 64K tokens |
| Reliable knowledge cutoff | Jun 2026 | Jun 2026 | Jun 2026 | Feb 2025 |
| Additional details |  |
| Training data cutoff | Jun 2026 | Jun 2026 | Jun 2026 | Jul 2025 |
| Retirement | Not sooner than September 1, 2027 | Not sooner than September 22, 2027 | Not sooner than September 28, 2027 | Not sooner than October 15, 2026 |
| Model IDs |  |
| Claude API alias | claude-fable-5-1 | claude-opus-5-5 | claude-sonnet-5-5 | claude-haiku-4-5 |
| Amazon Bedrock ID | anthropic.claude-fable-5-1 | anthropic.claude-opus-5-5 | anthropic.claude-sonnet-5-5 | anthropic.claude-haiku-4-5 |
| Google Cloud ID | claude-fable-5-1 | claude-opus-5-5 | claude-sonnet-5-5 | claude-haiku-4-5@20251001 |
| Microsoft Foundry ID | claude-fable-5-1 | claude-opus-5-5 | claude-sonnet-5-5 | claude-haiku-4-5 |
| Claude Platform on AWS ID | claude-fable-5-1 | claude-opus-5-5 | claude-sonnet-5-5 | claude-haiku-4-5 |

Once you've picked a model, [learn how to make your first API call](https://platform.claude.com/docs/en/get-started). To understand how model IDs, aliases, and snapshots work, see [Model IDs and versioning](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions); for the reliable-knowledge and training-data cutoffs behind each model, see [Anthropic's Transparency Hub](https://www.anthropic.com/transparency).

## Using the Models API

You can query model capabilities and token limits programmatically with the [Models API](https://platform.claude.com/docs/en/api/models/list). The response includes `max_input_tokens`, `max_tokens`, and a `capabilities` object for every available model.

## Prompt and output performance

Current Claude models excel in:

- **Performance:** Top-tier results in reasoning, coding, multilingual tasks, long-context handling, honesty, and image processing. See [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) for general and model-specific prompting guidance.
- **Engaging responses:** Claude models are ideal for applications that require rich, human-like interactions. If you prefer more concise responses, adjust your prompts to guide the model toward the desired output length. Refer to the [prompt engineering guides](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering) for details.
- **Output quality:** When migrating from a previous model generation, you may notice larger improvements in overall performance. If you're on Claude Opus 5 or earlier, see [Migrating to Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide).

## Get started with Claude

If you're ready to start exploring what Claude can do for you, dive in! Whether you're a developer looking to integrate Claude into your applications or a user wanting to experience the power of AI firsthand, the following resources can help.



[Intro to Claude](https://platform.claude.com/docs/en/intro)

Explore Claude's capabilities and development flow.



[Quickstart](https://platform.claude.com/docs/en/get-started)

Learn how to make your first API call in minutes.

[Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)

Establish criteria and pick the right model for your use case.

[Pricing](https://platform.claude.com/docs/en/about-claude/pricing)

Complete pricing, including batch discounts and prompt caching rates.



[Model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)

Lifecycle status and retirement commitments for every model.



[Claude Console](https://platform.claude.com/)

Craft and test prompts directly in your browser.

Looking to chat with Claude? Visit [claude.ai](https://claude.ai/). If you have questions, reach out to the [support team](https://support.claude.com/) or the [Discord community](https://www.anthropic.com/discord).

Was this page helpful?



Ask Docs
