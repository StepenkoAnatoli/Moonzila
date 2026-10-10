---
url: https://gorilla.cs.berkeley.edu/leaderboard.html
retrieved: 2026-10-05
command: firecrawl scrape https://gorilla.cs.berkeley.edu/leaderboard.html --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title:          Berkeley Function Calling Leaderboard (BFCL) V4     
---
# ![UC Berkeley Logo](https://gorilla.cs.berkeley.edu/assets/img/Cal.png)  Berkeley Function-Calling Leaderboard

## BFCL: From Tool Use to Agentic Evaluation of Large Language Models

The Berkeley Function Calling Leaderboard (BFCL) V4
evaluates the
LLM's ability to call functions (aka tools) accurately. This
leaderboard consists of real-world data and will be updated periodically. For more information on the
evaluation dataset and methodology, please refer to our blogs: [BFCL-v1](https://gorilla.cs.berkeley.edu/blogs/8_berkeley_function_calling_leaderboard.html) introducing AST as an
evaluation metric,
[BFCL-v2](https://gorilla.cs.berkeley.edu/blogs/12_bfcl_v2_live.html) introducing enterprise and OSS-contributed functions,
[BFCL-v3](https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html) introducing multi-turn interactions, and
[BFCL-v4](https://gorilla.cs.berkeley.edu/blogs/15_bfcl_v4_web_search.html) introducing holistic agentic evaluation. Checkout [code and\\
data](https://github.com/ShishirPatil/gorilla/tree/main/berkeley-function-call-leaderboard).


**_Last Updated:_**
**_2026-04-12      [\[Change\_**\
**_Log\]](https://github.com/ShishirPatil/gorilla/blob/main/berkeley-function-call-leaderboard/CHANGELOG.md)_**

Search

|  |  | Agentic | Multi Turn | Single Turn | Hallucination Measurement | Format Sensitivity |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  | Web Search | Memory | Multi turn | Non-live (AST) | Live (AST) |  |  | Latency (s) |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rank 🔼 | Overall Acc | Model | Cost ($) | Overall Acc | Base | No Snippet | Overall Acc | KV | Vector | Recursive Sum | Overall Acc | Base | Miss Func | Miss Param | Long Context | Overall Acc | Simple | Multiple | Parallel | Multiple Parallel | Overall Acc | Simple | Multiple | Parallel | Multiple Parallel | Relevance | Irrelevance | Max Delta | SD | Mean | SD | P95 | Organization | License |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 77.47 | [Claude-Opus-4-5-20251101 (FC)](https://www.anthropic.com/news/claude-4) | 86.55 | 84.5 | 84 | 85 | 73.76 | 70.97 | 72.9 | 77.42 | 68.38 | 81 | 64 | 58 | 70.5 | 88.58 | 76.83 | 95.5 | 93.5 | 88.5 | 79.79 | 86.43 | 78.16 | 87.5 | 75 | 62.5 | 84.72 | N/A | N/A | 4.38 | 3.13 | 7.56 | Anthropic | Proprietary |
| 2 | 73.24 | [Claude-Sonnet-4-5-20250929 (FC)](https://www.anthropic.com/news/claude-sonnet-4-5) | 43.73 | 81 | 82 | 80 | 64.95 | 54.19 | 57.42 | 83.23 | 61.37 | 69 | 65 | 52.5 | 59 | 88.65 | 72.58 | 95.5 | 94.5 | 92 | 81.13 | 89.53 | 78.92 | 87.5 | 83.33 | 68.75 | 86.61 | N/A | N/A | 4.31 | 4.43 | 7.27 | Anthropic | Proprietary |
| 3 | 72.51 | [Gemini-3-Pro-Preview (Prompt)](https://deepmind.google/technologies/gemini/pro/) | 298.47 | 80 | 78 | 82 | 61.72 | 59.35 | 62.58 | 63.23 | 60.75 | 64.5 | 60 | 54.5 | 64 | 90.65 | 79.58 | 96 | 95 | 92 | 83.12 | 87.6 | 81.77 | 93.75 | 87.5 | 68.75 | 85.59 | 8.5 | 1.7 | 12.08 | 21.3 | 32.73 | Google | Proprietary |
| 4 | 72.38 | [GLM-4.6 (FC thinking)](https://huggingface.co/zai-org/GLM-4.6) | 4.64 | 77.5 | 79 | 76 | 55.7 | 43.87 | 56.13 | 67.1 | 68 | 74.5 | 68 | 63 | 66.5 | 87.56 | 74.25 | 95 | 91.5 | 89.5 | 80.9 | 89.53 | 78.92 | 81.25 | 75 | 75 | 84.96 | N/A | N/A | 4.34 | 7.22 | 13.5 | Zhipu AI | MIT |
| 5 | 69.57 | [Grok-4-1-fast-reasoning (FC)](https://docs.x.ai/docs/models) | 17.26 | 82.5 | 82 | 83 | 53.98 | 41.29 | 57.42 | 63.23 | 58.87 | 70.5 | 59.5 | 43 | 62.5 | 88.27 | 77.58 | 93 | 92.5 | 90 | 78.46 | 84.11 | 77.3 | 75 | 70.83 | 81.25 | 79.43 | N/A | N/A | 6.74 | 12.78 | 17.57 | xAI | Proprietary |
| 6 | 68.7 | [Claude-Haiku-4-5-20251001 (FC)](https://www.anthropic.com/news/claude-haiku-4-5) | 14.23 | 83.5 | 86 | 81 | 54.41 | 51.61 | 55.48 | 56.13 | 53.62 | 63.5 | 42.5 | 52.5 | 56 | 86.5 | 71 | 94 | 92.5 | 88.5 | 78.68 | 83.72 | 77.59 | 75 | 75 | 62.5 | 85.11 | N/A | N/A | 1.68 | 3.92 | 3.15 | Anthropic | Proprietary |
| 7 | 68.14 | [Gemini-3-Pro-Preview (FC)](https://deepmind.google/technologies/gemini/pro/) | 224.69 | 68.5 | 63 | 74 | 54.84 | 50.32 | 63.23 | 50.97 | 63.12 | 69 | 63 | 56.5 | 64 | 85.75 | 75.5 | 94 | 91 | 82.5 | 81.72 | 87.6 | 80.44 | 75 | 79.17 | 75 | 77.85 | N/A | N/A | 15.87 | 41.41 | 58.48 | Google | Proprietary |
| 8 | 63.05 | [o3-2025-04-16 (Prompt)](https://openai.com/index/introducing-o3-and-o4-mini/) | 234.64 | 50.5 | 51 | 50 | 51.83 | 33.55 | 50.32 | 71.61 | 62.25 | 68 | 63.5 | 54.5 | 63 | 81.94 | 74.25 | 89 | 86.5 | 78 | 73.21 | 83.33 | 70.75 | 75 | 70.83 | 93.75 | 83.98 | 8.5 | 2.75 | 4.83 | 7.01 | 11.7 | OpenAI | Proprietary |
| 9 | 62.97 | [Grok-4-0709 (Prompt)](https://docs.x.ai/docs/models) | 348.19 | 74 | 74 | 74 | 50.54 | 43.87 | 59.35 | 48.39 | 47 | 55.5 | 46 | 36 | 50.5 | 82.75 | 67 | 93.5 | 89 | 81.5 | 72.54 | 81.78 | 70.18 | 81.25 | 70.83 | 81.25 | 84.3 | 13.0 | 2.88 | 30.38 | 36.19 | 101.54 | xAI | Proprietary |
| 10 | 61.38 | [Grok-4-0709 (FC)](https://docs.x.ai/docs/models) | 355.17 | 82 | 80 | 84 | 55.91 | 57.42 | 58.71 | 51.61 | 33.88 | 44 | 19 | 28.5 | 44 | 85.38 | 73.5 | 92.5 | 88.5 | 87 | 75.57 | 82.17 | 73.88 | 75 | 79.17 | 87.5 | 75.4 | N/A | N/A | 15.49 | 26.22 | 44.28 | xAI | Proprietary |
| 11 | 59.06 | [Moonshotai-Kimi-K2-Instruct (FC)](https://huggingface.co/moonshotai/Kimi-K2-Instruct) | 6.19 | 66.5 | 72 | 61 | 29.03 | 21.94 | 20 | 45.16 | 50.63 | 62 | 41 | 44.5 | 55 | 81.6 | 69.42 | 92 | 82 | 83 | 78.68 | 81.78 | 78.06 | 87.5 | 66.67 | 75 | 87.34 | N/A | N/A | 6.4 | 9.38 | 13.78 | MoonshotAI | modified-mit |
| 12 | 58.29 | [Grok-4-1-fast-non-reasoning (FC)](https://docs.x.ai/docs/models) | 16.27 | 75 | 74 | 76 | 26.24 | 20.65 | 20 | 38.06 | 46.75 | 58 | 39.5 | 37.5 | 52 | 88.13 | 76 | 93 | 93 | 90.5 | 77.94 | 82.95 | 76.92 | 75 | 70.83 | 81.25 | 74.09 | N/A | N/A | 2.29 | 7.31 | 5.34 | xAI | Proprietary |
| 13 | 57.06 | [Command A Reasoning (FC)](https://cohere.com/blog/command-a-reasoning) | 3.04 | 55.5 | 65 | 46 | 28.82 | 16.13 | 23.87 | 46.45 | 50.12 | 61.5 | 41 | 49.5 | 48.5 | 86.27 | 73.58 | 93.5 | 89.5 | 88.5 | 78.61 | 80.23 | 78.35 | 75 | 75 | 68.75 | 86.75 | N/A | N/A | 3.44 | 4.91 | 8.39 | Cohere | CC-BY-NC 4.0 License (w/ Acceptable Use Addendum) |
| 14 | 56.73 | [DeepSeek-V3.2-Exp (Prompt + Thinking)](https://api-docs.deepseek.com/news/news250528) | 57.75 | 58 | 64 | 52 | 44.09 | 46.45 | 46.45 | 39.35 | 44.88 | 55 | 49 | 27 | 48.5 | 85.52 | 74.08 | 92 | 89.5 | 86.5 | 76.02 | 82.56 | 74.74 | 87.5 | 54.17 | 93.75 | 67 | 10.0 | 2.77 | 37.89 | 49.56 | 102.09 | DeepSeek | MIT |
| 15 | 56.24 | [Gemini-2.5-Flash (FC)](https://deepmind.google/technologies/gemini/flash/) | 26.36 | 59 | 59 | 59 | 41.29 | 19.35 | 50.32 | 54.19 | 36.25 | 41.5 | 36 | 32 | 35.5 | 84.96 | 74.33 | 92 | 94 | 79.5 | 74.39 | 85.27 | 71.7 | 81.25 | 70.83 | 75 | 93.67 | N/A | N/A | 2.99 | 9.22 | 5.62 | Google | Proprietary |
| 16 | 55.87 | [GPT-5.2-2025-12-11 (FC)](https://openai.com/zh-Hans-CN/index/introducing-gpt-5-2/) | 85.65 | 75.5 | 78 | 73 | 45.81 | 33.55 | 43.23 | 60.65 | 28.12 | 36.5 | 18 | 27.5 | 30.5 | 81.85 | 72.92 | 88 | 89 | 77.5 | 70.39 | 71.71 | 70.37 | 68.75 | 58.33 | 75 | 79.42 | N/A | N/A | 2.23 | 9.75 | 5.26 | OpenAI | Proprietary |
| 17 | 55.46 | [GPT-5-mini-2025-08-07 (FC)](https://openai.com/index/introducing-gpt-5/) | 22.18 | 82 | 87 | 77 | 44.3 | 36.77 | 43.87 | 52.26 | 27.5 | 36.5 | 17 | 23.5 | 33 | 69.85 | 59.92 | 69 | 80 | 70.5 | 58.62 | 62.02 | 58.02 | 62.5 | 45.83 | 62.5 | 91.01 | N/A | N/A | 8.32 | 17.35 | 19.8 | OpenAI | Proprietary |
| 18 | 54.66 | [xLAM-2-32b-fc-r (FC)](https://huggingface.co/Salesforce/xLAM-2-32b-fc-r) | 6.0 | 25.5 | 37 | 14 | 20.86 | 6.45 | 10.32 | 45.81 | 69.5 | 81.5 | 72.5 | 67.5 | 56.5 | 89.6 | 80.42 | 94 | 93 | 91 | 75.5 | 82.17 | 74.64 | 50 | 58.33 | 81.25 | 80.23 | N/A | N/A | 6.94 | 8.21 | 17.66 | Salesforce | cc-by-nc-4.0 |
| 19 | 54.12 | [DeepSeek-V3.2-Exp (FC)](https://api-docs.deepseek.com/news/news250528) | 6.71 | 69.5 | 80 | 59 | 54.19 | 41.94 | 61.29 | 59.35 | 37.38 | 41.5 | 39.5 | 33.5 | 35 | 34.85 | 37.92 | 74 | 15 | 12.5 | 53.66 | 66.28 | 51.66 | 25 | 25 | 37.5 | 93.18 | N/A | N/A | 5.83 | 11.71 | 10.59 | DeepSeek | MIT |
| 20 | 53.96 | [GPT-4.1-2025-04-14 (FC)](https://openai.com/index/gpt-4-1/) | 100.75 | 68 | 67 | 69 | 23.87 | 16.13 | 18.06 | 37.42 | 38.88 | 47.5 | 32.5 | 32.5 | 43 | 82.79 | 72.67 | 89 | 88 | 81.5 | 69.95 | 69.38 | 70.28 | 56.25 | 70.83 | 87.5 | 86.52 | N/A | N/A | 1.63 | 3.05 | 4.01 | OpenAI | Proprietary |
| 21 | 53.24 | [o4-mini-2025-04-16 (FC)](https://openai.com/index/introducing-o3-and-o4-mini/) | 81.91 | 75.5 | 75 | 76 | 34.19 | 19.35 | 24.52 | 58.71 | 41.75 | 51 | 30 | 40.5 | 45.5 | 37.73 | 66.92 | 84 | 0 | 0 | 66.1 | 69.38 | 67.81 | 0 | 0 | 81.25 | 83.91 | N/A | N/A | 3.71 | 7.18 | 9.33 | OpenAI | Proprietary |
| 22 | 53.07 | [xLAM-2-70b-fc-r (FC)](https://huggingface.co/Salesforce/Llama-xLAM-2-70b-fc-r) | 25.1 | 15 | 17 | 13 | 14.41 | 2.58 | 10.97 | 29.68 | 77.38 | 82.5 | 77 | 74 | 76 | 88.44 | 78.25 | 94 | 92 | 89.5 | 72.17 | 77.91 | 71.13 | 68.75 | 58.33 | 75 | 79.11 | N/A | N/A | 28.06 | 68.77 | 91.21 | Salesforce | cc-by-nc-4.0 |
| 23 | 52.15 | [Qwen3-235B-A22B-Instruct-2507 (Prompt)](https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507) | 3.12 | 50.5 | 56 | 45 | 19.35 | 12.9 | 11.61 | 33.55 | 44.62 | 54 | 42.5 | 31.5 | 50.5 | 90.33 | 79.83 | 95 | 95.5 | 91 | 78.68 | 82.95 | 77.78 | 81.25 | 70.83 | 93.75 | 78.89 | 8.0 | 1.95 | 2.56 | 2.75 | 7.61 | Qwen | apache-2.0 |
| 24 | 51.45 | [GPT-5-nano-2025-08-07 (FC)](https://openai.com/index/introducing-gpt-5/) | 8.79 | 72.5 | 74 | 71 | 24.73 | 18.06 | 27.1 | 29.03 | 34.5 | 44 | 23.5 | 32.5 | 38 | 68 | 57 | 64.5 | 79 | 71.5 | 59.44 | 58.91 | 59.83 | 50 | 54.17 | 75 | 89.1 | N/A | N/A | 10.36 | 10.37 | 23.56 | OpenAI | Proprietary |
| 25 | 51.4 | [Nanbeige4-3B-Thinking-2511 (FC)](https://huggingface.co/Nanbeige/Nanbeige4-3B-Thinking-2511) | 14.14 | 21.5 | 31 | 12 | 36.77 | 31.61 | 34.19 | 44.52 | 51.12 | 58.5 | 54 | 45 | 47 | 81.58 | 63.83 | 93.5 | 84.5 | 84.5 | 79.42 | 86.05 | 78.06 | 75 | 70.83 | 75 | 83.09 | N/A | N/A | 13.46 | 26.41 | 37.45 | Nanbeige | apache-2.0 |
| 26 | 50.9 | [Gemini-2.5-Flash (Prompt)](https://deepmind.google/technologies/gemini/flash/) | 33.45 | 62 | 60 | 64 | 38.71 | 13.55 | 47.1 | 55.48 | 16.75 | 14.5 | 16.5 | 17.5 | 18.5 | 88.08 | 77.33 | 91.5 | 96 | 87.5 | 78.16 | 87.21 | 75.97 | 81.25 | 75 | 62.5 | 91.09 | 9.0 | 2.45 | 3.18 | 4.44 | 6.09 | Google | Proprietary |
| 27 | 50.45 | [GPT-4.1-mini-2025-04-14 (FC)](https://openai.com/index/gpt-4-1/) | 19.25 | 57 | 62 | 52 | 26.88 | 22.58 | 16.13 | 41.94 | 34.13 | 43.5 | 22.5 | 30.5 | 40 | 83.83 | 73.33 | 89 | 91 | 82 | 68.84 | 67.05 | 69.8 | 43.75 | 62.5 | 81.25 | 81.69 | N/A | N/A | 1.32 | 3.65 | 2.4 | OpenAI | Proprietary |
| 28 | 50.26 | [o4-mini-2025-04-16 (Prompt)](https://openai.com/index/introducing-o3-and-o4-mini/) | 133.63 | 71.5 | 73 | 70 | 35.27 | 22.58 | 25.16 | 58.06 | 16.62 | 16.5 | 18 | 17.5 | 14.5 | 81.29 | 72.67 | 88 | 84.5 | 80 | 70.76 | 79.46 | 68.76 | 75 | 62.5 | 81.25 | 87.16 | 9.5 | 2.6 | 4.47 | 5.19 | 10.19 | OpenAI | Proprietary |
| 29 | 48.71 | [Qwen3-32B (FC)](https://huggingface.co/Qwen/Qwen3-32B) | 153.08 | 21.5 | 25 | 18 | 26.67 | 12.26 | 25.81 | 41.94 | 47.87 | 56 | 52.5 | 40 | 43 | 88.77 | 75.58 | 94.5 | 93.5 | 91.5 | 82.01 | 89.53 | 80.91 | 81.25 | 50 | 93.75 | 76.37 | N/A | N/A | 169.87 | 164.27 | 473.49 | Qwen | apache-2.0 |
| 30 | 48.56 | [o3-2025-04-16 (FC)](https://openai.com/index/introducing-o3-and-o4-mini/) | 133.45 | 77 | 79 | 75 | 47.31 | 24.52 | 44.52 | 72.9 | 14.75 | 16.5 | 11.5 | 14.5 | 16.5 | 40.38 | 74.5 | 87 | 0 | 0 | 66.17 | 70.54 | 67.62 | 0 | 0 | 81.25 | 86.13 | N/A | N/A | 3.5 | 8.69 | 8.39 | OpenAI | Proprietary |
| 31 | 47.99 | [Qwen3-235B-A22B-Instruct-2507 (FC)](https://huggingface.co/Qwen/Qwen3-235B-A22B-Instruct-2507) | 2.5 | 54 | 57 | 51 | 23.87 | 7.1 | 18.71 | 45.81 | 45.38 | 57.5 | 35 | 33.5 | 55.5 | 37.4 | 40.58 | 36.5 | 53 | 19.5 | 68.91 | 58.53 | 71.6 | 68.75 | 62.5 | 87.5 | 81.73 | N/A | N/A | 2.57 | 2.44 | 6.27 | Qwen | apache-2.0 |
| 32 | 47.68 | [Nanbeige3.5-Pro-Thinking (FC)](https://huggingface.co/Nanbeige) | 23.46 | 42 | 47 | 37 | 45.16 | 38.06 | 58.06 | 39.35 | 40 | 56 | 34 | 29 | 41 | 38.35 | 43.92 | 36.5 | 53 | 20 | 69.95 | 63.18 | 71.42 | 87.5 | 66.67 | 100 | 74.2 | N/A | N/A | 21.12 | 28.61 | 63.29 | Nanbeige | apache-2.0 |
| 33 | 46.78 | [Qwen3-32B (Prompt)](https://huggingface.co/Qwen/Qwen3-32B) | 199.47 | 26 | 34 | 18 | 15.7 | 13.55 | 14.19 | 19.35 | 43.25 | 54 | 46 | 36.5 | 36.5 | 90.27 | 79.08 | 97 | 93.5 | 91.5 | 82.01 | 87.21 | 81.2 | 81.25 | 62.5 | 81.25 | 82.39 | 15.5 | 3.75 | 167.54 | 160.5 | 457.87 | Qwen | apache-2.0 |
| 34 | 46.68 | [xLAM-2-8b-fc-r (FC)](https://huggingface.co/Salesforce/Llama-xLAM-2-8b-fc-r) | 20.92 | 6.5 | 11 | 2 | 13.98 | 5.81 | 15.48 | 20.65 | 70 | 76 | 72 | 65 | 67 | 84.58 | 73.83 | 93.5 | 87.5 | 83.5 | 67.95 | 75.58 | 66.57 | 56.25 | 54.17 | 87.5 | 63.28 | N/A | N/A | 22.65 | 46.92 | 108.81 | Salesforce | cc-by-nc-4.0 |
| 35 | 46.49 | [Command A (FC)](https://cohere.com/blog/command-a) | 91.37 | 46.5 | 60 | 33 | 16.56 | 4.52 | 5.16 | 40 | 29.5 | 38 | 23 | 32 | 25 | 87.56 | 75.75 | 93 | 93.5 | 88 | 78.53 | 85.66 | 76.92 | 81.25 | 70.83 | 81.25 | 84.19 | N/A | N/A | 2.09 | 7.36 | 4.94 | Cohere | CC-BY-NC 4.0 License (w/ Acceptable Use Addendum) |
| 36 | 46.23 | [BitAgent-Bounty-8B](https://huggingface.co/BitAgent/BitAgent-Bounty-8B) | 18.02 | 0 | 0 | 0 | 1.51 | 1.29 | 1.29 | 1.94 | 62.38 | 75 | 49.5 | 68 | 57 | 81.6 | 72.42 | 93 | 83 | 78 | 93.12 | 90.31 | 94.02 | 75 | 95.83 | 68.75 | 97.48 | N/A | N/A | 16.52 | 30.73 | 77.12 | Bittensor | Apache-2.0 |
| 37 | 45.37 | [Arch-Agent-32B](https://huggingface.co/katanemo/Arch-Agent-32B) | 8.87 | 5 | 4 | 6 | 14.62 | 5.81 | 9.03 | 29.03 | 54.25 | 64.5 | 58 | 53 | 41.5 | 88.92 | 76.67 | 94 | 96 | 89 | 80.68 | 86.43 | 79.11 | 93.75 | 79.17 | 81.25 | 82.15 | N/A | N/A | 9.44 | 21.44 | 24.87 | katanemo | katanemo-research |
| 38 | 45.27 | [GPT-5.2-2025-12-11 (Prompt)](https://openai.com/zh-Hans-CN/index/introducing-gpt-5-2/) | 164.58 | 40.5 | 45 | 36 | 3.87 | 2.58 | 1.94 | 7.1 | 43.75 | 54.5 | 40.5 | 33.5 | 46.5 | 78.29 | 71.17 | 83.5 | 84 | 74.5 | 67.14 | 77.91 | 64.58 | 75 | 58.33 | 75 | 87.26 | 13.0 | 3.25 | 4.21 | 20.93 | 10.58 | OpenAI | Proprietary |
| 39 | 42.57 | [Qwen3-8B (FC)](https://huggingface.co/Qwen/Qwen3-8B) | 43.32 | 12 | 15 | 9 | 14.62 | 5.16 | 7.1 | 31.61 | 41.75 | 50.5 | 42 | 40 | 34.5 | 87.58 | 72.83 | 96.5 | 92 | 89 | 80.53 | 84.5 | 79.68 | 75 | 79.17 | 93.75 | 79.07 | N/A | N/A | 51.36 | 76.14 | 188.98 | Qwen | apache-2.0 |
| 40 | 42.44 | [ToolACE-2-8B (FC)](https://huggingface.co/Team-ACE/ToolACE-2-8B) | 24.43 | 8.5 | 13 | 4 | 18.49 | 5.81 | 16.13 | 33.55 | 38.38 | 49 | 28 | 30.5 | 46 | 87.1 | 73.42 | 91 | 93 | 91 | 77.42 | 71.32 | 79.39 | 68.75 | 62.5 | 75 | 90.79 | 81.5 | 27.92 | 15.95 | 40.06 | 65.26 | Huawei Noah & USTC | Apache-2.0 |
| 41 | 41.39 | [Qwen3-30B-A3B-Instruct-2507 (FC)](https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507) | 5.62 | 22.5 | 21 | 24 | 17.63 | 9.03 | 9.03 | 34.84 | 30 | 43.5 | 10.5 | 25 | 41 | 85.77 | 68.58 | 94.5 | 91.5 | 88.5 | 77.94 | 83.33 | 76.83 | 68.75 | 75 | 81.25 | 79.9 | N/A | N/A | 5.95 | 25.48 | 12.7 | Qwen | apache-2.0 |
| 42 | 41.22 | [xLAM-2-3b-fc-r (FC)](https://huggingface.co/Salesforce/xLAM-2-3b-fc-r) | 3.36 | 2.5 | 3 | 2 | 11.4 | 5.81 | 5.81 | 22.58 | 58.38 | 71.5 | 59 | 57.5 | 45.5 | 82.96 | 75.33 | 91 | 86.5 | 79 | 62.92 | 73.26 | 60.68 | 62.5 | 50 | 87.5 | 63.45 | N/A | N/A | 3.8 | 3.59 | 8.79 | Salesforce | cc-by-nc-4.0 |
| 43 | 41.03 | [Qwen3-14B (FC)](https://huggingface.co/Qwen/Qwen3-14B) | 3.38 | 10 | 8 | 12 | 19.57 | 7.1 | 16.77 | 34.84 | 34.75 | 39 | 34 | 33.5 | 32.5 | 84.94 | 74.75 | 93 | 80 | 92 | 80.01 | 85.66 | 79.01 | 68.75 | 70.83 | 87.5 | 81.94 | N/A | N/A | 4.5 | 18.84 | 13.34 | Qwen | apache-2.0 |
| 44 | 40.43 | [Qwen3-8B (Prompt)](https://huggingface.co/Qwen/Qwen3-8B) | 63.95 | 13.5 | 19 | 8 | 13.12 | 3.87 | 10.32 | 25.16 | 33.38 | 41.5 | 38.5 | 27 | 26.5 | 88.56 | 75.25 | 95 | 94.5 | 89.5 | 80.09 | 84.5 | 78.92 | 93.75 | 75 | 75 | 82.27 | 16.5 | 5.09 | 54.17 | 79.9 | 194.15 | Qwen | apache-2.0 |
| 45 | 39.38 | [GPT-4.1-2025-04-14 (Prompt)](https://openai.com/index/gpt-4-1/) | 145.85 | 35 | 40 | 30 | 21.51 | 9.68 | 19.35 | 35.48 | 9.75 | 10.5 | 11 | 8 | 9.5 | 88.69 | 78.25 | 93.5 | 94 | 89 | 78.9 | 84.88 | 77.4 | 87.5 | 75 | 100 | 83.99 | 23.5 | 6.18 | 1.2 | 3.23 | 2.53 | OpenAI | Proprietary |
| 46 | 38.37 | [mistral-large-2411 (FC)](https://docs.mistral.ai/guides/model-selection/) | 115.98 | 28 | 41 | 15 | 24.95 | 18.71 | 29.03 | 27.1 | 14.12 | 18.5 | 11.5 | 13 | 13.5 | 84.65 | 72.08 | 93.5 | 89.5 | 83.5 | 81.87 | 87.21 | 80.72 | 81.25 | 75 | 93.75 | 68.92 | N/A | N/A | 2.04 | 4.02 | 4.68 | Mistral AI | Proprietary |
| 47 | 37.77 | [Qwen3-14B (Prompt)](https://huggingface.co/Qwen/Qwen3-14B) | 1.35 | 10.5 | 6 | 15 | 11.18 | 4.52 | 6.45 | 22.58 | 26.13 | 16.5 | 37.5 | 31 | 19.5 | 89.46 | 76.83 | 93.5 | 95.5 | 92 | 79.35 | 84.5 | 78.06 | 87.5 | 75 | 81.25 | 87.18 | 14.0 | 3.97 | 1.2 | 8.5 | 2.3 | Qwen | apache-2.0 |
| 48 | 37.69 | [Mistral-Medium-2505](https://docs.mistral.ai/guides/model-selection/) | 36.51 | 39 | 41 | 37 | 21.72 | 16.13 | 14.84 | 34.19 | 9.88 | 13.5 | 6.5 | 6 | 13.5 | 85.33 | 76.33 | 91 | 88.5 | 85.5 | 66.03 | 80.23 | 62.39 | 81.25 | 62.5 | 75 | 74.49 | 21.5 | 5.02 | 1.21 | 3.5 | 2.86 | Mistral AI | Proprietary |
| 49 | 37.56 | [Mistral-Medium-2505 (FC)](https://docs.mistral.ai/guides/model-selection/) | 18.8 | 35 | 36 | 34 | 23.01 | 15.48 | 20 | 33.55 | 10.75 | 15.5 | 7 | 7.5 | 13 | 67.44 | 39.75 | 78 | 83 | 69 | 67.95 | 67.05 | 68.09 | 81.25 | 62.5 | 62.5 | 91.95 | N/A | N/A | 1.6 | 4.44 | 4.19 | Mistral AI | Proprietary |
| 50 | 37.29 | [Llama-4-Maverick-17B-128E-Instruct-FP8 (FC)](https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8) | 18.25 | 28 | 39 | 17 | 18.92 | 8.39 | 32.9 | 15.48 | 20.25 | 27 | 22 | 14 | 18 | 88.65 | 77.08 | 95 | 94 | 88.5 | 73.65 | 84.5 | 71.04 | 75 | 70.83 | 100 | 55.97 | N/A | N/A | 18.43 | 34.11 | 102.75 | Meta | Meta Llama 4 Community |
| 51 | 37.15 | [Mistral-small-2506 (FC)](https://docs.mistral.ai/guides/model-selection/) | 5.2 | 31 | 37 | 25 | 18.06 | 8.39 | 14.19 | 31.61 | 11.5 | 17.5 | 6 | 10.5 | 12 | 73.6 | 38.92 | 93.5 | 83.5 | 78.5 | 77.28 | 69.38 | 79.39 | 75 | 70.83 | 87.5 | 87.94 | N/A | N/A | 1.48 | 18.25 | 2.5 | Mistral AI | Proprietary |
| 52 | 36.87 | [Gemini-2.5-Flash-Lite (FC)](https://deepmind.google/technologies/gemini/flash-lite/) | 7.55 | 21 | 26 | 16 | 20.65 | 3.87 | 6.45 | 51.61 | 13.5 | 20 | 1.5 | 15 | 17.5 | 86.6 | 70.92 | 90 | 93.5 | 92 | 65.8 | 73.26 | 63.82 | 75 | 66.67 | 43.75 | 92.5 | N/A | N/A | 1.18 | 8.06 | 1.67 | Google | Proprietary |
| 53 | 36.7 | [Qwen3-30B-A3B-Instruct-2507 (Prompt)](https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507) | 1.56 | 17.5 | 15 | 20 | 9.68 | 5.81 | 6.45 | 16.77 | 23.5 | 33 | 16 | 16 | 29 | 88.92 | 80.67 | 93 | 94 | 88 | 78.39 | 82.56 | 77.49 | 87.5 | 66.67 | 93.75 | 74.85 | 16.0 | 4.13 | 1.24 | 7.9 | 2.84 | Qwen | apache-2.0 |
| 54 | 35.68 | [Qwen3-4B-Instruct-2507 (FC)](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) | 6.37 | 3 | 4 | 2 | 17.63 | 16.13 | 12.26 | 24.52 | 22.12 | 26.5 | 21 | 15.5 | 25.5 | 87.88 | 75.5 | 93.5 | 92.5 | 90 | 76.39 | 79.07 | 76.16 | 62.5 | 66.67 | 87.5 | 84.93 | N/A | N/A | 7.61 | 20.36 | 49.18 | Qwen | apache-2.0 |
| 55 | 35.52 | [Qwen3-4B-Instruct-2507 (Prompt)](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) | 53.66 | 4.5 | 4 | 5 | 23.87 | 12.9 | 14.19 | 44.52 | 20.5 | 24.5 | 21.5 | 16 | 20 | 86.44 | 77.25 | 91 | 88 | 89.5 | 74.69 | 77.91 | 74.17 | 81.25 | 58.33 | 87.5 | 75.87 | 18.0 | 5.22 | 44.7 | 163.79 | 208.06 | Qwen | apache-2.0 |
| 56 | 35.36 | [Arch-Agent-3B](https://huggingface.co/katanemo/Arch-Agent-3B) | 3.7 | 0.5 | 1 | 0 | 6.88 | 5.16 | 5.81 | 9.68 | 34.88 | 42 | 37.5 | 31 | 29 | 86.67 | 78.67 | 94.5 | 91 | 82.5 | 72.91 | 75.58 | 72.27 | 68.75 | 75 | 68.75 | 74.67 | N/A | N/A | 3.56 | 6.65 | 8.19 | katanemo | katanemo-research |
| 57 | 33.47 | [Claude-Opus-4-5-20251101 (Prompt)](https://www.anthropic.com/news/claude-4) | 88.33 | 13 | 13 | 13 | 1.94 | 1.29 | 1.94 | 2.58 | 16.12 | 20.5 | 9 | 21.5 | 13.5 | 89.65 | 79.58 | 93.5 | 93 | 92.5 | 76.02 | 84.5 | 74.17 | 81.25 | 62.5 | 68.75 | 90.75 | 13.0 | 3.65 | 3.76 | 13.19 | 5.52 | Anthropic | Proprietary |
| 58 | 33.05 | [GPT-4.1-nano-2025-04-14 (FC)](https://openai.com/index/gpt-4-1/) | 5.66 | 11 | 13 | 9 | 18.92 | 10.32 | 19.35 | 27.1 | 23.62 | 39.5 | 7.5 | 17.5 | 30 | 72.98 | 59.92 | 79.5 | 84 | 68.5 | 60.77 | 58.14 | 61.44 | 68.75 | 54.17 | 93.75 | 66 | N/A | N/A | 1.44 | 10.84 | 2.26 | OpenAI | Proprietary |
| 59 | 32.38 | [Mistral-Small-2506 (Prompt)](https://docs.mistral.ai/guides/model-selection/) | 6.91 | 7.5 | 9 | 6 | 15.05 | 2.58 | 11.61 | 30.97 | 14.75 | 20.5 | 17 | 9.5 | 12 | 89.69 | 78.75 | 96 | 92.5 | 91.5 | 79.05 | 81.4 | 78.54 | 93.75 | 66.67 | 93.75 | 65.73 | 50.0 | 13.57 | 0.92 | 6.79 | 2.02 | Mistral AI | Proprietary |
| 60 | 32.14 | [Arch-Agent-1.5B](https://huggingface.co/katanemo/Arch-Agent-1.5B) | 2.45 | 0 | 0 | 0 | 8.17 | 5.81 | 5.81 | 12.9 | 26.62 | 35.5 | 27.5 | 21.5 | 22 | 82.67 | 72.17 | 92 | 85.5 | 81 | 67.73 | 70.54 | 67.81 | 31.25 | 58.33 | 75 | 74.83 | N/A | N/A | 2.38 | 4.01 | 5.3 | katanemo | katanemo-research |
| 61 | 32.07 | [Command R7B (FC)](https://cohere.com/blog/command-r7b) | 1.5 | 27 | 43 | 11 | 5.16 | 2.58 | 9.68 | 3.23 | 8.25 | 12 | 0.5 | 10.5 | 10 | 80.96 | 67.33 | 89.5 | 85.5 | 81.5 | 69.06 | 62.79 | 70.94 | 43.75 | 70.83 | 68.75 | 81.65 | N/A | N/A | 1.38 | 2.87 | 2.69 | Cohere | cc-by-nc-4.0 |
| 62 | 31.9 | [Llama-3.3-70B-Instruct (FC)](https://llama.meta.com/llama3) | 29.54 | 10 | 14 | 6 | 8.17 | 4.52 | 8.39 | 11.61 | 21.5 | 26 | 19 | 14.5 | 26.5 | 88.02 | 76.08 | 95 | 90 | 91 | 76.61 | 81.4 | 75.5 | 81.25 | 70.83 | 100 | 53.53 | N/A | N/A | 26.11 | 93.22 | 187.93 | Meta | Meta Llama 3 Community |
| 63 | 31.84 | [mistral-large-2411 (Prompt)](https://docs.mistral.ai/guides/model-selection/) | 232.42 | 20 | 28 | 12 | 23.66 | 16.77 | 30.97 | 23.23 | 13.75 | 20 | 5 | 11 | 19 | 83 | 75.5 | 89.5 | 87 | 80 | 68.1 | 83.72 | 64.01 | 93.75 | 62.5 | 93.75 | 38.77 | 13.5 | 3.91 | 1.82 | 7.15 | 4.08 | Mistral AI | Proprietary |
| 64 | 31.67 | [Hammer2.1-7b (FC)](https://huggingface.co/MadeAgents/Hammer2.1-7b) | 4.99 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 23.87 | 24 | 28.5 | 21.5 | 21.5 | 85.5 | 72.5 | 92.5 | 91 | 86 | 69.5 | 66.67 | 69.99 | 75 | 75 | 50 | 90.12 | N/A | N/A | 5.77 | 10.29 | 31.26 | MadeAgents | cc-by-nc-4.0 |
| 65 | 30.44 | [xLAM-2-1b-fc-r (FC)](https://huggingface.co/Salesforce/xLAM-2-1b-fc-r) | 2.79 | 0 | 0 | 0 | 3.87 | 3.87 | 3.87 | 3.87 | 36 | 45.5 | 36 | 37 | 25.5 | 69.04 | 64.17 | 82.5 | 73.5 | 56 | 55.14 | 68.22 | 52.8 | 43.75 | 25 | 87.5 | 64.47 | N/A | N/A | 2.84 | 2.35 | 6.52 | Salesforce | cc-by-nc-4.0 |
| 66 | 30.43 | [Gemma-3-12b-it (Prompt)](https://blog.google/technology/developers/gemma-3/) | 10.77 | 4 | 4 | 4 | 27.53 | 8.39 | 25.16 | 49.03 | 5.75 | 6.5 | 7.5 | 5 | 4 | 79.44 | 76.25 | 94 | 91 | 56.5 | 74.24 | 85.66 | 71.89 | 87.5 | 45.83 | 93.75 | 70.29 | 67.5 | 22.41 | 11.1 | 17.17 | 34.66 | Google | gemma-terms-of-use |
| 67 | 29.73 | [GPT-4.1-mini-2025-04-14 (Prompt)](https://openai.com/index/gpt-4-1/) | 20.52 | 4 | 7 | 1 | 24.3 | 20.65 | 13.55 | 38.71 | 2.5 | 1.5 | 4.5 | 2.5 | 1.5 | 84.6 | 74.92 | 92.5 | 87.5 | 83.5 | 74.76 | 80.62 | 73.31 | 81.25 | 70.83 | 87.5 | 73.88 | 45.0 | 13.33 | 1.36 | 4.5 | 3.38 | OpenAI | Proprietary |
| 68 | 29.71 | [Hammer2.1-3b (FC)](https://huggingface.co/MadeAgents/Hammer2.1-3b) | 10.89 | 0 | 0 | 0 | 3.01 | 2.58 | 3.87 | 2.58 | 16.5 | 22 | 12.5 | 16 | 15.5 | 84.96 | 79.33 | 93.5 | 86.5 | 80.5 | 70.54 | 68.22 | 71.32 | 62.5 | 66.67 | 56.25 | 86.12 | N/A | N/A | 11.24 | 15.81 | 47.44 | MadeAgents | qwen-research |
| 69 | 29.47 | [Gemma-3-27b-it (Prompt)](https://blog.google/technology/developers/gemma-3/) | 11.82 | 0 | 0 | 0 | 13.55 | 1.94 | 3.23 | 35.48 | 10.75 | 16.5 | 4.5 | 8 | 14 | 87.17 | 77.67 | 92.5 | 89 | 89.5 | 74.54 | 84.5 | 72.46 | 93.75 | 45.83 | 81.25 | 73.67 | 34.0 | 8.06 | 10.88 | 19.67 | 55.5 | Google | gemma-terms-of-use |
| 70 | 28.79 | [Phi-4 (Prompt)](https://huggingface.co/microsoft/phi-4) | 8.72 | 4.5 | 4 | 5 | 24.73 | 17.42 | 25.16 | 31.61 | 3.88 | 9 | 0 | 3.5 | 3 | 69.56 | 74.25 | 89.5 | 65 | 49.5 | 60.7 | 65.5 | 59.64 | 81.25 | 41.67 | 50 | 87.55 | 81.5 | 23.34 | 9.49 | 26.73 | 23.02 | Microsoft | MIT |
| 71 | 28.41 | [Qwen3-1.7B (FC)](https://huggingface.co/Qwen/Qwen3-1.7B) | 4.33 | 2.5 | 3 | 2 | 6.02 | 4.52 | 7.74 | 5.81 | 11 | 15 | 6 | 12 | 11 | 82.92 | 70.67 | 92.5 | 88.5 | 80 | 74.61 | 76.74 | 74.26 | 62.5 | 75 | 81.25 | 76.54 | N/A | N/A | 5.12 | 7.37 | 13.35 | Qwen | apache-2.0 |
| 72 | 28.13 | [Llama-4-Scout-17B-16E-Instruct (FC)](https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct) | 24.68 | 14.5 | 18 | 11 | 8.17 | 2.58 | 2.58 | 19.35 | 9 | 12 | 7 | 7.5 | 9.5 | 89.38 | 79 | 94 | 94 | 90.5 | 74.69 | 81.78 | 72.74 | 81.25 | 79.17 | 100 | 44.92 | N/A | N/A | 17.86 | 50.68 | 166.2 | Meta | Meta Llama 4 Community |
| 73 | 28.03 | [Gemini-2.5-Flash-Lite (Prompt)](https://deepmind.google/technologies/gemini/flash-lite/) | 7.05 | 0 | 0 | 0 | 12.69 | 1.94 | 6.45 | 29.68 | 7.63 | 10 | 5 | 6.5 | 9 | 83.9 | 70.08 | 86 | 90 | 89.5 | 54.85 | 67.05 | 51.66 | 75 | 50 | 50 | 93.33 | 25.5 | 6.68 | 1.0 | 4.75 | 1.4 | Google | Proprietary |
| 74 | 27.99 | [CoALM-70B](https://huggingface.co/uiuc-convai/CoALM-70B) | 19.89 | 0 | 0 | 0 | 5.81 | 9.03 | 5.16 | 3.23 | 10.62 | 11 | 14 | 9 | 8.5 | 83.44 | 70.25 | 92 | 88.5 | 83 | 67.28 | 70.54 | 66.57 | 68.75 | 62.5 | 93.75 | 85.65 | 72.0 | 27.76 | 16.22 | 59.91 | 36.0 | UIUC + Oumi | Meta Llama 3 Community |
| 75 | 27.88 | [Hammer2.1-1.5b (FC)](https://huggingface.co/MadeAgents/Hammer2.1-1.5b) | 6.83 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15.62 | 20 | 16.5 | 9.5 | 16.5 | 82.98 | 73.92 | 92 | 85.5 | 80.5 | 69.5 | 72.09 | 69.33 | 50 | 62.5 | 75 | 79.4 | N/A | N/A | 6.28 | 8.79 | 30.72 | MadeAgents | cc-by-nc-4.0 |
| 76 | 27.87 | [palmyra-x-004 (FC)](https://writer.com/engineering/actions-with-palmyra-x-004/) | 178.15 | 2.5 | 4 | 1 | 13.12 | 6.45 | 14.19 | 18.71 | 0.38 | 0.5 | 0 | 0.5 | 0.5 | 87.46 | 71.33 | 96 | 93 | 89.5 | 77.87 | 79.46 | 77.97 | 56.25 | 70.83 | 81.25 | 80.99 | N/A | N/A | 3.71 | 7.62 | 8.04 | Writer | Proprietary |
| 77 | 27.83 | [GPT-5-mini-2025-08-07 (Prompt)](https://openai.com/index/introducing-gpt-5/) | 82.74 | 8.5 | 11 | 6 | 29.25 | 19.35 | 29.68 | 38.71 | 5.5 | 5.5 | 5 | 4.5 | 7 | 68.04 | 59.17 | 72.5 | 71.5 | 69 | 62.55 | 69.77 | 61.16 | 75 | 37.5 | 93.75 | 55.71 | 16.0 | 3.78 | 8.89 | 11.08 | 19.72 | OpenAI | Proprietary |
| 78 | 27.63 | [Open-Mistral-Nemo-2407 (FC)](https://mistral.ai/news/mistral-nemo/) | 8.12 | 7 | 9 | 5 | 10.32 | 8.39 | 9.68 | 12.9 | 7.75 | 12.5 | 6.5 | 7.5 | 4.5 | 82.81 | 65.75 | 92.5 | 88.5 | 84.5 | 73.8 | 78.68 | 72.84 | 68.75 | 66.67 | 81.25 | 61.77 | N/A | N/A | 1.07 | 11.93 | 1.39 | Mistral AI | Proprietary |
| 79 | 27.55 | [GPT-5-nano-2025-08-07 (Prompt)](https://openai.com/index/introducing-gpt-5/) | 21.47 | 13.5 | 10 | 17 | 24.52 | 20.65 | 31.61 | 21.29 | 0.75 | 1 | 1 | 0 | 1 | 80.81 | 69.25 | 86 | 87.5 | 80.5 | 70.69 | 76.36 | 69.71 | 68.75 | 54.17 | 93.75 | 45.75 | 8.5 | 2.57 | 10.67 | 7.68 | 23.28 | OpenAI | Proprietary |
| 80 | 27.1 | [Amazon-Nova-2-Lite-v1:0 (FC)](https://aws.amazon.com/cn/ai/generative-ai/nova/) | 78.19 | 5 | 4 | 6 | 2.37 | 1.94 | 3.23 | 1.94 | 2.12 | 2.5 | 1.5 | 2 | 2.5 | 86.96 | 76.33 | 94 | 91.5 | 86 | 80.83 | 83.33 | 80.15 | 87.5 | 79.17 | 75 | 82.11 | N/A | N/A | 8.55 | 9.85 | 27.62 | Amazon | Proprietary |
| 81 | 27.1 | [Granite-3.1-8B-Instruct (FC)](https://huggingface.co/ibm-granite/granite-3.1-8b-instruct) | 9.32 | 0.5 | 1 | 0 | 14.41 | 9.68 | 7.1 | 26.45 | 7.5 | 11.5 | 2 | 7.5 | 9 | 78.33 | 67.33 | 92 | 84 | 70 | 60.33 | 58.53 | 61.82 | 18.75 | 41.67 | 68.75 | 79.98 | N/A | N/A | 13.23 | 31.28 | 65.19 | IBM | Apache-2.0 |
| 82 | 27.01 | [Falcon3-10B-Instruct (FC)](https://huggingface.co/tiiuae/Falcon3-10B-Instruct) | 52.59 | 1.5 | 2 | 1 | 27.53 | 12.26 | 19.35 | 50.97 | 6.5 | 6.5 | 9.5 | 5 | 5 | 85 | 70.5 | 93.5 | 88.5 | 87.5 | 75.43 | 77.13 | 76.16 | 50 | 41.67 | 93.75 | 32.09 | N/A | N/A | 69.27 | 92.22 | 190.96 | TII UAE | falcon-llm-license |
| 83 | 26.87 | [Granite-3.2-8B-Instruct (FC)](https://huggingface.co/ibm-granite/granite-3.2-8b-instruct) | 25.02 | 0.5 | 1 | 0 | 12.47 | 6.45 | 9.68 | 21.29 | 7.38 | 9.5 | 3 | 8 | 9 | 79.77 | 69.58 | 88.5 | 88.5 | 72.5 | 60.33 | 60.47 | 61.16 | 25 | 45.83 | 75 | 80.53 | N/A | N/A | 36.13 | 81.76 | 216.28 | IBM | Apache-2.0 |
| 84 | 26.81 | [CoALM-8B](https://huggingface.co/uiuc-convai/CoALM-8B) | 25.33 | 0 | 0 | 0 | 2.8 | 3.23 | 3.87 | 1.29 | 8 | 10 | 7 | 8 | 7 | 84.87 | 69.5 | 93.5 | 88 | 88.5 | 66.77 | 70.54 | 66.19 | 62.5 | 54.17 | 87.5 | 86.9 | 79.0 | 34.18 | 20.36 | 73.74 | 138.04 | UIUC + Oumi | Meta Llama 3 Community |
| 85 | 25.83 | [Llama-3.1-8B-Instruct (Prompt)](https://llama.meta.com/llama3) | 7.49 | 3 | 6 | 0 | 10.75 | 7.74 | 5.81 | 18.71 | 11.12 | 13 | 9 | 9.5 | 13 | 84 | 71 | 95 | 87.5 | 82.5 | 70.76 | 72.87 | 71.13 | 50 | 45.83 | 93.75 | 42.7 | 74.5 | 29.1 | 5.6 | 19.37 | 22.6 | Meta | Meta Llama 3 Community |
| 86 | 25.55 | [MiniCPM3-4B-FC (FC)](https://huggingface.co/openbmb/MiniCPM3-4B) | 54.05 | 0 | 0 | 0 | 12.04 | 9.68 | 15.48 | 10.97 | 3.88 | 6.5 | 2 | 4.5 | 2.5 | 81.75 | 70.5 | 92 | 84 | 80.5 | 65.21 | 73.26 | 63.53 | 50 | 62.5 | 68.75 | 72.84 | N/A | N/A | 118.62 | 143.98 | 388.67 | openbmb | Apache-2.0 |
| 87 | 25.26 | [Claude-Haiku-4-5-20251001 (Prompt)](https://www.anthropic.com/news/claude-haiku-4-5) | 45.13 | 19.5 | 20 | 19 | 2.58 | 2.58 | 1.94 | 3.23 | 1.75 | 1.5 | 0 | 4 | 1.5 | 55.42 | 55.67 | 84 | 38 | 44 | 52.48 | 66.67 | 49.76 | 56.25 | 16.67 | 31.25 | 95.29 | 67.5 | 20.07 | 3.75 | 19.96 | 3.77 | Anthropic | Proprietary |
| 88 | 24.97 | [Amazon-Nova-Pro-v1:0 (FC)](https://aws.amazon.com/cn/ai/generative-ai/nova/) | 48.44 | 2.5 | 4 | 1 | 1.94 | 2.58 | 1.29 | 1.94 | 1.88 | 1.5 | 0.5 | 2.5 | 3 | 86.58 | 75.83 | 93 | 93.5 | 84 | 78.53 | 81.4 | 77.97 | 81.25 | 70.83 | 93.75 | 70.06 | N/A | N/A | 2.25 | 1.91 | 3.29 | Amazon | Proprietary |
| 89 | 24.9 | [Claude-Sonnet-4-5-20250929 (Prompt)](https://www.anthropic.com/news/claude-sonnet-4-5) | 47.82 | 16 | 16 | 16 | 5.38 | 4.52 | 9.68 | 1.94 | 1.62 | 2 | 0 | 3 | 1.5 | 59.81 | 47.25 | 79.5 | 53.5 | 59 | 46.56 | 73.26 | 40.17 | 56.25 | 33.33 | 37.5 | 95.03 | 37.5 | 10.07 | 3.84 | 1.53 | 6.66 | Anthropic | Proprietary |
| 90 | 24.88 | [GPT-4.1-nano-2025-04-14 (Prompt)](https://openai.com/index/gpt-4-1/) | 7.42 | 1.5 | 2 | 1 | 16.77 | 9.03 | 14.19 | 27.1 | 2 | 2.5 | 1 | 2.5 | 2 | 72.44 | 68.75 | 63.5 | 85 | 72.5 | 50.33 | 63.18 | 46.53 | 87.5 | 54.17 | 68.75 | 83.44 | 73.0 | 17.08 | 1.02 | 7.3 | 1.88 | OpenAI | Proprietary |
| 91 | 24.03 | [Falcon3-7B-Instruct (FC)](https://huggingface.co/tiiuae/Falcon3-7B-Instruct) | 73.61 | 0.5 | 1 | 0 | 20.65 | 10.32 | 12.9 | 38.71 | 5 | 7 | 4 | 5 | 4 | 82.69 | 65.75 | 89 | 87 | 89 | 68.32 | 74.81 | 66.76 | 75 | 62.5 | 100 | 31.99 | N/A | N/A | 93.11 | 117.8 | 315.7 | TII UAE | falcon-llm-license |
| 92 | 23.93 | [Qwen3-0.6B (FC)](https://huggingface.co/Qwen/Qwen3-0.6B) | 0.46 | 1 | 1 | 1 | 8.6 | 2.58 | 1.94 | 21.29 | 3.62 | 5.5 | 2 | 3 | 4 | 71.79 | 64.17 | 86 | 67.5 | 69.5 | 56.62 | 61.24 | 56.13 | 43.75 | 37.5 | 75 | 80.84 | N/A | N/A | 0.68 | 8.45 | 0.96 | Qwen | apache-2.0 |
| 93 | 23.23 | [Granite-20b-FunctionCalling (FC)](https://huggingface.co/ibm-granite/granite-20b-functioncalling) | 5.23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5.38 | 9 | 3 | 6.5 | 3 | 82.35 | 72.92 | 91.5 | 83.5 | 81.5 | 58.7 | 67.83 | 56.7 | 43.75 | 58.33 | 87.5 | 75.13 | N/A | N/A | 3.2 | 3.43 | 9.97 | IBM | Apache-2.0 |
| 94 | 22.38 | [Qwen3-0.6B (Prompt)](https://huggingface.co/Qwen/Qwen3-0.6B) | 3.65 | 0.5 | 1 | 0 | 8.39 | 1.29 | 2.58 | 21.29 | 1.38 | 1.5 | 1.5 | 1.5 | 1 | 70 | 64 | 78 | 75 | 63 | 49.37 | 57.75 | 47.77 | 37.5 | 37.5 | 75 | 82.5 | 60.5 | 24.35 | 3.1 | 4.32 | 10.31 | Qwen | apache-2.0 |
| 95 | 22.29 | [Amazon-Nova-Micro-v1:0 (FC)](https://aws.amazon.com/cn/ai/generative-ai/nova/) | 1.81 | 1.5 | 3 | 0 | 2.37 | 1.94 | 2.58 | 2.58 | 1.38 | 1.5 | 1 | 2 | 1 | 74.1 | 70.92 | 87.5 | 75.5 | 62.5 | 66.32 | 72.09 | 64.96 | 81.25 | 54.17 | 81.25 | 70.65 | N/A | N/A | 1.12 | 0.45 | 1.79 | Amazon | Proprietary |
| 96 | 22.25 | [RZN-T (Prompt)](https://huggingface.co/phronetic-ai/RZN-T) | 12.31 | 0 | 0 | 0 | 6.88 | 9.03 | 6.45 | 5.16 | 2.88 | 4.5 | 2 | 2.5 | 2.5 | 67.94 | 63.75 | 75 | 69.5 | 63.5 | 49.74 | 61.24 | 47.2 | 43.75 | 41.67 | 81.25 | 82.41 | 63.5 | 25.53 | 12.32 | 27.53 | 39.84 | Phronetic AI | apache-2.0 |
| 97 | 22.08 | [MiniCPM3-4B (Prompt)](https://huggingface.co/openbmb/MiniCPM3-4B) | 29.83 | 2 | 2 | 2 | 9.46 | 8.39 | 10.32 | 9.68 | 3.5 | 4.5 | 4.5 | 2 | 3 | 70.54 | 66.17 | 77 | 70 | 69 | 43.15 | 47.67 | 42.17 | 43.75 | 37.5 | 56.25 | 73.71 | 68.0 | 16.55 | 31.18 | 35.61 | 102.02 | openbmb | Apache-2.0 |
| 98 | 21.95 | [Llama-3.2-3B-Instruct (FC)](https://llama.meta.com/llama3) | 6.2 | 1 | 2 | 0 | 6.24 | 3.23 | 3.23 | 12.26 | 4 | 5 | 3.5 | 4 | 3.5 | 82.67 | 70.67 | 92.5 | 88.5 | 79 | 58.33 | 65.12 | 57.64 | 25 | 37.5 | 87.5 | 52.06 | N/A | N/A | 6.1 | 20.07 | 17.27 | Meta | Meta Llama 3 Community |
| 99 | 21.9 | [Bielik-11B-v2.3-Instruct (Prompt)](https://huggingface.co/speakleash/Bielik-11B-v2.3-Instruct) | 22.44 | 1.5 | 1 | 2 | 11.4 | 7.1 | 4.52 | 22.58 | 2.62 | 4.5 | 0.5 | 3 | 2.5 | 81.5 | 73 | 92 | 85.5 | 75.5 | 67.8 | 75.58 | 66.19 | 62.5 | 58.33 | 93.75 | 36.01 | 35.0 | 9.74 | 23.75 | 61.76 | 72.8 | SpeakLeash & ACK Cyfronet AGH | Apache 2.0 |
| 100 | 21.22 | [Hammer2.1-0.5b (FC)](https://huggingface.co/MadeAgents/Hammer2.1-0.5b) | 2.82 | 0 | 0 | 0 | 1.08 | 0.65 | 1.94 | 0.65 | 2.88 | 4.5 | 0.5 | 4 | 2.5 | 65.98 | 62.42 | 81 | 69 | 51.5 | 54.63 | 56.59 | 54.42 | 62.5 | 37.5 | 68.75 | 80.79 | N/A | N/A | 2.79 | 3.17 | 9.86 | MadeAgents | cc-by-nc-4.0 |
| 101 | 19.62 | [Gemma-3-4b-it (Prompt)](https://blog.google/technology/developers/gemma-3/) | 4.14 | 1 | 1 | 1 | 8.6 | 9.68 | 9.68 | 6.45 | 0.38 | 0.5 | 0 | 0.5 | 0.5 | 61.12 | 64.5 | 88 | 56 | 36 | 60.84 | 70.93 | 59.35 | 25 | 41.67 | 100 | 53.94 | 69.5 | 23.67 | 4.69 | 9.53 | 11.42 | Google | gemma-terms-of-use |
| 102 | 19.31 | [Open-Mistral-Nemo-2407 (Prompt)](https://mistral.ai/news/mistral-nemo/) | 13.8 | 2.5 | 3 | 2 | 8.6 | 9.68 | 9.68 | 6.45 | 0.75 | 0.5 | 1 | 0 | 1.5 | 88.46 | 79.33 | 92.5 | 90.5 | 91.5 | 73.95 | 78.29 | 73.03 | 87.5 | 58.33 | 93.75 | 6.28 | 14.5 | 4.6 | 0.84 | 7.05 | 1.32 | Mistral AI | Proprietary |
| 103 | 18.98 | [Granite-4.0-350m (FC)](https://huggingface.co/ibm-granite/granite-4.0-350m) | 1.44 | 0.5 | 0 | 1 | 3.23 | 1.94 | 1.29 | 6.45 | 2.5 | 5 | 0.5 | 2.5 | 2 | 67.92 | 61.67 | 84.5 | 70 | 55.5 | 46.11 | 61.24 | 42.36 | 68.75 | 33.33 | 81.25 | 60.84 | N/A | N/A | 1.74 | 4.85 | 3.44 | IBM | Apache-2.0 |
| 104 | 16.25 | [Falcon3-3B-Instruct (FC)](https://huggingface.co/tiiuae/Falcon3-3B-Instruct) | 36.7 | 1 | 1 | 1 | 7.74 | 6.45 | 8.39 | 8.39 | 1 | 1.5 | 0.5 | 0.5 | 1.5 | 54.62 | 56.5 | 69.5 | 67 | 25.5 | 54.48 | 57.36 | 54.7 | 25 | 33.33 | 81.25 | 32.92 | N/A | N/A | 38.52 | 107.47 | 103.62 | TII UAE | falcon-llm-license |
| 105 | 11.1 | [Ministral-8B-Instruct-2410 (FC)](https://huggingface.co/mistralai/Ministral-8B-Instruct-2410) | 70.01 | 1 | 2 | 0 | 4.52 | 3.87 | 7.1 | 2.58 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100 | 0.0 | 0.0 | 82.07 | 212.99 | 568.59 | Mistral AI | Mistral AI Research License |
| 106 | 11.08 | [Falcon3-1B-Instruct (FC)](https://huggingface.co/tiiuae/Falcon3-1B-Instruct) | 1.72 | 0 | 0 | 0 | 5.81 | 5.16 | 7.74 | 4.52 | 0 | 0 | 0 | 0 | 0 | 9.02 | 2.58 | 6 | 18 | 9.5 | 2.89 | 4.26 | 2.37 | 0 | 12.5 | 0 | 87.3 | N/A | N/A | 5.23 | 14.34 | 11.48 | TII UAE | falcon-llm-license |
| 107 | 10.82 | [Llama-3.2-1B-Instruct (FC)](https://llama.meta.com/llama3) | 1.64 | 0 | 0 | 0 | 3.23 | 2.58 | 2.58 | 4.52 | 0 | 0 | 0 | 0 | 0 | 38.38 | 44 | 50.5 | 44 | 15 | 11.77 | 31.78 | 7.31 | 0 | 0 | 43.75 | 51.57 | N/A | N/A | 3.21 | 10.04 | 9.77 | Meta | Meta Llama 3 Community |
| 108 | 10 | [Llama-3.1-Nemotron-Ultra-253B-v1 (FC)](https://huggingface.co/nvidia/Llama-3_1-Nemotron-Ultra-253B-v1) | 0.72 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100 | N/A | N/A | 1.42 | 1.84 | 2.4 | NVIDIA | nvidia-open-model-license |
| 109 | 7.17 | [Gemma-3-1b-it (Prompt)](https://blog.google/technology/developers/gemma-3/) | 3.4 | 0 | 0 | 0 | 3.23 | 3.87 | 3.87 | 1.94 | 0 | 0 | 0 | 0 | 0 | 20.21 | 43.33 | 36 | 0 | 1.5 | 11.84 | 36.43 | 6.27 | 0 | 0 | 37.5 | 33.18 | 25.5 | 9.76 | 3.98 | 9.8 | 12.06 | Google | gemma-terms-of-use |

**FC** = native support for function/tool calling.
**Prompt** = walk-around for function calling, using model's normal text generation capability.


**Cost** is calculated as an estimate of the cost for the entire benchmark, in USD.
**Latency** is measured in seconds.


**Overall Accuracy** is the **unweighted** average of all the sub-categories.
For details on score composition, please refer to our [blog](https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html#leaderboard-composition).


**Format sensitivity** test cases are only supported for prompt (non-FC) models.


Click on column header to sort. If you would like to add
your model or contribute test-cases, please contact us via [discord](https://discord.gg/grXXvj9Whz).


Models are evaluated using commit **f7cf735**.
All the model response we obtained is available [here](https://github.com/HuanzhiMao/BFCL-Result).
To reproduce the results, please either checkout our codebase at
[this\\
checkpoint](https://github.com/ShishirPatil/gorilla/commit/f7cf7359b7ac615a0b294831c5ba2bc95ee4a000),
or install the PyPI package `pip install bfcl-eval==2025.12.17`.


## Wagon Wheel

The following chart shows the comparison of the models based on a few
metrics. You can select and deselect which models to compare. More
information on each metric can be found in the
[blog](https://gorilla.cs.berkeley.edu/blogs/8_berkeley_function_calling_leaderboard.html#benchmarking).


Select Models to CompareClear All

Search models...

## Function Calling Demo

In this demo for function calling, you can enter a prompt and a
function and see the output. There will be two outputs (and two output
boxes accordingly): one in the actual code format (the top one) and
the other in the OpenAI compatible format (the bottom one). Note that
the OpenAI compatible format output is only available if the actual
code output has valid syntax and can be parsed. We also provide you a
few examples to try out and get a sense of the input format and the
output.


Example 1Example 2Example 3

Model:

Gorilla OpenFunctions-v2


Temperature:0.7

Submit

Output will be shown here:

OpenAI compatible format output:


👍👎Report Issue

## Contact Us

Submit

## Citation

```

@inproceedings{patil2025bfcl,
title={The Berkeley Function Calling Leaderboard (BFCL): From Tool Use to Agentic Evaluation of Large Language Models},
author={Patil, Shishir G. and Mao, Huanzhi and Cheng-Jie Ji, Charlie and Yan, Fanjia and Suresh, Vishnu and Stoica, Ion and E. Gonzalez, Joseph},
booktitle={Forty-second International Conference on Machine Learning},
year={2025},
}

```
