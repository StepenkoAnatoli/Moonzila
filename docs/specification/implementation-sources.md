# Implementation references

Checked September 25, 2026. These define integration behavior; they are not proof that Monnzila passed runtime tests.

- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process): main launches the engine and exchanges correlated messages through parentPort.
- [Electron parentPort](https://www.electronjs.org/docs/latest/api/parent-port): engine-side lifecycle and messaging.
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security): isolated, sandboxed renderer; sender validation; restricted navigation and permissions.
- [Electron installation](https://www.electronjs.org/docs/latest/tutorial/installation): Electron 44 downloads the binary on explicit installation or first launch.
- [Ollama chat API](https://docs.ollama.com/api/chat): native chat request, output budget, and terminal markers.
- [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat): explicit completion endpoint and terminal finish reasons.

The current connection implementation uses bounded non-streaming replies. Streaming, tool calls, Responses and Anthropic adapters remain separate implementation work. Incomplete or blocked replies do not become successful runs.
