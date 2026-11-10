# VIFE architecture

Status: Milestone 1, increment 0 (scaffolding). This document describes what exists
now and the boundaries the rest of Milestone 1 will follow. Update it when the
architecture changes.

## Overview

VIFE (Vibe Intelligence for Engineering) analyses a software project (ZIP upload in Milestone 1), maps the
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

All `/projects` endpoints require a signed-in session and only see the caller's own projects;
another user's project id returns 404. See [ADR 0004](adr/0004-accounts-and-cookie-sessions.md).

| Method & path | Purpose |
|---|---|
| `POST /auth/register` | Create an account (name, email, password) and sign in. 409 if the email is taken. |
| `POST /auth/login` / `POST /auth/logout` | Start / end a session (`vife_session` httpOnly cookie). |
| `GET /auth/me` / `PATCH /auth/me` | Current user / update name. |
| `POST /auth/change-password` | Needs the current password; ends the user's other sessions. |
| `POST /auth/forgot-password` | Always 202; if the account exists, a 30-minute single-use link is "sent" (console backend). |
| `POST /auth/reset-password` | Token + new password; ends all sessions. |
| `DELETE /auth/me` | Needs the password; deletes the account, its projects and their files. |
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

## Learning layer

Deterministic concept detection lives in `app/analysis/concepts.py`. It derives concepts (REST
API, middleware, data modelling, JWT auth, password hashing, file uploads, role-based access,
components, …) from the stored report, each citing existing evidence. Because it reads the
stored report JSON, older reports get concepts too. `app/learning/` builds on it:

| Module | Purpose |
|---|---|
| `catalog.py` | Static concept info: level (pathway order), description, free official resources. |
| `generation.py` | LLM tasks (explain, questions, grade, presentation) with schemas and validation of every output. |
| `fake.py` | Deterministic offline answers for each task (`LLM_PROVIDER=fake`, tests). |

Tables: `learning_outputs` (explanations, question sets with hidden key points, decks),
`concept_progress` (0–100 moving average per concept, mastered at 75), `practice_attempts`.

| Method & path (`/projects/{id}/learning/…`) | Purpose |
|---|---|
| `GET pathway` | Concepts by level, with status, score, evidence and resources; `next_concept`. |
| `POST/GET concepts/{key}/explanation` | Cited, step-by-step walkthrough of the concept in this code, plus key terms. |
| `POST practice` (`mode` quiz/viva, `concept_key?`, `count`) | Grounded questions; with no concept, targets the weakest. |
| `POST practice/{set}/answer` (`index`, `answer`) | Grade (redacted answer), feedback, missing points; updates progress. |
| `GET progress` | Overall, per-concept mastery, daily history, recent answers. |
| `POST/GET presentation` (`minutes`) | Evidence-cited slides with speaker notes. |

Providers: `app/intelligence/llm.py` has `FakeLLMClient` and `OpenAICompatibleClient` (Ollama,
Groq, Gemini, OpenRouter; see [ADR 0005](adr/0005-free-llm-providers.md)). Provider errors
return 502 with an actionable message.

## Frontend (increment 8)

`frontend/`: Vite + React 18 + TypeScript (strict, `noUncheckedIndexedAccess`) + Tailwind 3.
The dev server proxies `/api/*` to the backend, so the backend needs no CORS configuration.

Routes (`react-router-dom`): `/` landing, `/login`, `/register`, `/forgot-password`,
`/reset-password?token=…`, `/app` (dashboard) and `/account` (both need sign-in), plus a 404 page.

| Path | Purpose |
|---|---|
| `src/api.ts` | Typed fetch wrappers for the endpoints above. A 401 on a non-auth call signs the UI out. |
| `src/auth/AuthContext.tsx` | Current user (`undefined` while checking, `null` when signed out), login/register/logout. |
| `src/auth/guards.tsx` | `RequireAuth` (redirects to `/login` and back) and `PublicOnly`. |
| `src/auth/AuthLayout.tsx` | Split-screen layout for the sign-in, sign-up and password pages. |
| `src/pages/*` | Landing, Login, Register, Forgot/Reset password, Dashboard, Account. |
| `src/components/learning/*` | Dashboard tabs: Learn (pathway + explanations + resources), Practice & viva (timer, voice answers), Progress (mastery + daily chart), Presentation (slides, notes, rehearsal timer, Markdown/PDF export). |
| `src/lib/learning.ts` | Score tones, clock formatting, deck → Markdown (unit-tested). |
| `src/components/forms.tsx` | Text and password fields (show/hide, strength meter), submit button, notices. |
| `src/lib/password.ts`, `src/lib/redirect.ts` | Password policy mirrored from the backend, and same-site redirect check (unit-tested). |
| `src/types.ts` | TypeScript mirror of the report/summary JSON. |
| `src/lib/report.ts` | Pure helpers: location formatting, evidence index, route grouping, language shares (unit-tested). |
| `src/components/UploadForm.tsx` | ZIP upload. |
| `src/components/ReportView.tsx` | Stats, technologies (used/declared + evidence), packages/entry points, languages, routes, models, notes (sensitive files, skipped archives, syntax errors). |
| `src/components/SummaryPanel.tsx` | Generate/show validated claims with evidence chips; rejected claims listed. |
| `src/components/ui.tsx` | Shared UI: badges, cards, empty states, spinner, skeletons, alert. |
| `src/lib/errors.ts` | Friendly error messages (API status / network failures) and client-side ZIP check (unit-tested). |
| `public/logo.png` | VIFE logo, shown in the header and used as the favicon. |

Branding: the Tailwind `brand` palette in `tailwind.config.js` is taken from the logo
(navy background, violet → blue → cyan). The client-side ZIP check is only for friendlier
messages; the backend remains the authority on what is accepted.

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
| `LLM_PROVIDER` | backend | `fake` (or `openai_compatible`) |
| `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` | backend | `http://localhost:11434/v1` / `qwen2.5-coder:7b` / empty |
| `LLM_TIMEOUT_SECONDS` | backend | `180` |
| `SESSION_DAYS` | backend | `14` |
| `PASSWORD_RESET_MINUTES` | backend | `30` |
| `APP_URL` | backend (reset links) | `http://localhost:5173` |
| `EMAIL_BACKEND` | backend | `console` (logs reset links; real email needs approval) |

The Docker database is published on host port **5433** so it doesn't collide with
a native PostgreSQL service on 5432 (inside the container it still listens on 5432).

## Security boundaries (planned, from CLAUDE.md)

- Uploaded projects are untrusted: never executed, imported, installed or built.
- ZIP ingestion enforces size, file-count and compression-ratio limits and rejects
  absolute paths, `..`, symlinks, nested archives and escapes from the destination.
- Uploaded data lives under `storage/` (git-ignored).
- Secrets are detected and redacted before anything reaches an LLM.
