from pathlib import PurePosixPath

import pytest

from app.analysis.evidence import make_evidence
from app.analysis.scanner import FileCategory, classify, detect_language, is_sensitive, scan_project


def test_scan_classifies_and_counts(make_tree) -> None:
    root = make_tree(
        {
            "package.json": '{"name": "x"}\n',
            "src/index.js": "const a = 1;\nconst b = 2;\n",
            "src/App.tsx": "export default function App() {}\n",
            "src/__tests__/app.test.js": "test('x', () => {});\n",
            "public/logo.png": b"\x89PNG\r\n\x1a\n\x00\x00",
            "README.md": "# Title\n\nText",
            ".env": "SECRET=abc\n",
            "data/blob.bin": b"\x00\x01\x02",
            "node_modules/react/index.js": "module.exports = {};\n",
            "frontend/node_modules/x/y.js": "1\n",
            ".git/config": "[core]\n",
        }
    )

    result = scan_project(root)
    paths = [f.path for f in result.files]

    assert paths == sorted(paths)
    assert not any("node_modules" in p or p.startswith(".git/") for p in paths)
    assert result.ignored_dirs == {".git": 1, "node_modules": 2}

    index = result.get("src/index.js")
    assert index is not None
    assert (index.language, index.category, index.line_count) == ("JavaScript", FileCategory.SOURCE, 2)
    assert result.get("src/App.tsx").language == "TypeScript"
    assert result.get("src/__tests__/app.test.js").category is FileCategory.TEST
    assert result.get("package.json").category is FileCategory.CONFIG
    assert result.get("README.md").category is FileCategory.DOCS
    assert result.get("README.md").line_count == 3
    assert result.get("public/logo.png").category is FileCategory.ASSET
    assert result.get("data/blob.bin").is_binary
    assert result.get(".env").sensitive

    assert result.languages["JavaScript"].files == 2
    assert result.languages["JavaScript"].lines == 3
    assert result.languages["TypeScript"].files == 1
    assert "Markdown" not in result.languages  # only source/test files count


def test_scan_is_deterministic(make_tree) -> None:
    root = make_tree({"b.py": "x=1\n", "a/c.js": "y\n", "a/b.ts": "z\n"})

    assert scan_project(root) == scan_project(root)


@pytest.mark.parametrize(
    ("path", "language"),
    [
        ("a/b.jsx", "JavaScript"),
        ("a/b.mjs", "JavaScript"),
        ("x.TS", "TypeScript"),
        ("app.py", "Python"),
        ("Dockerfile", "Dockerfile"),
        ("styles.scss", "SCSS"),
        ("noext", None),
    ],
)
def test_detect_language(path: str, language: str | None) -> None:
    assert detect_language(PurePosixPath(path)) == language


@pytest.mark.parametrize(
    ("path", "category"),
    [
        ("vite.config.ts", FileCategory.CONFIG),
        (".eslintrc.json", FileCategory.CONFIG),
        ("tests/test_api.py", FileCategory.TEST),
        ("src/user.spec.ts", FileCategory.TEST),
        ("server/routes/auth.js", FileCategory.SOURCE),
        ("docs/guide.txt", FileCategory.DOCS),
        ("seed/users.json", FileCategory.DATA),
        ("song.mp3", FileCategory.ASSET),
        ("LICENSE", FileCategory.OTHER),
    ],
)
def test_classify(path: str, category: FileCategory) -> None:
    p = PurePosixPath(path)
    assert classify(p, detect_language(p)) is category


@pytest.mark.parametrize(
    ("path", "expected"),
    [(".env", True), ("server/.env.production", True), (".env.example", False), ("certs/server.key", True),
     ("src/env.js", False)],
)
def test_is_sensitive(path: str, expected: bool) -> None:
    assert is_sensitive(PurePosixPath(path)) is expected


def test_evidence_ids_are_deterministic_and_distinct() -> None:
    a = make_evidence("detector", "src/a.js", 3, 5)
    assert a == make_evidence("detector", "src/a.js", 3, 5)
    assert a.id != make_evidence("detector", "src/a.js", 4, 5).id
    assert a.id.startswith("ev-")
