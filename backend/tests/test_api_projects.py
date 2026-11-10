import uuid

from fastapi.testclient import TestClient

from app.config import Settings
from tests.fixtures import MERN_PROJECT, zip_bytes


def upload(client: TestClient, data: bytes, filename: str = "soundapp.zip", **form: str):
    return client.post("/projects", files={"file": (filename, data, "application/zip")}, data=form)


def test_upload_analyse_and_fetch_report(client: TestClient, test_settings: Settings) -> None:
    response = upload(client, zip_bytes(MERN_PROJECT))

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "succeeded"
    assert "Express" in body["summary"]["frameworks_used"]
    project_id = body["project_id"]

    source = test_settings.storage_dir / "projects" / project_id / "source"
    assert (source / "soundapp/server/index.js").is_file()
    assert not any((test_settings.storage_dir / "uploads").iterdir())  # temp upload removed

    project = client.get(f"/projects/{project_id}").json()
    assert project["name"] == "soundapp"
    assert [r["status"] for r in project["runs"]] == ["succeeded"]

    listing = client.get("/projects").json()
    assert [p["id"] for p in listing] == [project_id]

    report = client.get(f"/projects/{project_id}/report").json()
    assert report["run_id"] == body["run_id"]
    assert report["report"]["summary"]["route_count"] == 3
    assert report["report"]["structure"]["root_prefix"] == "soundapp"


def test_custom_name_is_sanitised(client: TestClient) -> None:
    response = upload(client, zip_bytes({"a.js": "x"}), name="My <b>App</b>")
    project = client.get(f"/projects/{response.json()['project_id']}").json()
    assert project["name"] == "My bAppb"


def test_rejects_non_zip_filename(client: TestClient) -> None:
    response = upload(client, b"hello", filename="notes.txt")
    assert response.status_code == 400
    assert client.get("/projects").json() == []


def test_rejects_malicious_archive_without_persisting(client: TestClient, test_settings: Settings) -> None:
    response = upload(client, zip_bytes({"../../evil.js": "pwned"}))

    assert response.status_code == 400
    assert "traversal" in response.json()["detail"]
    assert client.get("/projects").json() == []
    assert not any((test_settings.storage_dir / "projects").glob("*"))


def test_rejects_oversized_upload(client: TestClient, test_settings: Settings) -> None:
    big = b"x" * (test_settings.max_upload_mb * 1024 * 1024 + 1)
    response = upload(client, big)
    assert response.status_code == 413


def test_unknown_project_404(client: TestClient) -> None:
    missing = uuid.uuid4()
    assert client.get(f"/projects/{missing}").status_code == 404
    assert client.get(f"/projects/{missing}/report").status_code == 404


def test_analysis_failure_is_recorded(client: TestClient, monkeypatch) -> None:
    def boom(*args, **kwargs):
        raise RuntimeError("bug")

    monkeypatch.setattr("app.api.projects.analyse_project", boom)
    response = upload(client, zip_bytes({"a.js": "x"}))

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "failed" and "internal error" in body["error"]
    assert client.get(f"/projects/{body['project_id']}/report").status_code == 404


def test_reanalyse_uses_stored_source_and_becomes_latest_run(client: TestClient, test_settings: Settings) -> None:
    body = upload(client, zip_bytes({"src/app.js": "const x = 1;\n"})).json()
    project_id = body["project_id"]
    assert client.get(f"/projects/{project_id}/report").json()["report"]["summary"]["frameworks_used"] == []

    # Simulate a detector improvement by changing what the stored source contains.
    source = test_settings.storage_dir / "projects" / project_id / "source"
    (source / "src/app.js").write_text('import React from "react";\n', encoding="utf-8")

    again = client.post(f"/projects/{project_id}/reanalyse")
    assert again.status_code == 200, again.text
    assert again.json()["status"] == "succeeded" and again.json()["run_id"] != body["run_id"]
    report = client.get(f"/projects/{project_id}/report").json()
    assert report["run_id"] == again.json()["run_id"]
    assert report["report"]["summary"]["frameworks_used"] == ["React"]


def test_reanalyse_without_stored_source_is_404(client: TestClient, test_settings: Settings) -> None:
    import shutil

    project_id = upload(client, zip_bytes({"a.js": "x"})).json()["project_id"]
    shutil.rmtree(test_settings.storage_dir / "projects" / project_id / "source")
    assert client.post(f"/projects/{project_id}/reanalyse").status_code == 404
    assert client.post(f"/projects/{uuid.uuid4()}/reanalyse").status_code == 404
