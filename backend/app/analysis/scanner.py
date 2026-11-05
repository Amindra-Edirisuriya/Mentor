"""Walk an extracted project, classify files and detect languages.

Reads files as bytes only. Never follows symlinks, never executes anything.
"""

import os
from collections import Counter
from enum import StrEnum
from pathlib import Path, PurePosixPath

from pydantic import BaseModel, Field

IGNORED_DIRS = frozenset(
    {
        "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", ".next", ".nuxt",
        "coverage", ".cache", "__pycache__", ".venv", "venv", ".idea", ".vscode",
        ".pytest_cache", ".mypy_cache", "bower_components",
    }
)

LANGUAGE_BY_EXTENSION = {
    ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".jsx": "JavaScript",
    ".ts": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript", ".tsx": "TypeScript",
    ".py": "Python", ".java": "Java", ".kt": "Kotlin", ".go": "Go", ".rb": "Ruby", ".php": "PHP",
    ".cs": "C#", ".c": "C", ".h": "C", ".cpp": "C++", ".hpp": "C++", ".cc": "C++", ".rs": "Rust",
    ".swift": "Swift", ".dart": "Dart", ".scala": "Scala",
    ".html": "HTML", ".htm": "HTML", ".css": "CSS", ".scss": "SCSS", ".sass": "SCSS", ".less": "Less",
    ".vue": "Vue", ".svelte": "Svelte", ".sql": "SQL", ".sh": "Shell", ".bash": "Shell",
    ".ps1": "PowerShell", ".json": "JSON", ".yml": "YAML", ".yaml": "YAML", ".toml": "TOML",
    ".xml": "XML", ".md": "Markdown", ".rst": "reStructuredText",
}
LANGUAGE_BY_FILENAME = {"Dockerfile": "Dockerfile", "Makefile": "Makefile"}

# Languages that count as program source (vs. markup, config or data).
PROGRAMMING_LANGUAGES = frozenset(
    {
        "JavaScript", "TypeScript", "Python", "Java", "Kotlin", "Go", "Ruby", "PHP", "C#", "C",
        "C++", "Rust", "Swift", "Dart", "Scala", "Vue", "Svelte", "Shell", "PowerShell", "SQL",
        "HTML", "CSS", "SCSS", "Less",
    }
)

