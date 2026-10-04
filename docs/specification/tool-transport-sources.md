# Tool transport implementation sources

Checked 2026-09-26 against the provider documentation:

- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling): JSON function definitions, object arguments, assistant calls retained in the conversation, and tool responses labeled by tool name.
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling): function-call IDs, JSON-string arguments, matched tool responses and repeated model requests after tool execution.

The current adapters are nonstreaming. Monnzila validates bounded arguments, rejects duplicate IDs and unoffered tools, and refuses to execute calls from incomplete or blocked outputs. Ollama calls without native IDs receive generated IDs inside the engine's canonical transcript. This implementation still needs real-model qualification; fixture tests establish protocol behavior, not model quality.
