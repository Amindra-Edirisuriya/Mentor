"""Regressions found while validating VIFE against the real SoundSoul project (increment 9)."""

import json

from app.analysis.report import analyse_project

VITE_TAILWIND_V4 = {
    "client/package.json": json.dumps(
        {
            "dependencies": {"react": "^19.0.0"},
            "devDependencies": {"vite": "^8.0.0", "@tailwindcss/vite": "^4.1.0", "tailwindcss": "^4.1.0"},
        }
    ),
    "client/vite.config.js": (
        "import { defineConfig } from 'vite'\n"
        "import tailwindcss from '@tailwindcss/vite'\n"
        "export default defineConfig({ plugins: [tailwindcss()] })\n"
    ),
    "client/src/index.css": '@import "tailwindcss";\n',
    "client/src/main.jsx": "import React from 'react'\n",
}


def test_imports_in_config_files_count_as_usage(make_tree) -> None:
    report = analyse_project(make_tree(VITE_TAILWIND_V4))

    status = {f.name: f.status for f in report.frameworks}
    assert status["Vite"] == "used"
    assert status["Tailwind CSS"] == "used"  # v4: wired in via @tailwindcss/vite
    tailwind = next(f for f in report.frameworks if f.name == "Tailwind CSS")
    assert any(e.file_path == "client/vite.config.js" and e.line_start == 2 for e in tailwind.evidence)


def test_bare_ampersand_in_jsx_is_tolerated(make_tree) -> None:
    # Valid JSX, but tree-sitter-javascript reports an error node for the bare "&".
    root = make_tree(
        {
            "src/View.jsx": (
                "import { api } from './api'\n"
                "export const View = () => <div>Select a playlist to view & manage tracks</div>\n"
            ),
            "src/api.js": "export const api = 1\n",
        }
    )

    rel = analyse_project(root).relationships

    assert rel.files_with_syntax_errors == ["src/View.jsx"]
    assert [(i.specifier, i.target_file) for i in rel.imports] == [("./api", "src/api.js")]