CONFIG_FILENAMES = frozenset(
    {
        "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "tsconfig.json",
        "jsconfig.json", "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg", "Pipfile",
        "Pipfile.lock", "poetry.lock", "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
        "Makefile", ".gitignore", ".babelrc", ".prettierrc", ".editorconfig", "Procfile",
        "nodemon.json", "vercel.json", "netlify.toml",
    }
)
CONFIG_SUFFIXES = (".config.js", ".config.ts", ".config.mjs", ".config.cjs", "rc.json", "rc.js")
ASSET_EXTENSIONS = frozenset(
    {
        ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp", ".mp3", ".wav", ".ogg",
        ".flac", ".m4a", ".mp4", ".webm", ".mov", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".pdf",
    }
)
DOC_EXTENSIONS = frozenset({".md", ".rst", ".txt", ".adoc"})
DATA_EXTENSIONS = frozenset({".json", ".csv", ".tsv", ".xml", ".yml", ".yaml"})
SENSITIVE_NAMES = frozenset({".npmrc", ".pypirc", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"})
SENSITIVE_EXTENSIONS = frozenset({".pem", ".key", ".p12", ".pfx"})

MAX_LINE_COUNT_BYTES = 2 * 1024 * 1024
_SNIFF_BYTES = 8192


class FileCategory(StrEnum):
    SOURCE = "source"
    TEST = "test"
    CONFIG = "config"
    DOCS = "docs"
    ASSET = "asset"
    DATA = "data"
    OTHER = "other"


class FileRecord(BaseModel):
    path: str  # posix, relative to project root
    size: int
    language: str | None
    category: FileCategory
    is_binary: bool
    line_count: int | None  # None for binary or very large files
    sensitive: bool = False  # likely holds secrets (.env, keys); never sent to an LLM


class LanguageStat(BaseModel):
    files: int = 0
    lines: int = 0


class ScanResult(BaseModel):
    files: list[FileRecord] = Field(default_factory=list)
    ignored_dirs: dict[str, int] = Field(default_factory=dict)  # dir name -> times skipped
    languages: dict[str, LanguageStat] = Field(default_factory=dict)
    categories: dict[str, int] = Field(default_factory=dict)

    def get(self, path: str) -> FileRecord | None:
        return next((f for f in self.files if f.path == path), None)


def detect_language(path: PurePosixPath) -> str | None:
    if path.name in LANGUAGE_BY_FILENAME:
        return LANGUAGE_BY_FILENAME[path.name]
    return LANGUAGE_BY_EXTENSION.get(path.suffix.lower())


def is_sensitive(path: PurePosixPath) -> bool:
    name = path.name.lower()
    if name == ".env" or name.startswith(".env.") and name != ".env.example":
        return True
    return name in SENSITIVE_NAMES or path.suffix.lower() in SENSITIVE_EXTENSIONS


def _is_test_path(path: PurePosixPath) -> bool:
    parts = {p.lower() for p in path.parts[:-1]}
    if parts & {"test", "tests", "__tests__", "spec", "specs", "e2e", "cypress"}:
        return True
    name = path.name.lower()
    return ".test." in name or ".spec." in name or name.startswith("test_") or name.endswith("_test.py")


def classify(path: PurePosixPath, language: str | None) -> FileCategory:
    name = path.name
    suffix = path.suffix.lower()
    if suffix in ASSET_EXTENSIONS:
        return FileCategory.ASSET
    if name in CONFIG_FILENAMES or name.lower().startswith(".env") or name.endswith(CONFIG_SUFFIXES):
        return FileCategory.CONFIG
    if name.startswith(".eslintrc") or name.startswith(".prettierrc"):
        return FileCategory.CONFIG
    if language in PROGRAMMING_LANGUAGES:
        return FileCategory.TEST if _is_test_path(path) else FileCategory.SOURCE
    if suffix in DOC_EXTENSIONS:
        return FileCategory.DOCS
    if suffix in DATA_EXTENSIONS or suffix == ".toml":
        return FileCategory.DATA
    return FileCategory.OTHER


def _read_text_info(file_path: Path, size: int) -> tuple[bool, int | None]:
    """Return (is_binary, line_count)."""
    with open(file_path, "rb") as fh:
        head = fh.read(_SNIFF_BYTES)
        if b"\x00" in head:
            return True, None
        if size > MAX_LINE_COUNT_BYTES:
            return False, None
        rest = fh.read()
    data = head + rest
    if not data:
        return False, 0
    return False, data.count(b"\n") + (0 if data.endswith(b"\n") else 1)


def scan_project(root: Path) -> ScanResult:
    """Scan ``root`` recursively. Paths in the result are relative posix paths, sorted."""
    root = root.resolve()
    result = ScanResult()
    ignored: Counter[str] = Counter()

    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        kept = []
        for d in sorted(dirnames):
            if d in IGNORED_DIRS or (Path(dirpath) / d).is_symlink():
                ignored[d] += 1
            else:
                kept.append(d)
        dirnames[:] = kept

        for name in filenames:
            full = Path(dirpath) / name
            if full.is_symlink() or not full.is_file():
                continue
            rel = PurePosixPath(full.relative_to(root).as_posix())
            size = full.stat().st_size
            language = detect_language(rel)
            category = classify(rel, language)
            if category is FileCategory.ASSET:
                is_binary, lines = True, None
            else:
                is_binary, lines = _read_text_info(full, size)
            result.files.append(
                FileRecord(
                    path=rel.as_posix(),
                    size=size,
                    language=None if is_binary else language,
                    category=category,
                    is_binary=is_binary,
                    line_count=lines,
                    sensitive=is_sensitive(rel),
                )
            )

    result.files.sort(key=lambda f: f.path)
    result.ignored_dirs = dict(sorted(ignored.items()))
    categories: Counter[str] = Counter()
    for f in result.files:
        categories[f.category.value] += 1
        if f.language and f.category in (FileCategory.SOURCE, FileCategory.TEST):
            stat = result.languages.setdefault(f.language, LanguageStat())
            stat.files += 1
            stat.lines += f.line_count or 0
    result.categories = dict(sorted(categories.items()))
    result.languages = dict(sorted(result.languages.items(), key=lambda kv: (-kv[1].lines, kv[0])))
    return result
