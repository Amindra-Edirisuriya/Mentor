# EngiMentor architecture

Status: Milestone 1, increment 0 (scaffolding). This document describes what exists
now and the boundaries the rest of Milestone 1 will follow. Update it when the
architecture changes.

## Overview

EngiMentor analyses a software project (ZIP upload in Milestone 1), maps the
concepts it uses to real source locations, finds knowledge gaps and generates
learning material. The system has two halves with a strict boundary between them:

```
 ZIP upload ──► ingestion ──► analysis (deterministic) ──► report (JSONB, evidence ids)
                                                             │
                                                             ▼
                                   intelligence (LLM) ◄── redacted snippets
                                                             │
                                                             ▼
                                         claims citing evidence ids, validated in code
```

- **Analysis** (`backend/app/analysis/`, planned): deterministic, rule-based and
  Tree-sitter-based. Never imports from `intelligence/` and never calls an LLM.
  Every finding carries evidence: id, file path, line range, detector name.
- **Intelligence** (`backend/app/intelligence/`, planned): receives only the
  analysis report and redacted snippets. Every claim must cite evidence ids and be
  labelled verified / inferred / unknown. Citations are validated in code. See
  [ADR 0002](adr/0002-deterministic-analysis-separate-from-llm.md).

## Components (current)

| Path | Purpose |
|---|---|
| `backend/app/main.py` | FastAPI app. `GET /health` is a liveness check that does not touch the DB. |
| `backend/app/config.py` | `Settings` (pydantic-settings) from env vars and repo-root `.env`. |
| `backend/app/db.py` | SQLAlchemy 2 engine, `SessionLocal`, `Base`, `get_db` dependency. The engine connects lazily. |
| `backend/alembic/` | Migrations. `env.py` takes the DB URL from `Settings` and targets `Base.metadata`. No migrations yet. |
| `docker-compose.yml` | Local PostgreSQL 16 (`db` service) with a named volume and healthcheck. |
| `backend/tests/` | pytest suite. |

Stack decisions are recorded in [ADR 0001](adr/0001-backend-stack.md).

## Configuration

All configuration comes from environment variables, optionally loaded from a
git-ignored `.env` at the repo root (template: `.env.example`). Secrets are never
committed or logged.

| Variable | Used by | Default |
|---|---|---|
| `APP_ENV` | backend | `development` |
| `DATABASE_URL` | backend, Alembic | local dev URL (`postgresql+psycopg://...@localhost:5433/engimentor`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | docker-compose | `engimentor` / *(required)* / `engimentor` / `5433` |

The Docker database is published on host port **5433** so it doesn't collide with
a native PostgreSQL service on 5432 (inside the container it still listens on 5432).

## Security boundaries (planned, from CLAUDE.md)

- Uploaded projects are untrusted: never executed, imported, installed or built.
- ZIP ingestion enforces size, file-count and compression-ratio limits and rejects
  absolute paths, `..`, symlinks, nested archives and escapes from the destination.
- Uploaded data lives under `storage/` (git-ignored).
- Secrets are detected and redacted before anything reaches an LLM.
