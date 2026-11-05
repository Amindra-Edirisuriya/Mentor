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
