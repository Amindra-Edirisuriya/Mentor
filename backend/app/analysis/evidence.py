"""Evidence: the concrete source location backing every finding (CLAUDE.md rule 2)."""

import hashlib

from pydantic import BaseModel


class Evidence(BaseModel):
    id: str
    file_path: str  # posix path relative to the project root
    line_start: int  # 1-based, inclusive; 0 when the finding is about the whole file
    line_end: int
    detector: str
    detail: str = ""


def make_evidence(
    detector: str, file_path: str, line_start: int = 0, line_end: int | None = None, detail: str = ""
) -> Evidence:
    """Build evidence with a deterministic id, so identical input yields identical reports."""
    end = line_start if line_end is None else line_end
    digest = hashlib.sha1(f"{detector}|{file_path}|{line_start}|{end}|{detail}".encode()).hexdigest()
    return Evidence(
        id=f"ev-{digest[:12]}",
        file_path=file_path,
        line_start=line_start,
        line_end=end,
        detector=detector,
        detail=detail,
    )
