"""Validate LLM claims against the report's evidence index (CLAUDE.md rule 3).

Policy:
- Unknown evidence ids are removed from a claim.
- A claim that cited ids but none were valid is rejected (fabricated citation).
- A ``verified``/``inferred`` claim with no citations is rejected.
- A ``verified`` claim that lost some citations is downgraded to ``inferred``.
- ``unknown`` claims may have no citations (they state uncertainty, not fact).
- Unrecognised labels become ``unknown``; malformed claims are rejected.
"""

from typing import Any

from pydantic import BaseModel, Field

LABELS = ("verified", "inferred", "unknown")
MAX_CLAIM_CHARS = 500


class ValidatedClaim(BaseModel):
    text: str
    label: str
    evidence_ids: list[str]
    downgraded_from: str | None = None
    dropped_evidence_ids: list[str] = Field(default_factory=list)


class RejectedClaim(BaseModel):
    text: str
    reason: str


class ValidationOutcome(BaseModel):
    claims: list[ValidatedClaim] = Field(default_factory=list)
    rejected: list[RejectedClaim] = Field(default_factory=list)


def validate_claims(raw: Any, valid_ids: set[str]) -> ValidationOutcome:
    outcome = ValidationOutcome()
    items = raw.get("claims") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        outcome.rejected.append(RejectedClaim(text="", reason="Model output did not contain a claims list."))
        return outcome

    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("text"), str) or not item["text"].strip():
            outcome.rejected.append(RejectedClaim(text=str(item)[:200], reason="Malformed claim."))
            continue
        text = item["text"].strip()[:MAX_CLAIM_CHARS]
        label = item.get("label") if item.get("label") in LABELS else "unknown"
        cited = item.get("evidence_ids")
        cited = [c for c in cited if isinstance(c, str)] if isinstance(cited, list) else []
        cited = list(dict.fromkeys(cited))  # dedupe, keep order
        valid = [c for c in cited if c in valid_ids]
        dropped = [c for c in cited if c not in valid_ids]

        if cited and not valid:
            outcome.rejected.append(RejectedClaim(text=text, reason="All cited evidence ids are invalid."))
            continue
        if not cited and label != "unknown":
            outcome.rejected.append(RejectedClaim(text=text, reason=f"'{label}' claim has no citations."))
            continue

        downgraded_from = None
        if dropped and label == "verified":
            label, downgraded_from = "inferred", "verified"
        outcome.claims.append(
            ValidatedClaim(text=text, label=label, evidence_ids=valid,
                           downgraded_from=downgraded_from, dropped_evidence_ids=dropped)
        )
    return outcome
