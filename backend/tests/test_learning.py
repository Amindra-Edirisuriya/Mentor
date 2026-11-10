"""Concepts, learning pathway, explanations, quiz/viva practice, progress and presentations."""

import json
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.analysis.concepts import derive_concepts
from app.analysis.report import analyse_project
from app.api.summaries import get_llm_client
from app.intelligence.llm import FakeLLMClient, LLMError, OpenAICompatibleClient, extract_context
from app.learning import fake
from app.main import app
from tests.conftest import register
from tests.fixtures import MERN_PROJECT, zip_bytes

RBAC_ROUTES = (
    "const express = require('express');\n"
    "const router = express.Router();\n"
    "router.post('/upload', protect, authorizeRoles('artist'), upload.single('audio'), uploadTrack);\n"
    "module.exports = router;\n"
)
USER_MODEL = (
    "const mongoose = require('mongoose');\n"
    "const s = new mongoose.Schema({ name: String, role: { type: String, enum: ['artist', 'listener'] } });\n"
    "module.exports = mongoose.model('User', s);\n"
)


def _project(client: TestClient, extra: dict[str, str] | None = None) -> str:
    files = {**MERN_PROJECT, **(extra or {})}
    response = client.post("/projects", files={"file": ("app.zip", zip_bytes(files), "application/zip")})
    assert response.status_code == 201, response.text
    return response.json()["project_id"]


def _base(project_id: str) -> str:
    return f"/projects/{project_id}/learning"


@pytest.fixture
def scripted() -> Iterator[list[Any]]:
    """Replace the LLM with one returning queued answers (then falls back to the default fake)."""
    queue: list[Any] = []
    default = FakeLLMClient()

    def responder(system: str, prompt: str) -> Any:
        return queue.pop(0) if queue else default.complete_json(system, prompt, {})

    app.dependency_overrides[get_llm_client] = lambda: FakeLLMClient(responder)
    yield queue
    app.dependency_overrides.pop(get_llm_client, None)


# --- deterministic concepts ----------------------------------------------------------------


def test_concepts_detect_role_based_access_and_uploads(make_tree) -> None:
    root = make_tree({**MERN_PROJECT, "soundapp/server/routes/tracks.js": RBAC_ROUTES,
                      "soundapp/server/models/User.js": USER_MODEL})
    report = analyse_project(root).model_dump(mode="json")
    concepts = {c.key: c for c in derive_concepts(report)}

    assert {"rest-api", "data-modelling", "jwt-auth", "components", "http-client", "rbac", "file-uploads"} <= set(concepts)
    rbac_files = {(e.file_path, e.line_start) for e in concepts["rbac"].evidence}
    assert ("soundapp/server/routes/tracks.js", 3) in rbac_files  # authorizeRoles('artist')
    assert any(f.endswith("models/User.js") for f, _ in rbac_files)  # role field
    assert ("soundapp/server/routes/tracks.js", 3) in {(e.file_path, e.line_start) for e in concepts["file-uploads"].evidence}
    # every concept cites real report evidence
    from app.analysis.report import collect_evidence

    ids = set(collect_evidence(report))
    assert all(e.id in ids for c in concepts.values() for e in c.evidence)


def test_declared_only_framework_is_not_a_concept(make_tree) -> None:
    root = make_tree({"package.json": json.dumps({"dependencies": {"react-router-dom": "^6"}})})
    keys = {c.key for c in derive_concepts(analyse_project(root).model_dump(mode="json"))}
    assert "client-routing" not in keys


# --- pathway & explanation -----------------------------------------------------------------


def test_pathway_orders_fundamentals_first_with_resources(client: TestClient) -> None:
    body = client.get(f"{_base(_project(client))}/pathway").json()

    levels = [c["level"] for c in body["concepts"]]
    assert levels == sorted(levels)
    assert body["total"] == len(body["concepts"]) and body["mastered"] == 0
    assert body["next_concept"] == body["concepts"][0]["key"]
    rest = next(c for c in body["concepts"] if c["key"] == "rest-api")
    assert rest["status"] == "not_started" and rest["evidence"]
    assert all(r["url"].startswith("https://") for c in body["concepts"] for r in c["resources"])


def test_explanation_is_cited_and_cached(client: TestClient) -> None:
    base = _base(_project(client))
    assert client.get(f"{base}/concepts/rest-api/explanation").status_code == 404

    created = client.post(f"{base}/concepts/rest-api/explanation").json()
    assert created["claims"] and all(c["evidence_ids"] for c in created["claims"])
    assert client.get(f"{base}/concepts/rest-api/explanation").json() == created
    assert next(c for c in client.get(f"{base}/pathway").json()["concepts"] if c["key"] == "rest-api")["has_explanation"]
    assert client.post(f"{base}/concepts/not-a-concept/explanation").status_code == 404


