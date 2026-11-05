import ast
from pathlib import Path

from app.analysis.report import analyse_project, collect_evidence
from app.intelligence.llm import FakeLLMClient
from app.intelligence.summary import generate_summary
from app.intelligence.validation import validate_claims
from tests.fixtures import MERN_PROJECT

APP_DIR = Path(__file__).resolve().parents[1] / "app"


def _report(make_tree, extra: dict[str, str] | None = None):
    root = make_tree({**MERN_PROJECT, **(extra or {})})
    return root, analyse_project(root).model_dump(mode="json")


# --- validation policy --------------------------------------------------------------------

def test_validation_policy() -> None:
    valid = {"ev-aaaaaaaaaaaa", "ev-bbbbbbbbbbbb"}
    raw = {
        "claims": [
            {"text": "Uses Express.", "label": "verified", "evidence_ids": ["ev-aaaaaaaaaaaa"]},
            {"text": "Has auth.", "label": "verified", "evidence_ids": ["ev-aaaaaaaaaaaa", "ev-fake00000000"]},
            {"text": "Made up.", "label": "verified", "evidence_ids": ["ev-fake00000000"]},
            {"text": "No cite.", "label": "inferred", "evidence_ids": []},
            {"text": "Unclear if tests exist.", "label": "unknown", "evidence_ids": []},
            {"text": "Weird label.", "label": "certain", "evidence_ids": ["ev-bbbbbbbbbbbb"]},
            {"label": "verified", "evidence_ids": ["ev-aaaaaaaaaaaa"]},
            "not a dict",
        ]
    }

    outcome = validate_claims(raw, valid)

    kept = {c.text: c for c in outcome.claims}
    assert kept["Uses Express."].label == "verified"
    assert kept["Has auth."].label == "inferred"
    assert kept["Has auth."].downgraded_from == "verified"
    assert kept["Has auth."].evidence_ids == ["ev-aaaaaaaaaaaa"]
    assert kept["Has auth."].dropped_evidence_ids == ["ev-fake00000000"]
    assert kept["Unclear if tests exist."].label == "unknown"
    assert kept["Weird label."].label == "unknown"
    rejected = {r.text: r.reason for r in outcome.rejected}
    assert "invalid" in rejected["Made up."]
    assert "no citations" in rejected["No cite."]
    assert len(outcome.rejected) == 4


def test_validation_handles_malformed_output() -> None:
    for raw in (None, "text", {"claims": "nope"}, {}):
        outcome = validate_claims(raw, {"ev-aaaaaaaaaaaa"})
        assert outcome.claims == [] and len(outcome.rejected) == 1


# --- end to end with the fake client ----------------------------------------------------

def test_fake_summary_claims_all_cite_real_evidence(make_tree) -> None:
    root, report = _report(make_tree)
    client = FakeLLMClient()

    summary = generate_summary(report, root, client)

    index = collect_evidence(report)
    assert summary.model == "fake-llm"
    assert summary.claims and summary.rejected == []
    assert all(set(c.evidence_ids) <= index.keys() for c in summary.claims)
    texts = " ".join(c.text for c in summary.claims)
    assert "Express" in texts and "Song" in texts
    multer = next(c for c in summary.claims if "Multer" in c.text)
    assert multer.label == "inferred"  # declared but never imported
    assert summary.snippet_count > 0


def test_prompt_contains_no_secrets_or_env_files(make_tree) -> None:
    hardcoded = {
        "soundapp/server/routes/auth.js": (
            "const express = require('express');\n"
            "const router = express.Router();\n"
            "const JWT_SECRET = 'hardcoded-jwt-secret-999';\n"
            "router.post('/login', (req, res) => {});\n"
            "module.exports = router;\n"
        )
    }
    root, report = _report(make_tree, hardcoded)
    client = FakeLLMClient()

    summary = generate_summary(report, root, client)

    prompt = client.calls[0]["prompt"]
    assert "hardcoded-jwt-secret-999" not in prompt
    assert "super-secret-value-123" not in prompt  # from server/.env
    assert "user:pass@" not in prompt
    assert "[REDACTED:secret]" in prompt
    assert summary.redactions >= 1


def test_hallucinating_model_is_contained(make_tree) -> None:
    root, report = _report(make_tree)
    real_id = next(iter(collect_evidence(report)))

    def responder(system: str, prompt: str):
        return {"claims": [
            {"text": "Uses GraphQL.", "label": "verified", "evidence_ids": ["ev-000000000000"]},
            {"text": "Has a payments module.", "label": "verified", "evidence_ids": []},
            {"text": "Has an Express server.", "label": "verified", "evidence_ids": [real_id, "ev-111111111111"]},
        ]}

    summary = generate_summary(report, root, FakeLLMClient(responder))

    assert [c.text for c in summary.claims] == ["Has an Express server."]
    assert summary.claims[0].label == "inferred"
    assert {r.text for r in summary.rejected} == {"Uses GraphQL.", "Has a payments module."}


# --- architecture boundary (CLAUDE.md rule 1) ---------------------------------------------

def test_analysis_never_imports_intelligence_or_llm_sdks() -> None:
    forbidden = ("app.intelligence", "anthropic", "openai", "google.generativeai", "langchain")
    for path in (APP_DIR / "analysis").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for name in names:
                assert not name.startswith(forbidden), f"{path.name} imports {name}"
