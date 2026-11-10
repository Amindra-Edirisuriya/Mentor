# ADR 0005: Free LLM providers through one OpenAI-compatible client

- Status: Accepted (the project owner asked for a free provider on 2026-11-10: "grok, chat gpt
  or claude or whatever, must be free")
- Date: 2026-11-10

## Context

The learning features (concept walkthroughs, practice and viva questions, answer grading,
presentation generation) need a real language model. The owner requires it to be free.
Grok (xAI), ChatGPT (OpenAI) and Claude (Anthropic) APIs are all paid, so none of them fits.

## Decision

Add **one** client, `OpenAICompatibleClient` (`app/intelligence/llm.py`), that calls
`POST {LLM_BASE_URL}/chat/completions` in JSON mode using `httpx`. No vendor SDK is added.
`httpx` moves from a dev-only to a runtime dependency (it was already installed for tests).
Free providers that speak this API:

| Provider | Cost | Privacy | `LLM_BASE_URL` |
|---|---|---|---|
| **Ollama** (recommended) | Free, runs on your own machine | Code never leaves the machine | `http://localhost:11434/v1` |
| Groq | Free tier, rate-limited | Hosted; check their data terms | `https://api.groq.com/openai/v1` |
| Google Gemini | Free tier, rate-limited | Hosted; free-tier data may be used to improve Google's products | `https://generativelanguage.googleapis.com/v1beta/openai` |
| OpenRouter | Free models (ids ending `:free`) | Hosted; depends on the model's host | `https://openrouter.ai/api/v1` |

Ollama is the recommended default because it is free with no limits, needs no API key, and
keeps the student's code private. A 7–8B model (for example `qwen2.5-coder:7b`) runs on a
laptop GPU with about 6 GB of VRAM. `LLM_PROVIDER=fake` stays the default, so the app and the
tests work offline with no provider at all.

Unchanged guarantees (CLAUDE.md rules 3 and 6): every prompt is built from the analysis report
and redacted snippets, plus the student's own answer, which is also redacted. Every claim,
question, slide bullet and grade citation is validated in code against the report's evidence
ids, and anything ungrounded is dropped or rejected. Provider failures (unreachable server,
rate limit, bad key, non-JSON reply) become a 502 with a message a student can act on.

## Consequences

- Switching provider is a `.env` change; no code changes.
- Small local models are weaker than hosted ones: more of their output gets rejected by the
  citation checks, and grading is less nuanced. The validation layer keeps that safe.
- Hosted free tiers can change their limits or terms at any time; the client doesn't depend
  on any one of them.
- Calls are synchronous. A slow local model blocks that request (timeout
  `LLM_TIMEOUT_SECONDS`, default 180 s). A background job queue can come later if needed.
