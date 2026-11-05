"""Project structure: directory tree summary, packages (one per manifest), entry points, layers."""

import re
from collections import Counter
from pathlib import PurePosixPath

from pydantic import BaseModel, Field

from app.analysis.evidence import Evidence, make_evidence
from app.analysis.manifests import Manifest
from app.analysis.scanner import FileCategory, ScanResult

DETECTOR = "structure"
TREE_MAX_DEPTH = 3

FRONTEND_PACKAGES = frozenset({"react", "vue", "@angular/core", "svelte", "next", "preact", "solid-js"})
BACKEND_PACKAGES = frozenset(
    {"express", "koa", "fastify", "@nestjs/core", "hapi", "@hapi/hapi", "django", "flask", "fastapi"}
)
_SCRIPT_ENTRY = re.compile(r"\b(?:node|nodemon|ts-node|tsx|bun)\s+(?:--\S+\s+)*([\w./-]+\.(?:js|cjs|mjs|ts))")
CONVENTIONAL_ENTRY_FILES = (
    "index.js", "server.js", "app.js", "main.js", "index.ts", "server.ts", "app.ts", "main.ts",
    "src/index.js", "src/server.js", "src/app.js", "src/index.ts", "src/server.ts", "src/main.ts",
    "src/main.jsx", "src/main.tsx", "src/index.jsx", "src/index.tsx",
    "main.py", "app.py", "manage.py", "wsgi.py", "asgi.py", "app/main.py",
)
LAYER_DIRS = {
    "routes": "routes", "router": "routes", "routers": "routes", "api": "routes",
    "controllers": "controllers", "models": "models", "schemas": "models",
    "middleware": "middleware", "middlewares": "middleware",
    "services": "services", "components": "components", "pages": "pages", "views": "pages",
    "hooks": "hooks", "context": "state", "store": "state", "redux": "state",
    "utils": "utilities", "helpers": "utilities", "config": "config",
}


class DirectoryNode(BaseModel):
    path: str  # "" for the project root
    file_count: int  # recursive
    children: list["DirectoryNode"] = Field(default_factory=list)


class EntryPoint(BaseModel):
    path: str
    reason: str
    evidence: Evidence


class PackageUnit(BaseModel):
    directory: str  # "" for the project root
    manifest_path: str
    ecosystem: str
    name: str | None
    role: str  # frontend | backend | fullstack | unknown
    role_evidence: list[Evidence] = Field(default_factory=list)
    entry_points: list[EntryPoint] = Field(default_factory=list)


class LayerHint(BaseModel):
    kind: str
    directory: str
    file_count: int
    evidence: Evidence  # points at the first source file in the directory


class ProjectStructure(BaseModel):
    root_prefix: str  # single wrapping folder from the ZIP (e.g. "my-app"), or ""
    tree: DirectoryNode
    packages: list[PackageUnit] = Field(default_factory=list)
    layers: list[LayerHint] = Field(default_factory=list)


def _root_prefix(paths: list[str]) -> str:
    tops = {PurePosixPath(p).parts[0] for p in paths if len(PurePosixPath(p).parts) > 1}
    has_top_files = any(len(PurePosixPath(p).parts) == 1 for p in paths)
    return tops.pop() if len(tops) == 1 and not has_top_files else ""


def _build_tree(paths: list[str]) -> DirectoryNode:
    counts: Counter[str] = Counter()
    for p in paths:
        parts = PurePosixPath(p).parts[:-1]
        counts[""] += 1
        for depth in range(1, min(len(parts), TREE_MAX_DEPTH) + 1):
            counts["/".join(parts[:depth])] += 1

    nodes = {d: DirectoryNode(path=d, file_count=c) for d, c in counts.items()}
    for d in sorted(nodes):
        if d:
            parent = str(PurePosixPath(d).parent)
            nodes["" if parent == "." else parent].children.append(nodes[d])
    return nodes[""]


def _package_dir(manifest_path: str) -> str:
    parent = str(PurePosixPath(manifest_path).parent)
    return "" if parent == "." else parent


def _join(directory: str, rel: str) -> str:
    rel = rel.removeprefix("./")
    return str(PurePosixPath(directory) / rel) if directory else rel


def _entry_points(manifest: Manifest, directory: str, existing: set[str]) -> list[EntryPoint]:
    found: dict[str, EntryPoint] = {}
    if manifest.main:
        target = _join(directory, manifest.main)
        if target in existing:
            found[target] = EntryPoint(
                path=target,
                reason='package.json "main"',
                evidence=make_evidence(DETECTOR, manifest.path, manifest.main_line, detail=f"main: {target}"),
            )
    for script in ("start", "dev", "server", "serve"):
        command = manifest.scripts.get(script)
        match = _SCRIPT_ENTRY.search(command or "")
        if match:
            target = _join(directory, match.group(1))
            if target in existing and target not in found:
                found[target] = EntryPoint(
                    path=target,
                    reason=f'npm script "{script}"',
                    evidence=make_evidence(
                        DETECTOR, manifest.path, manifest.script_lines.get(script, 0),
                        detail=f"script {script}: {command}",
                    ),
                )
    if not found:
        for name in CONVENTIONAL_ENTRY_FILES:
            target = _join(directory, name)
            if target in existing:
                found[target] = EntryPoint(
                    path=target,
                    reason="conventional entry file name",
                    evidence=make_evidence(DETECTOR, target, 0, detail="conventional entry file"),
                )
                break
    return list(found.values())


def _role(manifest: Manifest) -> tuple[str, list[Evidence]]:
    front = [d.evidence for d in manifest.dependencies if d.name in FRONTEND_PACKAGES]
    back = [d.evidence for d in manifest.dependencies if d.name in BACKEND_PACKAGES]
    if front and back:
        return "fullstack", front + back
    if front:
        return "frontend", front
    if back:
        return "backend", back
    return "unknown", []


def build_structure(scan: ScanResult, manifests: list[Manifest]) -> ProjectStructure:
    paths = [f.path for f in scan.files]
    existing = set(paths)

    packages = []
    for manifest in sorted(manifests, key=lambda m: m.path):
        if manifest.parse_error:
            continue
        directory = _package_dir(manifest.path)
        role, role_evidence = _role(manifest)
        packages.append(
            PackageUnit(
                directory=directory,
                manifest_path=manifest.path,
                ecosystem=manifest.ecosystem,
                name=manifest.package_name,
                role=role,
                role_evidence=role_evidence,
                entry_points=_entry_points(manifest, directory, existing),
            )
        )

    source_files: dict[str, list[str]] = {}
    for f in scan.files:
        if f.category is FileCategory.SOURCE:
            parent = str(PurePosixPath(f.path).parent)
            source_files.setdefault(parent, []).append(f.path)
    layers = []
    for directory in sorted(source_files):
        kind = LAYER_DIRS.get(PurePosixPath(directory).name.lower())
        if kind:
            files = sorted(source_files[directory])
            layers.append(
                LayerHint(
                    kind=kind,
                    directory=directory,
                    file_count=len(files),
                    evidence=make_evidence(DETECTOR, files[0], 0, detail=f"{kind} directory {directory}"),
                )
            )

    return ProjectStructure(
        root_prefix=_root_prefix(paths), tree=_build_tree(paths), packages=packages, layers=layers
    )
