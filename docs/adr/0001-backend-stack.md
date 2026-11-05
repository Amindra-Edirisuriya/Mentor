# ADR 0001: Backend stack

- Status: Accepted
- Date: 2026-11-05

## Context

EngiMentor needs an HTTP API for uploads and reports, durable storage for projects
and analysis runs (with a flexible report document), schema migrations, and typed
configuration. The project is built by a small team, so the stack should be
mainstream, well documented and quick to test.

## Decision

- **Python 3.12+** with type hints throughout.
- **FastAPI** for the HTTP API, served by **uvicorn**. It gives typed request and
  response models (Pydantic) and a built-in `TestClient`.
- **PostgreSQL 16**, run locally through **docker-compose**. JSONB will store the
  analysis report (increment 6) without an early, rigid schema.
- **SQLAlchemy 2.0** (typed ORM, `DeclarativeBase`) with synchronous sessions.
  Async isn't needed yet; analysis is CPU-bound and runs off the request path.
- **psycopg 3** (`psycopg[binary]`) as the Postgres driver, selected with the
  `postgresql+psycopg://` URL scheme.
- **Alembic** for migrations. `env.py` reads the URL from app settings, so `.env`
  is the only place it is configured.
- **pydantic-settings** for configuration from env vars and a git-ignored `.env`.
- **pytest** (+ **httpx**, required by FastAPI's `TestClient`) for tests.
- Packaging with **setuptools** via `backend/pyproject.toml` (`pip install -e ".[dev]"`).

## Consequences

- One language and one validation library (Pydantic) across API, config and,
  later, LLM structured outputs.
- Synchronous SQLAlchemy keeps code simple. If request concurrency becomes a
  problem, moving to async sessions is a contained change in `app/db.py`.
- Developers need Docker for the database. Tests that don't need the DB (such as
  `/health`) run without it.
