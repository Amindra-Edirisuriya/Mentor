from pathlib import Path

import pytest


def write_tree(root: Path, files: dict[str, str | bytes]) -> Path:
    """Create files under ``root`` from a {relative_path: content} mapping."""
    for rel, content in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8", newline="\n")
    return root


@pytest.fixture
def make_tree(tmp_path: Path):
    def _make(files: dict[str, str | bytes], name: str = "proj") -> Path:
        return write_tree(tmp_path / name, files)

    return _make
