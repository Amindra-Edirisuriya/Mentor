from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from tests.fixtures import MERN_PROJECT, zip_bytes


def _create(client: TestClient) -> str:
    response = client.post("/projects", files={"file": ("s.zip", zip_bytes(MERN_PROJECT), "application/zip")})
    return response.json()["project_id"]


def test_generate_and_fetch_summary(client: TestClient) -> None:
    project_id = _create(client)
    assert client.get(f"/projects/{project_id}/summary").status_code == 404

    created = client.post(f"/projects/{project_id}/summary")

    assert created.status_code == 200, created.text
    summary = created.json()["summary"]
    assert summary["model"] == "fake-llm"
    assert summary["claims"] and all(c["evidence_ids"] for c in summary["claims"] if c["label"] != "unknown")
    assert client.get(f"/projects/{project_id}/summary").json()["summary"] == summary


def test_unconfigured_provider_returns_503(client: TestClient, test_settings: Settings) -> None:
    project_id = _create(client)
    app.dependency_overrides[get_settings] = lambda: test_settings.model_copy(update={"llm_provider": "other"})

    response = client.post(f"/projects/{project_id}/summary")

    assert response.status_code == 503
