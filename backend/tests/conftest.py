from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (register tables)
from app.config import Settings, get_settings
from app.db import Base, get_db
from app.main import app


def write_tree(root: Path, files: dict[str, str | bytes]) -> Path:
    """Create files under ``root`` from a {relative_path: content} mapping."""
    for rel, content in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8", newline="\n")
    return root


@pytest.fixture
def make_tree(tmp_path: Path):
    def _make(files: dict[str, str | bytes], name: str = "proj") -> Path:
        return write_tree(tmp_path / name, files)

    return _make


@pytest.fixture
def test_settings(tmp_path: Path) -> Settings:
    return Settings(database_url="sqlite://", storage_dir=tmp_path / "storage", max_upload_mb=5)


@pytest.fixture
def db_session_factory() -> Iterator[sessionmaker[Session]]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    engine.dispose()


PASSWORD = "correct-horse-42"


def register(client: TestClient, email: str = "ada@example.com", name: str = "Ada", password: str = PASSWORD):
    return client.post("/auth/register", json={"name": name, "email": email, "password": password})


@pytest.fixture
def anon_client(test_settings: Settings, db_session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    """A client with no session cookie."""

    def override_db() -> Iterator[Session]:
        with db_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: test_settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def client(anon_client: TestClient) -> TestClient:
    """A client signed in as a freshly registered user (the session cookie is kept)."""
    assert register(anon_client).status_code == 201
    return anon_client
