<p align="center">
  <img src="frontend/public/logo.png" alt="VIFE logo" width="160" />
</p>

<h1 align="center">VIFE</h1>
<p align="center"><b>Vibe Intelligence for Engineering</b></p>
<p align="center">An AI-powered engineering project intelligence and adaptive learning platform.</p>

---

VIFE helps students and independent developers understand software projects they built
but don't fully understand. Upload a project as a ZIP and VIFE:

- safely extracts it (your code is **never executed, installed or built**),
- detects languages, dependency manifests and frameworks (React, Express, MongoDB, …),
- maps Express routes and Mongoose models to the exact files and lines,
- produces an evidence-grounded summary in which every claim cites the code it is based on.
  Secrets such as `.env` files are redacted before anything is sent to an LLM.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS (`frontend/`) |
| Backend | Python, FastAPI, SQLAlchemy, Alembic (`backend/`) |
| Database | PostgreSQL in Docker |
| Parsing | Tree-sitter |

## Running locally

Prerequisites: Python 3.12+, Node.js 18+, Docker.

```bash
# 1. Configuration (edit POSTGRES_PASSWORD / DATABASE_URL in .env)
cp .env.example .env

# 2. Database (published on host port 5433)
docker compose up -d db

# 3. Backend
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows; on macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload # http://localhost:8000/health

# 4. Frontend (in a second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api to the backend)
```

## Tests

```bash
cd backend && pytest
cd frontend && npm test && npm run build
```

## Upload limits

ZIP only, up to 50 MB (`MAX_UPLOAD_MB`), at most 5000 files and 200 MB uncompressed.
Tip: leave out `node_modules/`, `dist/` and `.git/` when zipping your project.

## Documentation

- [Architecture](docs/architecture.md)
- [Progress log](docs/progress.md)
- [Architecture decision records](docs/adr/)
