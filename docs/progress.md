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
