"""Select small, redacted source snippets around cited evidence."""

from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.analysis.evidence import Evidence
from app.security.redaction import redact

CONTEXT_LINES = 2
MAX_SNIPPET_LINES = 30
MAX_SNIPPETS = 30
MAX_TOTAL_CHARS = 20_000


class Snippet(BaseModel):
    evidence_id: str
    file_path: str
    line_start: int
    line_end: int
    code: str
    redacted: bool


def _safe_path(root: Path, rel: str) -> Path | None:
    candidate = (root / rel).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def build_snippets(
    report: dict[str, Any], source_root: Path, evidence: list[Evidence]
) -> list[Snippet]:
    """Snippets for ``evidence`` (in order), skipping sensitive/binary files and whole-file evidence."""
    files = {f["path"]: f for f in report["scan"]["files"]}
    snippets: list[Snippet] = []
    total = 0
    cache: dict[str, list[str]] = {}
    for ev in evidence:
        if len(snippets) >= MAX_SNIPPETS or ev.line_start <= 0:
            continue
        record = files.get(ev.file_path)
        if record is None or record["sensitive"] or record["is_binary"]:
            continue
        if ev.file_path not in cache:
            path = _safe_path(source_root, ev.file_path)
            if path is None:
                continue
            cache[ev.file_path] = path.read_text(encoding="utf-8", errors="replace").splitlines()
        lines = cache[ev.file_path]
        start = max(ev.line_start - CONTEXT_LINES, 1)
        end = min(ev.line_end + CONTEXT_LINES, len(lines), start + MAX_SNIPPET_LINES - 1)
        result = redact("\n".join(lines[start - 1 : end]))
        if total + len(result.text) > MAX_TOTAL_CHARS:
            break
        total += len(result.text)
        snippets.append(
            Snippet(evidence_id=ev.id, file_path=ev.file_path, line_start=start, line_end=end,
                    code=result.text, redacted=result.redacted)
        )
    return snippets
