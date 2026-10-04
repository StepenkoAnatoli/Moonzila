# Hugging Face connection evidence — 27 September 2026

The user authorized use of a supplied Hugging Face token for building and checking Monnzila. The token was loaded directly into memory, never printed or included in repository files. The Hub authentication check returned HTTP 200. Public router inventory returned HTTP 200 and listed a live tool-capable `Qwen/Qwen3-4B-Instruct-2507` route through `nscale`, with advertised input/output rates of $0.01/$0.03 per million tokens at the time of inspection. These are observed rates, not a continuing price guarantee. No credits or subscription were purchased.

The implementation uses the documented OpenAI-compatible router base `https://router.huggingface.co/v1` and an explicit provider suffix to avoid silently selecting a different route. Primary references: [router inventory and capability metadata](https://huggingface.co/docs/inference-providers/hub-api), [function calling](https://huggingface.co/docs/inference-providers/guides/function-calling), [provider routing](https://huggingface.co/docs/inference-providers/index).

## Checks performed

1. Production `complete` adapter: a synthetic prompt requested `read_file` for `greeting.txt`. The provider returned one valid tool call, accepted its synthetic result on the second request, and returned exactly `MOONALIZA_CONNECTION_OK` with a complete terminal outcome. Two requests took 3.30 seconds total.
2. Installed 0.5 desktop app: saved a real credential through the profile form and encrypted vault, tested the connection, opened a generated project and enabled cloud inference for that fixture only. The real model read `hello.txt`, proposed replacing `before` with `after`, and paused before changing the file. The verifier checked the exact path and before/after text, approved the edit, observed the completed run, and used Undo to restore the original CRLF bytes. The token was absent from vault plaintext. Temporary project/app data were removed.

The first two desktop attempts failed before a profile was saved because the verifier's exact provider-label match included an incorrect assumption about the select element's label text. The corrected selector passed; no product code was changed for that issue. Evidence lives in ignored `.build/hf-discovery.json`, `.build/hf-smoke.json` and `.build/provider-check/result.json`, with screenshots that contain no credentials.

This evidence covers a real connection and one simple edit/Undo workflow. It does not qualify general coding quality, long contexts, streaming, cancellation under provider faults, all provider models, or the planned multi-fixture benchmark. Cloud access remains an explicit policy of each project.
