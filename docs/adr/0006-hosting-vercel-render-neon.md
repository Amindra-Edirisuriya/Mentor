# ADR 0006: Host on Vercel (frontend), Render (API) and Neon (Postgres)

- Status: Accepted (the project owner chose "Render + Neon" on 2026-11-10, after deploying the
  frontend to Vercel)
- Date: 2026-11-10

## Context

The frontend is deployed on Vercel at `https://mentor-two-pied.vercel.app`. Vercel only serves the
static build, so `/api/*` requests (sign-up, sign-in, uploads) fail there. The FastAPI backend
needs a long-running Python process, Postgres, and a writable disk for extracting uploads.
Vercel's serverless functions offer no Postgres and no persistent disk, so the backend goes
elsewhere. The owner requires free hosting.

## Decision

- **Frontend: Vercel** (Hobby, free). The project's root directory is `frontend/`.
  `frontend/vercel.json` rewrites `/api/:path*` to the Render API and everything else to
  `index.html`, so client-side routes survive a refresh.
- **API: Render** free web service, defined in `render.yaml` (root directory `backend/`). The
  start command runs `alembic upgrade head` and then `uvicorn`. The health check is `/health`.
- **Database: Neon** free Postgres. Its connection string is set as `DATABASE_URL` in the
  Render dashboard and never committed. `Settings` rewrites `postgres://` and `postgresql://`
  URLs to `postgresql+psycopg://`, so the host's URL can be pasted as-is.

Because Vercel proxies `/api`, the browser sees a single origin. The session cookie stays
first-party (`SameSite=Lax`, `Secure` since `APP_ENV=production`), and no CORS configuration
is needed. This matches the local Vite dev proxy.

## Consequences

- Free Render services sleep after about 15 minutes idle. The first request afterwards takes
  about 30–60 seconds while it wakes.
- Render's free disk is ephemeral. Extracted uploads in `STORAGE_DIR` can disappear on restart
  or redeploy. Reports and accounts are stored in Postgres and survive.
- `LLM_PROVIDER=fake` in production until a free hosted provider key (Groq, Gemini, OpenRouter;
  see ADR 0005) is added in the Render dashboard. Local Ollama is not reachable from Render.
- `EMAIL_BACKEND=console`: password-reset links appear in the Render logs, not in email.
- Rejected: Render's own free Postgres (deleted after 30 days) and Railway (trial credit, then
  paid).
