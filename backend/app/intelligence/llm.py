"""LLM client interface and the deterministic fake used in development and tests.

No real provider is wired in yet: adding one is a paid external service and needs approval
(CLAUDE.md). Anything implementing ``LLMClient`` can be dropped in later.
"""

import json
import re
from collections.abc import Callable
from typing import Any, Protocol

REPORT_START = "<report>"
REPORT_END = "</report>"


class LLMClient(Protocol):
    model_name: str

    def complete_json(self, system: str, prompt: str, schema: dict[str, Any]) -> Any:
        """Return the model's structured (JSON-decoded) answer for ``prompt``."""
        ...


class FakeLLMClient:
    """Offline stand-in for an LLM.

    By default it reads the condensed report embedded in the prompt and returns well-formed
    claims that cite real evidence ids. Tests can pass ``responder`` to script any output,
    including malformed or hallucinated answers. Every call is recorded in ``calls``.
    """

    model_name = "fake-llm"

    def __init__(self, responder: Callable[[str, str], Any] | None = None) -> None:
        self._responder = responder or _claims_from_report
        self.calls: list[dict[str, str]] = []

    def complete_json(self, system: str, prompt: str, schema: dict[str, Any]) -> Any:
        self.calls.append({"system": system, "prompt": prompt})
        return self._responder(system, prompt)


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
