"""Evidence-grounded project summary: condensed report + redacted snippets -> validated claims."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.analysis.evidence import Evidence
from app.analysis.report import collect_evidence
from app.intelligence.llm import REPORT_END, REPORT_START, LLMClient
from app.intelligence.snippets import Snippet, build_snippets
from app.intelligence.validation import RejectedClaim, ValidatedClaim, validate_claims
from app.security.redaction import redact

MAX_ROUTES_IN_PROMPT = 100

SYSTEM_PROMPT = """\
You explain a software project to the student who built it. You receive a deterministic
analysis report and a few source snippets. Rules:
- Only state things supported by the report or snippets.
- Every claim must cite one or more evidence ids exactly as given (e.g. "ev-1a2b3c4d5e6f").
- Label each claim: "verified" (directly shown by the cited evidence), "inferred" (a reasonable
  conclusion from the evidence), or "unknown" (you cannot tell; citations optional).
- Do not invent files, features, libraries or evidence ids.
Respond with JSON matching the given schema."""

CLAIMS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "label": {"type": "string", "enum": ["verified", "inferred", "unknown"]},
                    "evidence_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["text", "label", "evidence_ids"],
            },
        }
    },
    "required": ["claims"],
}


class ProjectSummary(BaseModel):
    model: str
    generated_at: datetime
    claims: list[ValidatedClaim]
    rejected: list[RejectedClaim] = Field(default_factory=list)
    snippet_count: int
    redactions: int  # secrets redacted from snippets/prompt


def condense_report(report: dict[str, Any]) -> dict[str, Any]:
    """The subset of the report the model sees: findings plus their evidence ids, no raw files."""
    rel = report["relationships"]
    return {
        "summary": report["summary"],
        "frameworks": [
            {"name": f["name"], "category": f["category"], "status": f["status"],
             "evidence_ids": [e["id"] for e in f["evidence"]]}
            for f in report["frameworks"]
        ],
        "packages": [
            {"directory": p["directory"], "role": p["role"], "name": p["name"],
             "entry_points": [{"path": e["path"], "reason": e["reason"], "evidence_id": e["evidence"]["id"]}
                              for e in p["entry_points"]]}
            for p in report["structure"]["packages"]
        ],
        "routes": [
            {"method": r["method"], "path": r["path"], "file": r["file"],
             "middleware": r["middleware"], "evidence_id": r["evidence"]["id"]}
            for r in rel["routes"][:MAX_ROUTES_IN_PROMPT]
        ],
        "models": [
            {"name": m["name"], "file": m["file"], "fields": m["fields"], "refs": m["refs"],
             "evidence_id": m["evidence"]["id"]}
            for m in rel["models"]
        ],
    }


def _snippet_evidence(report: dict[str, Any], index: dict[str, Evidence]) -> list[Evidence]:
    """Evidence worth showing code for: routes, models, then usage imports."""
    ids = [r["evidence"]["id"] for r in report["relationships"]["routes"]]
    ids += [m["evidence"]["id"] for m in report["relationships"]["models"]]
    for f in report["frameworks"]:
        ids += [e["id"] for e in f["evidence"] if e["detector"] == "ts-imports"][:1]
    return [index[i] for i in dict.fromkeys(ids) if i in index]


def build_prompt(condensed: dict[str, Any], snippets: list[Snippet]) -> str:
    snippet_text = "\n\n".join(
        f"[{s.evidence_id}] {s.file_path}:{s.line_start}-{s.line_end}\n{s.code}" for s in snippets
    )
    return (
        "Summarise what this project does and which concepts it uses, as cited claims.\n\n"
        f"{REPORT_START}{json.dumps(condensed, sort_keys=True)}{REPORT_END}\n\n"
        f"<snippets>\n{snippet_text}\n</snippets>"
    )


def generate_summary(report: dict[str, Any], source_root: Path, client: LLMClient) -> ProjectSummary:
    index = collect_evidence(report)
    snippets = build_snippets(report, source_root, _snippet_evidence(report, index))
    prompt_result = redact(build_prompt(condense_report(report), snippets))  # final safety net
    raw = client.complete_json(SYSTEM_PROMPT, prompt_result.text, CLAIMS_SCHEMA)
    outcome = validate_claims(raw, set(index))
    return ProjectSummary(
        model=client.model_name,
        generated_at=datetime.now(UTC),
        claims=outcome.claims,
        rejected=outcome.rejected,
        snippet_count=len(snippets),
        redactions=sum(1 for s in snippets if s.redacted) + len(prompt_result.kinds),
    )
