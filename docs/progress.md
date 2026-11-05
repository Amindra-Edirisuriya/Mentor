# Progress log

Short notes per Milestone 1 increment. Newest at the bottom.

## Increment 0 — Scaffolding
FastAPI app with `/health`, pydantic-settings config, SQLAlchemy session, Alembic, docker-compose
Postgres (host port 5433), ADRs 0001–0002. 1 test.

## Increment 1 — Safe ZIP ingestion
- `app/ingestion/zip_safe.py`: `extract_zip_safely(archive, dest, limits)`.
- Validates every entry before writing: archive size, file count, total/per-file uncompressed size,
  per-file compression ratio, absolute paths, drive letters, backslashes, `..`, Windows-reserved
  names / `:` (ADS), symlinks and special files, encrypted entries, duplicates; resolved path must
  stay inside the destination. Nested archives are recorded and skipped. Bytes are counted while
  streaming, so lying headers can't exceed limits. Files written `0o644`. Destination removed on failure.
- 22 new tests in `tests/test_zip_safe.py` (traversal variants, symlink, zip bomb, limits, nested
  archive, duplicates, non-zip).
- Known gaps: no test for encrypted entries or lying size headers (stdlib `zipfile` can't easily
  write them); the execute-bit test is trivially true on Windows.
- Also added `.claude/settings.json` (allow tests/pip/docker compose/npm/git add+commit; deny git push, rm -rf).

## Increment 2 — File scanning, classification, language detection
- `app/analysis/evidence.py`: `Evidence` model + `make_evidence()` with deterministic ids (`ev-<sha1>`).
- `app/analysis/scanner.py`: `scan_project(root)` walks the tree (no symlinks followed), skips
  `node_modules`, `.git`, build output etc. (counted in `ignored_dirs`), detects language by
  extension/filename, classifies files as source/test/config/docs/asset/data/other, sniffs binary
  files, counts lines (≤2 MB), flags sensitive files (`.env*` except `.env.example`, keys, `.npmrc`).
  Output is sorted and deterministic; language stats count only source + test files.
- 24 new tests (`tests/test_scanner.py`); shared `make_tree` fixture in `tests/conftest.py`.
- Silenced Starlette's `httpx` deprecation warning in pytest config.

## Increment 3 — Dependency manifests + rule-based framework detection
- `app/analysis/manifests.py`: parses `package.json` (deps/devDeps/peerDeps, scripts, name),
  `requirements*.txt` and `pyproject.toml` as data only. Each dependency carries evidence with the
  line it is declared on. Malformed or oversized manifests produce `parse_error`, not a crash.
- `app/analysis/frameworks.py`: ~40 declarative rules (package names and/or config-file globs) for
  React, Express, MongoDB/Mongoose, JWT, bcrypt, Multer, Vite, Tailwind, Django, FastAPI, Jest, etc.
  Findings are labelled `status="declared"`: a dependency proves intent, not usage.
- 5 new tests including a MERN-shaped fixture (`tests/test_manifests_frameworks.py`).

## Increment 4 — Project structure representation
- `app/analysis/structure.py`: `build_structure(scan, manifests)` returns a depth-limited directory
  tree with recursive file counts, the ZIP's single wrapping folder (`root_prefix`), one
  `PackageUnit` per valid manifest (role frontend/backend/fullstack/unknown with dependency
  evidence), entry points (`main`, then `node|nodemon|ts-node … file` in start/dev scripts, then
  conventional names; only files that exist count), and layer hints from conventional directory
  names (routes, models, controllers, middleware, components, …).
- `Manifest` now records `main`/`script_lines` so entry-point evidence points at the exact line.
- 3 new tests (`tests/test_structure.py`).

## Increment 5 — Tree-sitter relationships for JS/TS
- New dependencies (approved): `tree-sitter`, `tree-sitter-javascript`, `tree-sitter-typescript`.
  Recorded in ADR 0003.
- `app/analysis/relationships.py`: imports (ESM, re-export, `require`, dynamic `import()`, relative
  resolution with extension/index fallback, npm package + Node builtin detection), Express routes
  (method, path, middleware args, mounts via `use`, `router.route('/x').get()`), Mongoose models
  (name, fields, `ref` targets). Routes require an Express-created receiver, so client `axios.get`
  calls aren't reported. Syntax errors are tolerated and listed.
- `frameworks.apply_usage()` upgrades findings from `declared` to `used` with import evidence.
- 7 new tests (`tests/test_relationships.py`).
- Known gap: full route paths across files (mount prefix + router path) aren't joined yet.

## Increment 6 — Report assembly, persistence, endpoints
- `app/analysis/report.py`: `analyse_project()` builds `AnalysisReport` (summary, scan, manifests,
  frameworks, structure, relationships, skipped nested archives); deterministic and JSON round-trips.
  `collect_evidence()` indexes all evidence ids (used for citation checks in increment 7).
- `app/models.py` + migration `0001`: `projects`, `analysis_runs` (`report` JSONB on Postgres).
- `app/api/projects.py`: `POST /projects`, `GET /projects`, `GET /projects/{id}`,
  `GET /projects/{id}/report`. Upload streamed with a size cap; unsafe archives return 400 and
  leave nothing behind; analysis errors are recorded as a failed run.
- New dependency: `python-multipart` (FastAPI's own upload parser; noted in ADR 0001).
- Settings: `STORAGE_DIR`, `MAX_UPLOAD_MB`. Alembic `env.py` now imports models and accepts a
  URL from the caller (used by the migration test).
- 11 new tests: report (3), API with SQLite overrides (7), migrations-match-models (1).
- Verified against the real Docker Postgres: `alembic upgrade head` applied `0001`; a smoke upload
  stored the report as `jsonb` and JSONB queries worked (test row deleted afterwards).
