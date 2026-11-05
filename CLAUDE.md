# EngiMentor — AI-Powered Engineering Project Intelligence Platform

## Product
Helps students and independent developers understand software projects they built
but don't fully understand. Analyses a project, maps the concepts it uses to real
source locations, finds knowledge gaps, and generates learning and evaluation.
Audience: university CS/engineering students and independent developers.
Input: ZIP uploads (Milestone 1), GitHub repos (later).

## Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS (`frontend/`)
- Backend: Python + FastAPI, SQLAlchemy, Alembic, PostgreSQL (`backend/`)
- Parsing: Tree-sitter. AI: LLM API with structured outputs.
- Storage: local disk (`storage/`, git-ignored). Docker for Postgres.

## Architecture rules (non-negotiable)
1. `backend/app/analysis/` is deterministic and must NEVER import from
   `backend/app/intelligence/` or call an LLM.
2. Every finding carries evidence: id, file path, line range, detector name.
3. The LLM receives only the analysis report plus redacted snippets. Every claim
   it returns must cite evidence ids and be labelled verified / inferred / unknown.
   Citations are validated in code; uncited or invalid claims are rejected or downgraded.
4. Uploaded projects are untrusted. Never execute, import, install or build them.
5. ZIP ingestion must enforce: size limits, file-count limit, compression-ratio
   limit, no absolute paths, no `..`, no symlinks, resolved path stays inside the
   destination, no nested-archive extraction, no execute permissions.
6. Detect and redact secrets (.env, keys, tokens) before anything reaches an LLM.
7. Prefer simple code. No new abstraction without a current need.

## Working rules
- Inspect the repo and `git status` before changing anything. Never overwrite existing work.
- Work in small increments; explain architectural decisions before large changes.
- Write typed code (Python type hints, strict TypeScript) and add tests for important behaviour.
- Run tests after each change and report the results honestly.
- Ask before adding any major dependency or paid external service. Record the
  decision as an ADR in `docs/adr/`.
- NEVER commit, push, delete files or deploy without explicit approval.
- Never print, log or commit API keys or secrets. Use `.env` (git-ignored) and keep `.env.example` updated.
- Update `docs/architecture.md` when the architecture changes.

## Milestone 1 increments
0. Scaffolding: config, DB session, health endpoint, Alembic, pytest, docker-compose Postgres, ADRs
1. Safe ZIP ingestion + malicious-archive tests
2. File scanning, classification, language detection
3. Dependency manifests + rule-based framework detection
4. Project structure representation
5. Tree-sitter relationships for JS/TS (imports, Express routes, Mongoose models) — needs approval
6. Report assembly, persistence (`projects`, `analysis_runs` with JSONB report), endpoints
7. Evidence-grounded LLM summary (fake client in tests) — provider needs approval
8. Minimal frontend: upload + report view
9. Validate against SoundSoul (MERN music app). Verify every expected feature
   (React, Express, MongoDB, JWT auth, artist/listener roles, music upload) against
   the actual code; never assume it exists.

## Commands
(fill in as they are created)
- Setup: `cp .env.example .env`, then `cd backend && python -m venv .venv && .venv/Scripts/activate && pip install -e ".[dev]"`
- Backend tests: `cd backend && pytest`
- Start DB: `docker compose up -d db` — published on host port **5433** (not 5432) to avoid
  clashing with a native Windows PostgreSQL service; `POSTGRES_PORT` and `DATABASE_URL` in `.env` must agree
- Run API: `cd backend && uvicorn app.main:app --reload` (health: `GET /health`)
- Migrations: `cd backend && alembic upgrade head` / `alembic revision --autogenerate -m "msg"`
