---
url: https://docs.ollama.com/cloud
retrieved: 2026-10-05
command: firecrawl scrape https://docs.ollama.com/cloud --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Cloud - Ollama
---
> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.ollama.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.ollama.com/cloud#content-area)

[Guide](https://docs.ollama.com/) [Integrations](https://docs.ollama.com/integrations) [API Reference](https://docs.ollama.com/api/introduction)

Run models in Ollama’s cloud from your apps or terminal. No model or app download required.

## [​](https://docs.ollama.com/cloud\#api-key)  API Key

Create an [API key](https://ollama.com/settings/keys), then set it in Bash or Zsh:

```
export OLLAMA_API_KEY="your_api_key"
```

Send a request from the same terminal:

```
curl https://ollama.com/api/chat \
  -H "Authorization: Bearer $OLLAMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4:31b",
    "messages": [\
      {\
        "role": "user",\
        "content": "Say hello in one sentence."\
      }\
    ],
    "stream": false
  }'
```

Read the answer from `message.content`. Keep your API key out of browser code and source control.You can also use [OpenAI](https://docs.ollama.com/api/openai-compatibility) or [Anthropic](https://docs.ollama.com/api/anthropic-compatibility) clients. Each supports a subset of the original API. No Ollama installation is required.

## [​](https://docs.ollama.com/cloud\#ollama-app-or-cli)  Ollama App or CLI

[Download Ollama](https://ollama.com/download). Open the app, or run:

```
ollama
```

Follow the setup prompts and sign in to use cloud models.On macOS, open **Apps** and connect Claude or ChatGPT. For coding agents, run a launch command:

Claude Code

Codex CLI

OpenCode

```
ollama launch claude
```

```
ollama launch codex
```

```
ollama launch opencode
```

For more integrations, open the Ollama app or run `ollama` in your terminal.Ollama handles sign-in for connected apps. See the [quickstart](https://docs.ollama.com/quickstart) for setup.

## [​](https://docs.ollama.com/cloud\#models)  Models

Browse [cloud models](https://ollama.com/search?c=cloud), or list them with the API:

```
curl https://ollama.com/api/tags
```

For API requests to ollama.com, use the name returned by this list, such as `gemma4:31b`. In the Ollama app or CLI, use `gemma4:cloud`. Cloud models do not need to be downloaded.

## [​](https://docs.ollama.com/cloud\#usage)  Usage

Check your [usage](https://ollama.com/settings/usage) or compare [plans](https://ollama.com/pricing).

## [​](https://docs.ollama.com/cloud\#retirements)  Retirements

[Usage settings](https://ollama.com/settings) show upcoming retirements for models you’ve recently used. Switch models before the retirement date. Downloaded local models are not affected.

## [​](https://docs.ollama.com/cloud\#data-handling)  Data handling

Ollama processes cloud prompts and responses to answer your requests. We do not use them to train models. Read the [Privacy Policy](https://ollama.com/privacy) for details.To use only local models, [disable cloud features](https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features).

Ctrl+I
