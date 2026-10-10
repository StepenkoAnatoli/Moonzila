---
url: https://ollama.com/library/phi4-mini
retrieved: 2026-10-05
command: firecrawl scrape https://ollama.com/library/phi4-mini --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: phi4-mini
---
[phi4-mini](https://ollama.com/library/phi4-mini "phi4-mini")

1.5M DownloadsUpdated 1 year ago

## Phi-4-mini brings significant enhancements in multilingual support, reasoning, and mathematics, and now, the long-awaited function calling feature is finally supported.

Cancel


tools3.8b

CLIcURLPythonJavaScript

[Documentation](https://github.com/ollama/ollama-python) [Documentation](https://github.com/ollama/ollama-js)

```
ollama run phi4-mini
```

```
curl http://localhost:11434/api/chat \
  -d '{
    "model": "phi4-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

```
from ollama import chat

response = chat(
    model='phi4-mini',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)
print(response.message.content)
```

```
import ollama from 'ollama'

const response = await ollama.chat({
  model: 'phi4-mini',
  messages: [{role: 'user', content: 'Hello!'}],
})
console.log(response.message.content)
```

## Applications

![Claude Code](https://ollama.com/public/claude.png)

Claude Code`ollama launch claude --model phi4-mini`

![OpenCode](https://ollama.com/public/opencode.png)

OpenCode`ollama launch opencode --model phi4-mini`

![Hermes Agent](https://ollama.com/public/hermes.png)

Hermes Agent`ollama launch hermes --model phi4-mini`

![OpenClaw](https://ollama.com/public/openclaw.svg)

OpenClaw`ollama launch openclaw --model phi4-mini`

## Models

[View all →](https://ollama.com/library/phi4-mini/tags)

Name

5 models

Size / Usage

Context

Input

[phi4-mini:latest\\
\\
2.5GB · 128K context window · Text · 1 year ago](https://ollama.com/library/phi4-mini:latest)

[phi4-mini:latest](https://ollama.com/library/phi4-mini:latest)

2.5GB

128K

Text


[phi4-mini:3.8b\\
latest\\
2.5GB · 128K context window · Text · 1 year ago](https://ollama.com/library/phi4-mini:3.8b)

[phi4-mini:3.8b](https://ollama.com/library/phi4-mini:3.8b) latest

2.5GB

128K

Text


## Readme

> Note: this model requires [Ollama 0.5.13](https://github.com/ollama/ollama/releases/tag/v0.5.13) or later.

![](https://ollama.com/assets/library/phi3.5/dbf19a17-e3fd-46b6-a059-e6b4f1fae59f)

Phi-4-mini-instruct is a lightweight open model built upon synthetic data and filtered publicly available websites - with a focus on high-quality, reasoning dense data. The model belongs to the Phi-4 model family and supports 128K token context length. The model underwent an enhancement process, incorporating both supervised fine-tuning and direct preference optimization to support precise instruction adherence and robust safety measures.

## Primary use cases

The model is intended for broad multilingual commercial and research use. The model provides uses for general purpose AI systems and applications which require:

- Memory/compute constrained environments
- Latency bound scenarios
- Strong reasoning (especially math and logic).
- The model is designed to accelerate research on language and multimodal models, for use as a building block for generative AI powered features.

## References

[Hugging Face](https://huggingface.co/microsoft/Phi-4-mini-instruct)

[Blog post](https://techcommunity.microsoft.com/blog/educatordeveloperblog/welcome-to-the-new-phi-4-models---microsoft-phi-4-mini--phi-4-multimodal/4386037)

Paste, drop or click to upload images (.png, .jpeg, .jpg, .svg, .gif)
