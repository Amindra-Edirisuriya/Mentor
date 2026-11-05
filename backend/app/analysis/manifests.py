"""Parse dependency manifests (package.json, requirements.txt, pyproject.toml).

Manifests are parsed as data only: nothing is installed or executed. A malformed manifest is
reported with ``parse_error`` instead of failing the whole analysis.
"""

import json
import re
import tomllib
from pathlib import Path, PurePosixPath

from pydantic import BaseModel, Field

from app.analysis.evidence import Evidence, make_evidence
from app.analysis.scanner import ScanResult

DETECTOR = "manifest"
MAX_MANIFEST_BYTES = 1024 * 1024
_REQ_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(.*)$")


class Dependency(BaseModel):
    name: str
    version_spec: str
    ecosystem: str  # "npm" | "pypi"
    dev: bool
    manifest_path: str
    evidence: Evidence


class Manifest(BaseModel):
    path: str
    ecosystem: str
    package_name: str | None = None
    main: str | None = None  # package.json "main"
    main_line: int = 0
    scripts: dict[str, str] = Field(default_factory=dict)
    script_lines: dict[str, int] = Field(default_factory=dict)
    dependencies: list[Dependency] = Field(default_factory=list)
    parse_error: str | None = None


def _find_line(lines: list[str], pattern: re.Pattern[str], start: int = 0) -> int:
    """1-based line of the first match at or after ``start`` (0-based); 0 if not found."""
    for i in range(start, len(lines)):
        if pattern.search(lines[i]):
            return i + 1
    return 0


def _dep(name: str, spec: str, ecosystem: str, dev: bool, path: str, line: int) -> Dependency:
    return Dependency(
        name=name,
        version_spec=spec,
        ecosystem=ecosystem,
        dev=dev,
        manifest_path=path,
        evidence=make_evidence(DETECTOR, path, line, detail=f"{ecosystem} dependency {name}"),
    )


def parse_package_json(path: str, text: str) -> Manifest:
    manifest = Manifest(path=path, ecosystem="npm")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        manifest.parse_error = f"Invalid JSON: {exc.msg} (line {exc.lineno})"
        return manifest
    if not isinstance(data, dict):
        manifest.parse_error = "package.json is not a JSON object"
        return manifest

    lines = text.splitlines()
    if isinstance(data.get("name"), str):
        manifest.package_name = data["name"]
    if isinstance(data.get("main"), str):
        manifest.main = data["main"]
        manifest.main_line = _find_line(lines, re.compile(r'^\s*"main"\s*:'))
    scripts = data.get("scripts")
    if isinstance(scripts, dict):
        manifest.scripts = {k: v for k, v in scripts.items() if isinstance(v, str)}
        header = _find_line(lines, re.compile(r'"scripts"\s*:'))
        manifest.script_lines = {
            k: _find_line(lines, re.compile(rf'^\s*"{re.escape(k)}"\s*:'), max(header - 1, 0))
            for k in manifest.scripts
        }

    for section, dev in (("dependencies", False), ("devDependencies", True), ("peerDependencies", False)):
        deps = data.get(section)
        if not isinstance(deps, dict):
            continue
        header = _find_line(lines, re.compile(rf'"{re.escape(section)}"\s*:'))
        for name, spec in deps.items():
            line = _find_line(lines, re.compile(rf'^\s*"{re.escape(name)}"\s*:'), max(header - 1, 0))
            manifest.dependencies.append(_dep(name, str(spec), "npm", dev, path, line))
    return manifest


def parse_requirements_txt(path: str, text: str) -> Manifest:
    manifest = Manifest(path=path, ecosystem="pypi")
    dev = "dev" in PurePosixPath(path).name.lower()
    for i, raw in enumerate(text.splitlines(), start=1):
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith(("-", "git+", "http:", "https:")):
            continue  # options, includes and URLs are not resolved (never fetched)
        match = _REQ_NAME.match(line.split(";", 1)[0])
        if match:
            manifest.dependencies.append(
                _dep(match.group(1).lower(), match.group(3).strip(), "pypi", dev, path, i)
            )
    return manifest


def parse_pyproject(path: str, text: str) -> Manifest:
    manifest = Manifest(path=path, ecosystem="pypi")
    try:
        data = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        manifest.parse_error = f"Invalid TOML: {exc}"
        return manifest
    project = data.get("project", {})
    if isinstance(project.get("name"), str):
        manifest.package_name = project["name"]
    lines = text.splitlines()

    def add(requirements: object, dev: bool) -> None:
        if not isinstance(requirements, list):
            return
        for req in requirements:
            if not isinstance(req, str):
                continue
            match = _REQ_NAME.match(req.split(";", 1)[0])
            if match:
                name = match.group(1)
                line = _find_line(lines, re.compile(rf'["\']{re.escape(name)}', re.IGNORECASE))
                manifest.dependencies.append(
                    _dep(name.lower(), match.group(3).strip(), "pypi", dev, path, line)
                )

    add(project.get("dependencies"), dev=False)
    optional = project.get("optional-dependencies", {})
    if isinstance(optional, dict):
        for group in optional.values():
            add(group, dev=True)
    return manifest


PARSERS = {
    "package.json": parse_package_json,
    "requirements.txt": parse_requirements_txt,
    "requirements-dev.txt": parse_requirements_txt,
    "pyproject.toml": parse_pyproject,
}


def parse_manifests(root: Path, scan: ScanResult) -> list[Manifest]:
    manifests = []
    for record in scan.files:
        parser = PARSERS.get(PurePosixPath(record.path).name)
        if parser is None:
            continue
        if record.size > MAX_MANIFEST_BYTES:
            manifests.append(
                Manifest(path=record.path, ecosystem="unknown", parse_error="Manifest too large")
            )
            continue
        text = (root / record.path).read_text(encoding="utf-8", errors="replace")
        manifests.append(parser(record.path, text))
    return manifests