def test_explanation_rejects_invented_evidence(client: TestClient, scripted: list[Any]) -> None:
    base = _base(_project(client))
    scripted.append({"claims": [{"text": "Uses GraphQL.", "label": "verified", "evidence_ids": ["ev-000000000000"]},
                                {"text": "Guess.", "label": "inferred", "evidence_ids": []}],
                     "key_terms": [{"term": "REST", "meaning": "Representational state transfer"}, "junk"]})
    body = client.post(f"{base}/concepts/rest-api/explanation").json()
    assert body["claims"] == []
    assert len(body["rejected"]) == 2
    assert body["key_terms"] == [{"term": "REST", "meaning": "Representational state transfer"}]


# --- practice, grading, progress -----------------------------------------------------------


def test_quiz_flow_updates_progress(client: TestClient) -> None:
    base = _base(_project(client))
    session = client.post(f"{base}/practice", json={"mode": "quiz", "concept_key": "rest-api", "count": 2}).json()

    assert len(session["questions"]) == 2
    first = session["questions"][0]
    assert first["concept_key"] == "rest-api" and first["evidence"]
    assert "key_points" not in first  # answers stay server-side until graded

    weak = client.post(f"{base}/practice/{session['id']}/answer", json={"index": 0, "answer": "no idea"}).json()
    assert weak["score"] < 50 and weak["missing_points"] and weak["key_points"]
    strong_answer = " ".join(weak["key_points"])
    strong = client.post(f"{base}/practice/{session['id']}/answer", json={"index": 0, "answer": strong_answer}).json()
    assert strong["score"] == 100
    assert strong["concept"]["attempts"] == 2

    progress = client.get(f"{base}/progress").json()
    rest = next(c for c in progress["concepts"] if c["key"] == "rest-api")
    assert rest["attempts"] == 2 and rest["status"] in ("learning", "mastered")
    assert progress["total_attempts"] == 2 and progress["history"][0]["attempts"] == 2
    assert progress["recent"][0]["score"] == 100


def test_mastery_after_consistent_good_answers(client: TestClient) -> None:
    base = _base(_project(client))
    session = client.post(f"{base}/practice", json={"concept_key": "rest-api", "count": 1}).json()
    q = client.post(f"{base}/practice/{session['id']}/answer", json={"index": 0, "answer": "x"}).json()
    for _ in range(3):
        result = client.post(f"{base}/practice/{session['id']}/answer", json={"index": 0, "answer": " ".join(q["key_points"])}).json()
    assert result["concept"]["status"] == "mastered"
    pathway = client.get(f"{base}/pathway").json()
    assert pathway["mastered"] == 1 and pathway["next_concept"] != "rest-api"


def test_viva_without_concept_targets_all_concepts(client: TestClient) -> None:
    base = _base(_project(client))
    session = client.post(f"{base}/practice", json={"mode": "viva", "count": 4}).json()
    assert session["mode"] == "viva" and len(session["questions"]) == 4
    assert all(q["question"].startswith("Why") for q in session["questions"])


def test_ungrounded_questions_are_dropped(client: TestClient, scripted: list[Any]) -> None:
    base = _base(_project(client))
    scripted.append({"questions": [
        {"question": "Explain GraphQL.", "concept_key": "rest-api", "difficulty": "easy", "key_points": ["x"], "evidence_ids": ["ev-000000000000"]},
        {"question": "Uncited?", "concept_key": "rest-api", "difficulty": "easy", "key_points": ["x"], "evidence_ids": []},
    ]})
    response = client.post(f"{base}/practice", json={"concept_key": "rest-api", "count": 2})
    assert response.status_code == 502


def test_grade_is_clamped_and_answer_redacted(client: TestClient, scripted: list[Any]) -> None:
    base = _base(_project(client))
    session = client.post(f"{base}/practice", json={"concept_key": "rest-api", "count": 1}).json()
    prompts: list[str] = []

    def responder(system: str, prompt: str) -> Any:
        prompts.append(prompt)
        return {"score": 900, "feedback": "Great", "missing_points": [], "evidence_ids": ["ev-000000000000"]}

    app.dependency_overrides[get_llm_client] = lambda: FakeLLMClient(responder)
    secret = "AKIAABCDEFGHIJKLMNOP"
    body = client.post(f"{base}/practice/{session['id']}/answer",
                       json={"index": 0, "answer": f"my key is {secret}"}).json()
    assert body["score"] == 100
    assert body["evidence_ids"] and "ev-000000000000" not in body["evidence_ids"]  # invalid id replaced by question's
    assert secret not in prompts[0]


