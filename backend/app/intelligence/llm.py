"""LLM clients: the deterministic fake (default, tests) and any OpenAI-compatible chat API.

The OpenAI-compatible client covers free options: a local Ollama server (no key, nothing
leaves the machine) and the free tiers of Groq, Google Gemini and OpenRouter. See
docs/adr/0005-free-llm-providers.md.
"""

import json
import re
from collections.abc import Callable
from typing import Any, Protocol

import httpx

REPORT_START = "<report>"
REPORT_END = "</report>"


class LLMClient(Protocol):
    model_name: str

    def complete_json(self, system: str, prompt: str, schema: dict[str, Any]) -> Any:
        """Return the model's structured (JSON-decoded) answer for ``prompt``."""
        ...


class LLMError(RuntimeError):
    """The provider failed or returned something that isn't JSON. The message is safe to show."""


class OpenAICompatibleClient:
    """POST {base_url}/chat/completions with JSON mode. Works with Ollama, Groq, Gemini, OpenRouter."""

    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout: float = 180.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.model_name = model
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._http = httpx.Client(base_url=base_url.rstrip("/"), headers=headers, timeout=timeout, transport=transport)

    def complete_json(self, system: str, prompt: str, schema: dict[str, Any]) -> Any:
        body = {
            "model": self.model_name,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": f"{prompt}\n\nReply with only a JSON object matching this "
                                            f"JSON Schema:\n{json.dumps(schema)}"},
            ],
        }
        try:
            response = self._http.post("/chat/completions", json=body)
        except httpx.HTTPError as exc:
            raise LLMError(f"Couldn't reach the AI provider ({type(exc).__name__}). Is it running?") from exc
        if response.status_code == 429:
            raise LLMError("The AI provider's free-tier rate limit was hit. Wait a minute and try again.")
        if response.status_code >= 400:
            raise LLMError(f"The AI provider returned HTTP {response.status_code}. Check LLM_MODEL and LLM_API_KEY.")
        try:
            content = response.json()["choices"][0]["message"]["content"]
            return parse_json_text(content)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMError("The AI provider's answer wasn't valid JSON. Try again or use a larger model.") from exc


def parse_json_text(text: str) -> Any:
    """Decode a model's JSON answer, tolerating ```json fences and text around the object."""
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(cleaned)
    except ValueError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(cleaned[start : end + 1])


class FakeLLMClient:
    """Offline stand-in for an LLM.

    By default it reads the condensed report embedded in the prompt and returns well-formed
    claims that cite real evidence ids. Tests can pass ``responder`` to script any output,
    including malformed or hallucinated answers. Every call is recorded in ``calls``.
    """

    model_name = "fake-llm"

    def __init__(self, responder: Callable[[str, str], Any] | None = None) -> None:
        self._responder = responder or _default_responder
        self.calls: list[dict[str, str]] = []

    def complete_json(self, system: str, prompt: str, schema: dict[str, Any]) -> Any:
        self.calls.append({"system": system, "prompt": prompt})
        return self._responder(system, prompt)


def _default_responder(system: str, prompt: str) -> Any:
    if CONTEXT_START in prompt:  # learning tasks (app/learning/generation.py)
        from app.learning.fake import respond  # deferred: avoids a circular import

        return respond(extract_context(prompt))
    return _claims_from_report(system, prompt)


CONTEXT_START = "<context>"
CONTEXT_END = "</context>"


def extract_context(prompt: str) -> dict[str, Any]:
    match = re.search(re.escape(CONTEXT_START) + r"(.*?)" + re.escape(CONTEXT_END), prompt, re.S)
    return json.loads(match.group(1)) if match else {}


def _claims_from_report(system: str, prompt: str) -> dict[str, Any]:
    match = re.search(re.escape(REPORT_START) + r"(.*?)" + re.escape(REPORT_END), prompt, re.S)
    if not match:
        return {"claims": []}
    report = json.loads(match.group(1))
    claims: list[dict[str, Any]] = []

    for fw in report.get("frameworks", []):
        if fw["status"] == "used":
            claims.append({"text": f"The project uses {fw['name']} ({fw['category']}).",
                           "label": "verified", "evidence_ids": fw["evidence_ids"][:3]})
        else:
            claims.append({"text": f"{fw['name']} is declared as a dependency or config, "
                                   "but no source file was found importing it.",
                           "label": "inferred", "evidence_ids": fw["evidence_ids"][:3]})
    routes = report.get("routes", [])
    if routes:
        claims.append({"text": f"The backend registers {len(routes)} Express routes or mounts.",
                       "label": "verified", "evidence_ids": [r["evidence_id"] for r in routes[:5]]})
    for model in report.get("models", []):
        fields = ", ".join(model["fields"]) or "no detected fields"
        claims.append({"text": f"Data model {model['name']} defines: {fields}.",
                       "label": "verified", "evidence_ids": [model["evidence_id"]]})
    return {"claims": claims}
