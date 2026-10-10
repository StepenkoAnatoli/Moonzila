---
url: https://docs.ollama.com/api/authentication
retrieved: 2026-10-05
command: firecrawl scrape https://docs.ollama.com/api/authentication --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Authentication - Ollama
---
> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.ollama.com/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.ollama.com/api/authentication#content-area)

[Guide](https://docs.ollama.com/) [Integrations](https://docs.ollama.com/integrations) [API Reference](https://docs.ollama.com/api/introduction)

The local API at `http://localhost:11434` does not require authentication.To use cloud models, publish models, or download private models, sign in to Ollama. For direct API access to ollama.com, use an API key.

## [​](https://docs.ollama.com/api/authentication\#api-keys)  API keys

Direct cloud inference at `https://ollama.com/api` and `https://ollama.com/v1` requires an API key. No Ollama installation or local server is required.Create an [API key](https://ollama.com/settings/keys), then set it in your terminal:

```
export OLLAMA_API_KEY="your_api_key"
```

Use the API key in the `Authorization: Bearer` header. This also applies to the hosted Anthropic-compatible `/v1/messages` endpoint; `x-api-key` alone is not supported.

```
curl https://ollama.com/api/chat \
  -H "Authorization: Bearer $OLLAMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4:31b",
    "messages": [{"role": "user", "content": "Why is the sky blue?"}],
    "stream": false
  }'
```

API keys do not expire. Revoke a key in [API keys settings](https://ollama.com/settings/keys).Keep keys outside browser code and source control. See the [API quickstart](https://docs.ollama.com/quickstart#build-an-application) for shell setup and compatibility examples.

## [​](https://docs.ollama.com/api/authentication\#signing-in)  Signing in

Sign in from your terminal:

```
ollama signin
```

Ollama then authenticates cloud requests for you:

```
ollama run gpt-oss:120b-cloud
```

This also works through the local API:

```
curl http://localhost:11434/api/generate -d '{
  "model": "gpt-oss:120b-cloud",
  "prompt": "Why is the sky blue?"
}'
```

Ctrl+I