def test_answer_rejects_unknown_session_and_index(client: TestClient) -> None:
    base = _base(_project(client))
    session = client.post(f"{base}/practice", json={"concept_key": "rest-api", "count": 1}).json()
    assert client.post(f"{base}/practice/{session['id']}/answer", json={"index": 5, "answer": "x"}).status_code == 404
    other = "00000000-0000-0000-0000-000000000000"
    assert client.post(f"{base}/practice/{other}/answer", json={"index": 0, "answer": "x"}).status_code == 404


# --- presentation --------------------------------------------------------------------------


def test_presentation_slides_are_cited(client: TestClient) -> None:
    base = _base(_project(client))
    assert client.get(f"{base}/presentation").status_code == 404
    deck = client.post(f"{base}/presentation", json={"minutes": 8}).json()
    assert deck["minutes"] == 8 and deck["slides"]
    assert all(b["evidence_ids"] for s in deck["slides"] for b in s["bullets"])
    assert client.get(f"{base}/presentation").json() == deck


def test_presentation_drops_slides_without_valid_bullets(client: TestClient, scripted: list[Any]) -> None:
    base = _base(_project(client))
    scripted.append({"title": "Deck", "slides": [
        {"title": "Fake", "notes": "", "bullets": [{"text": "Invented", "label": "verified", "evidence_ids": ["ev-000000000000"]}]},
    ]})
    assert client.post(f"{base}/presentation", json={}).status_code == 502


# --- privacy & providers -------------------------------------------------------------------


def test_learning_is_private_to_the_owner(client: TestClient) -> None:
    base = _base(_project(client))
    client.post("/auth/logout")
    register(client, email="eve@example.com")
    for path in ("/pathway", "/progress", "/presentation"):
        assert client.get(base + path).status_code == 404, path
    assert client.post(f"{base}/practice", json={}).status_code == 404


def test_provider_failure_is_a_friendly_502(client: TestClient) -> None:
    base = _base(_project(client))

    def boom(system: str, prompt: str) -> Any:
        raise LLMError("The AI provider's free-tier rate limit was hit.")

    app.dependency_overrides[get_llm_client] = lambda: FakeLLMClient(boom)
    response = client.post(f"{base}/concepts/rest-api/explanation")
    assert response.status_code == 502 and "rate limit" in response.json()["detail"]


def _client_with(handler) -> OpenAICompatibleClient:
    return OpenAICompatibleClient("http://llm.test/v1", "test-model", "key-123", transport=httpx.MockTransport(handler))


def test_openai_compatible_client_sends_json_mode_and_parses_fenced_json() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "```json\n{\"claims\": []}\n```"}}]})

    assert _client_with(handler).complete_json("sys", "prompt", {"type": "object"}) == {"claims": []}
    assert seen["url"] == "http://llm.test/v1/chat/completions"
    assert seen["auth"] == "Bearer key-123"
    assert seen["body"]["model"] == "test-model"
    assert seen["body"]["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(429), "rate limit"),
        (httpx.Response(401), "HTTP 401"),
        (httpx.Response(200, json={"choices": [{"message": {"content": "not json at all"}}]}), "valid JSON"),
    ],
)
def test_openai_compatible_client_errors(response: httpx.Response, message: str) -> None:
    with pytest.raises(LLMError, match=message):
        _client_with(lambda request: response).complete_json("s", "p", {})


def test_openai_compatible_client_unreachable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with pytest.raises(LLMError, match="Couldn't reach"):
        _client_with(handler).complete_json("s", "p", {})


def test_no_api_key_header_for_local_ollama() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    OpenAICompatibleClient("http://localhost:11434/v1", "m", transport=httpx.MockTransport(handler)).complete_json("s", "p", {})
    assert seen["auth"] is None


def test_fake_grade_rewards_key_points() -> None:
    ctx = {"task": "grade", "key_points": ["REST API and routing", "jsonwebtoken"], "evidence": [], "answer": ""}
    assert fake.respond({**ctx, "answer": "dunno"})["score"] == 0
    assert fake.respond({**ctx, "answer": "it is REST routing using jsonwebtoken"})["score"] == 100
    assert extract_context("x <context>{\"a\": 1}</context> y") == {"a": 1}
