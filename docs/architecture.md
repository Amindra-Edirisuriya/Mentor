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

| `backend/app/ingestion/zip_safe.py` | Safe extraction of untrusted ZIP uploads (limits, traversal, symlinks, bombs, nested archives). |
| `backend/app/analysis/evidence.py` | `Evidence` model with deterministic ids. |
| `backend/app/analysis/scanner.py` | File walk, classification, language detection, sensitive-file flags. |
| `backend/app/analysis/manifests.py` | `package.json` / `requirements.txt` / `pyproject.toml` parsing with line evidence. |
| `backend/app/analysis/frameworks.py` | Rule-based technology detection (`declared` → `used`). |
| `backend/app/analysis/structure.py` | Directory tree, packages + roles, entry points, layer hints. |
| `backend/app/analysis/relationships.py` | Tree-sitter JS/TS: imports, Express routes, Mongoose models ([ADR 0003](adr/0003-tree-sitter-for-source-relationships.md)). |

| `backend/app/analysis/report.py` | `analyse_project()` → `AnalysisReport` (schema v1); `collect_evidence()` indexes all evidence by id. |
| `backend/app/models.py` | `projects`, `analysis_runs` (report stored as JSONB). Migration `0001`. |
| `backend/app/api/projects.py` | Upload + report endpoints (below). |

Stack decisions are recorded in [ADR 0001](adr/0001-backend-stack.md).

## API

| Method & path | Purpose |
|---|---|
| `POST /projects` (multipart `file`, optional `name`) | Stream ZIP to `storage/uploads` (size-capped), safe-extract to `storage/projects/<id>/source`, analyse synchronously, persist run + report. 400 for unsafe/non-ZIP, 413 for too large. Unsafe uploads aren't persisted. |
| `GET /projects` | List projects with their runs. |
| `GET /projects/{id}` | One project with runs. |
| `GET /projects/{id}/report` | Latest successful run's report JSON. |
| `POST /projects/{id}/summary` | Generate evidence-grounded claims for the latest report (fake LLM by default) and store them. |
| `GET /projects/{id}/summary` | Stored summary (validated claims + rejected claims). |

## Intelligence layer (increment 7)

| Path | Purpose |
|---|---|
| `backend/app/security/redaction.py` | Secret detection/redaction applied to snippets and the full prompt. |
| `backend/app/intelligence/llm.py` | `LLMClient` protocol; `FakeLLMClient` (deterministic, offline). |
| `backend/app/intelligence/snippets.py` | Redacted code context around cited evidence; sensitive files are never read. |
| `backend/app/intelligence/summary.py` | Condensed report + snippets → prompt → validated `ProjectSummary`. |
| `backend/app/intelligence/validation.py` | Citation validation and verified/inferred/unknown labelling policy. |

`LLM_PROVIDER` defaults to `fake`; any other value returns 503 until a real provider is approved
and recorded in an ADR. A test enforces that `app/analysis` never imports `app.intelligence` or
an LLM SDK.

Analysis runs inside the request for Milestone 1. A background worker can replace this later
without changing the `analysis_runs` model (`status` already supports `running`).

## Configuration

All configuration comes from environment variables, optionally loaded from a
git-ignored `.env` at the repo root (template: `.env.example`). Secrets are never
committed or logged.

| Variable | Used by | Default |
|---|---|---|
| `APP_ENV` | backend | `development` |
| `DATABASE_URL` | backend, Alembic | local dev URL (`postgresql+psycopg://...@localhost:5433/engimentor`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | docker-compose | `engimentor` / *(required)* / `engimentor` / `5433` |
| `STORAGE_DIR` | backend | `<repo>/storage` |
| `MAX_UPLOAD_MB` | backend | `50` |
| `LLM_PROVIDER` | backend | `fake` |

The Docker database is published on host port **5433** so it doesn't collide with
a native PostgreSQL service on 5432 (inside the container it still listens on 5432).

## Security boundaries (planned, from CLAUDE.md)

- Uploaded projects are untrusted: never executed, imported, installed or built.
- ZIP ingestion enforces size, file-count and compression-ratio limits and rejects
  absolute paths, `..`, symlinks, nested archives and escapes from the destination.
- Uploaded data lives under `storage/` (git-ignored).
- Secrets are detected and redacted before anything reaches an LLM.
