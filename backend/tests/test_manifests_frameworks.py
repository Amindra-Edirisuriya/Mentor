import json

from app.analysis.frameworks import detect_frameworks
from app.analysis.manifests import (
    parse_manifests,
    parse_package_json,
    parse_pyproject,
    parse_requirements_txt,
)
from app.analysis.scanner import scan_project

SERVER_PACKAGE = json.dumps(
    {
        "name": "server",
        "scripts": {"start": "node index.js", "dev": "nodemon index.js"},
        "dependencies": {
            "express": "^4.18.2",
            "mongoose": "^7.0.0",
            "jsonwebtoken": "^9.0.0",
            "bcryptjs": "^2.4.3",
            "multer": "^1.4.5",
        },
        "devDependencies": {"nodemon": "^3.0.0", "jest": "^29.0.0"},
    },
    indent=2,
)


def test_parse_package_json_with_line_evidence() -> None:
    m = parse_package_json("server/package.json", SERVER_PACKAGE)
    lines = SERVER_PACKAGE.splitlines()

    assert m.parse_error is None
    assert m.package_name == "server"
    assert m.scripts["start"] == "node index.js"
    deps = {d.name: d for d in m.dependencies}
    assert set(deps) == {"express", "mongoose", "jsonwebtoken", "bcryptjs", "multer", "nodemon", "jest"}
    assert deps["jest"].dev and not deps["express"].dev
    express = deps["express"].evidence
    assert express.file_path == "server/package.json"
    assert '"express"' in lines[express.line_start - 1]
    assert express.detector == "manifest"


def test_parse_package_json_malformed_does_not_raise() -> None:
    m = parse_package_json("package.json", "{ not json")
    assert m.parse_error is not None and m.dependencies == []

    assert parse_package_json("package.json", "[]").parse_error is not None


def test_parse_requirements_txt() -> None:
    text = "# comment\nFlask==3.0.0\nrequests[socks]>=2.0 ; python_version>'3'\n-r other.txt\n\nSQLAlchemy\n"
    m = parse_requirements_txt("requirements.txt", text)

    assert [(d.name, d.version_spec, d.evidence.line_start) for d in m.dependencies] == [
        ("flask", "==3.0.0", 2),
        ("requests", ">=2.0", 3),
        ("sqlalchemy", "", 6),
    ]


def test_parse_pyproject() -> None:
    text = '[project]\nname = "api"\ndependencies = [\n  "fastapi>=0.1",\n  "SQLAlchemy",\n]\n' \
           '[project.optional-dependencies]\ndev = ["pytest"]\n'
    m = parse_pyproject("pyproject.toml", text)

    deps = {d.name: d for d in m.dependencies}
    assert m.package_name == "api"
    assert deps["fastapi"].evidence.line_start == 4
    assert deps["sqlalchemy"].evidence.line_start == 5
    assert deps["pytest"].dev
    assert parse_pyproject("pyproject.toml", "[[[ broken").parse_error is not None


def test_detect_frameworks_mern_project(make_tree) -> None:
    root = make_tree(
        {
            "server/package.json": SERVER_PACKAGE,
            "server/index.js": "require('express')\n",
            "client/package.json": json.dumps(
                {"dependencies": {"react": "^18", "react-dom": "^18", "axios": "^1"},
                 "devDependencies": {"vite": "^5", "tailwindcss": "^3"}},
                indent=2,
            ),
            "client/vite.config.js": "export default {}\n",
            "client/tailwind.config.js": "module.exports = {}\n",
            "node_modules/vue/package.json": json.dumps({"name": "vue"}),
        }
    )
    scan = scan_project(root)
    manifests = parse_manifests(root, scan)

    findings = {f.name: f for f in detect_frameworks(manifests, scan)}

    assert {m.path for m in manifests} == {"server/package.json", "client/package.json"}
    for expected in ["React", "Express", "MongoDB", "Mongoose", "JWT", "bcrypt",
                     "Multer (file uploads)", "Vite", "Tailwind CSS", "Jest", "Axios"]:
        assert expected in findings, expected
    assert "Vue" not in findings  # node_modules is ignored
    assert "Django" not in findings
    assert all(f.status == "declared" for f in findings.values())

    vite_files = {e.file_path for e in findings["Vite"].evidence}
    assert vite_files == {"client/package.json", "client/vite.config.js"}
    express_ev = findings["Express"].evidence[0]
    assert express_ev.file_path == "server/package.json" and express_ev.line_start > 0


def test_imports_alone_detect_frameworks_without_a_manifest(make_tree) -> None:
    """A ZIP of just the source folder (no package.json) still shows what the code uses."""
    from app.analysis.concepts import derive_concepts
    from app.analysis.report import analyse_project

    root = make_tree({
        "src/app/layout.tsx": 'import Link from "next/link";\nimport { useState } from "react";\n',
        "src/api.ts": 'import axios from "axios";\nexport const get = () => axios.get("/x");\n',
    })
    report = analyse_project(root).model_dump(mode="json")
    found = {f["name"]: f for f in report["frameworks"]}

    assert {"React", "Next.js", "Axios"} <= set(found)
    assert all(f["status"] == "used" for f in found.values())
    react_ev = found["React"]["evidence"][0]
    assert react_ev["file_path"] == "src/app/layout.tsx" and react_ev["line_start"] == 2
    assert "Vue" not in found
    assert {"components", "http-client"} <= {c.key for c in derive_concepts(report)}


def test_frameworks_keep_rule_order_after_usage(make_tree) -> None:
    from app.analysis.frameworks import RULES, apply_usage
    from app.analysis.evidence import make_evidence

    imports = {"axios": [make_evidence("ts-imports", "a.js", 1, detail="import axios")],
               "react": [make_evidence("ts-imports", "b.js", 1, detail="import react")]}
    names = [f.name for f in apply_usage([], imports)]
    order = [r.name for r in RULES]
    assert names == sorted(names, key=order.index) == ["React", "Axios"]
