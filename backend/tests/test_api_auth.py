"""Accounts, cookie sessions, password reset and per-user project privacy."""

import logging
import re
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.models import PasswordResetToken, User, UserSession
from app.security.auth import SESSION_COOKIE, now, password_problem
from tests.conftest import PASSWORD, register
from tests.fixtures import MERN_PROJECT, zip_bytes


def login(client: TestClient, email: str = "ada@example.com", password: str = PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def upload(client: TestClient):
    return client.post("/projects", files={"file": ("app.zip", zip_bytes(MERN_PROJECT), "application/zip")})


def reset_link(caplog: pytest.LogCaptureFixture) -> str:
    match = re.search(r"reset-password\?token=([\w-]+)", caplog.text)
    assert match, caplog.text
    return match.group(1)


# --- register / login / logout -------------------------------------------------------------


def test_register_signs_in_with_httponly_cookie(anon_client: TestClient, db_session_factory) -> None:
    response = register(anon_client, email="  Ada@Example.COM ")

    assert response.status_code == 201
    assert response.json()["email"] == "ada@example.com"
    assert "password" not in response.text
    cookie = response.headers["set-cookie"]
    assert SESSION_COOKIE in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()
    assert anon_client.get("/auth/me").json()["name"] == "Ada"

    with db_session_factory() as db:
        user = db.scalar(select(User))
        assert user.password_hash.startswith("$argon2id$")
        token = anon_client.cookies[SESSION_COOKIE]
        assert db.get(UserSession, token) is None  # only the hash is stored


def test_register_rejects_duplicates_and_weak_input(anon_client: TestClient) -> None:
    assert register(anon_client).status_code == 201
    assert register(anon_client, email="ADA@example.com").status_code == 409
    assert register(anon_client, email="not-an-email").status_code == 400
    assert register(anon_client, email="b@example.com", password="short1").status_code == 400
    assert register(anon_client, email="c@example.com", name="   ").status_code == 400


@pytest.mark.parametrize(
    ("password", "ok"),
    [("abc12345", True), ("abcdefgh", False), ("12345678", False), ("a1" * 70, False), ("a@b.com1", True)],
)
def test_password_policy(password: str, ok: bool) -> None:
    assert (password_problem(password) is None) is ok


def test_password_cannot_be_email() -> None:
    assert password_problem("ada@example.com", "ada@example.com")


def test_login_logout_and_generic_errors(anon_client: TestClient) -> None:
    register(anon_client)
    anon_client.post("/auth/logout")
    assert anon_client.get("/auth/me").status_code == 401

    wrong_password = login(anon_client, password="nope-nope-1")
    unknown_email = login(anon_client, email="ghost@example.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()  # no account enumeration

    assert login(anon_client, email="ADA@example.com").status_code == 200
    assert anon_client.get("/auth/me").status_code == 200


def test_logout_revokes_session_server_side(client: TestClient) -> None:
    stolen = client.cookies[SESSION_COOKIE]
    client.post("/auth/logout")
    client.cookies.set(SESSION_COOKIE, stolen)
    assert client.get("/auth/me").status_code == 401


def test_expired_session_is_rejected(client: TestClient, db_session_factory) -> None:
    with db_session_factory() as db:
        for session in db.scalars(select(UserSession)):
            session.expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert client.get("/auth/me").status_code == 401


def test_secure_cookie_outside_development(anon_client: TestClient, test_settings: Settings) -> None:
    test_settings.app_env = "production"
    assert "Secure" in register(anon_client).headers["set-cookie"]


# --- profile / password / delete -----------------------------------------------------------


def test_update_profile(client: TestClient) -> None:
    assert client.patch("/auth/me", json={"name": "  Ada Lovelace "}).json()["name"] == "Ada Lovelace"
    assert client.patch("/auth/me", json={"name": " "}).status_code == 400


def test_change_password_signs_out_other_devices(
    client: TestClient, test_settings: Settings, db_session_factory
) -> None:
    other_device = client.cookies[SESSION_COOKIE]
    bad = client.post("/auth/change-password", json={"current_password": "wrong-pass-1", "new_password": "new-pass-99"})
    assert bad.status_code == 400

    ok = client.post("/auth/change-password", json={"current_password": PASSWORD, "new_password": "new-pass-99"})
    assert ok.status_code == 204
    assert client.get("/auth/me").status_code == 200  # this device stays signed in
    with db_session_factory() as db:
        assert db.get(UserSession, other_device) is None
        assert len(list(db.scalars(select(UserSession)))) == 1
    client.post("/auth/logout")
    assert login(client).status_code == 401
    assert login(client, password="new-pass-99").status_code == 200


def test_delete_account_removes_projects_and_files(client: TestClient, test_settings: Settings) -> None:
    project_id = upload(client).json()["project_id"]
    source = test_settings.storage_dir / "projects" / project_id
    assert source.is_dir()

    assert client.request("DELETE", "/auth/me", json={"password": "wrong-pass-1"}).status_code == 400
    assert client.request("DELETE", "/auth/me", json={"password": PASSWORD}).status_code == 204

    assert not source.exists()
    assert client.get("/auth/me").status_code == 401
    assert login(client).status_code == 401


# --- password reset ------------------------------------------------------------------------


def test_password_reset_flow(
    anon_client: TestClient, caplog: pytest.LogCaptureFixture, db_session_factory: sessionmaker[Session]
) -> None:
    register(anon_client)
    with caplog.at_level(logging.WARNING, logger="app.email"):
        response = anon_client.post("/auth/forgot-password", json={"email": "ada@example.com"})
    assert response.status_code == 202
    token = reset_link(caplog)

    with db_session_factory() as db:
        assert db.get(PasswordResetToken, token) is None  # only the hash is stored

    assert anon_client.post("/auth/reset-password", json={"token": token, "new_password": "weak"}).status_code == 400
    assert anon_client.post("/auth/reset-password", json={"token": token, "new_password": "fresh-pass-7"}).status_code == 204
    assert anon_client.get("/auth/me").status_code == 401  # existing sessions ended
    again = anon_client.post("/auth/reset-password", json={"token": token, "new_password": "other-pass-8"})
    assert again.status_code == 400  # single use
    assert login(anon_client, password="fresh-pass-7").status_code == 200


def test_forgot_password_does_not_reveal_accounts(anon_client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    register(anon_client)
    with caplog.at_level(logging.WARNING, logger="app.email"):
        known = anon_client.post("/auth/forgot-password", json={"email": "ada@example.com"})
        unknown = anon_client.post("/auth/forgot-password", json={"email": "ghost@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert "ghost@example.com" not in caplog.text


def test_only_newest_reset_link_works_and_links_expire(
    anon_client: TestClient, caplog: pytest.LogCaptureFixture, db_session_factory
) -> None:
    register(anon_client)
    with caplog.at_level(logging.WARNING, logger="app.email"):
        anon_client.post("/auth/forgot-password", json={"email": "ada@example.com"})
        first = reset_link(caplog)
        caplog.clear()
        anon_client.post("/auth/forgot-password", json={"email": "ada@example.com"})
        second = reset_link(caplog)

    assert anon_client.post("/auth/reset-password", json={"token": first, "new_password": "fresh-pass-7"}).status_code == 400
    with db_session_factory() as db:
        for record in db.scalars(select(PasswordResetToken)):
            record.expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert anon_client.post("/auth/reset-password", json={"token": second, "new_password": "fresh-pass-7"}).status_code == 400


# --- privacy -------------------------------------------------------------------------------


def test_project_endpoints_require_sign_in(anon_client: TestClient) -> None:
    assert anon_client.get("/projects").status_code == 401
    assert upload(anon_client).status_code == 401


def test_users_cannot_see_each_others_projects(client: TestClient) -> None:
    project_id = upload(client).json()["project_id"]
    client.post("/auth/logout")
    register(client, email="eve@example.com", name="Eve")

    assert client.get("/projects").json() == []
    for path in (f"/projects/{project_id}", f"/projects/{project_id}/report", f"/projects/{project_id}/summary"):
        assert client.get(path).status_code == 404, path
    assert client.post(f"/projects/{project_id}/summary").status_code == 404
