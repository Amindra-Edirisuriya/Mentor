"""Tree-sitter extraction of JS/TS relationships: imports, Express routes, Mongoose models.

Source is parsed as text into a syntax tree; it is never executed, imported or bundled.
Precision over recall: a route is only reported when its receiver is a variable created from
``express()`` / ``express.Router()`` / ``Router()`` in the same file, so client calls such as
``axios.get('/api/x')`` are not mistaken for server routes.
"""

import posixpath
from collections.abc import Iterator
from pathlib import Path, PurePosixPath

import tree_sitter_javascript
import tree_sitter_typescript
from pydantic import BaseModel, Field
from tree_sitter import Language, Node, Parser

from app.analysis.evidence import Evidence, make_evidence
from app.analysis.scanner import FileCategory, ScanResult

MAX_PARSE_BYTES = 1024 * 1024
DETECTOR_IMPORT = "ts-imports"
DETECTOR_ROUTE = "ts-express-routes"
DETECTOR_MODEL = "ts-mongoose-models"

_JS = Language(tree_sitter_javascript.language())
_TS = Language(tree_sitter_typescript.language_typescript())
_TSX = Language(tree_sitter_typescript.language_tsx())
_LANG_BY_SUFFIX = {
    ".js": _JS, ".jsx": _JS, ".mjs": _JS, ".cjs": _JS,
    ".ts": _TS, ".mts": _TS, ".cts": _TS, ".tsx": _TSX,
}
_RESOLVE_SUFFIXES = (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs")
HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "options", "head", "all"})
NODE_BUILTINS = frozenset(
    {"fs", "path", "http", "https", "os", "url", "crypto", "util", "events", "stream", "child_process",
     "zlib", "buffer", "querystring", "net", "tls", "dns", "assert", "process", "cluster", "readline"}
)


class ImportEdge(BaseModel):
    source_file: str
    specifier: str
    kind: str  # esm | require | dynamic | reexport
    target_file: str | None = None  # resolved project file for relative imports
    package: str | None = None  # bare specifier package name (npm)
    builtin: bool = False
    evidence: Evidence


class RouteFinding(BaseModel):
    file: str
    method: str  # GET, POST, ... or USE for mounts/middleware
    path: str | None
    receiver: str
    middleware: list[str] = Field(default_factory=list)  # args between path and final handler
    evidence: Evidence


class ModelFinding(BaseModel):
    name: str
    file: str
    fields: list[str] = Field(default_factory=list)
    refs: list[str] = Field(default_factory=list)  # other models referenced via `ref: 'X'`
    evidence: Evidence


class CodeRelationships(BaseModel):
    files_parsed: int = 0
    imports: list[ImportEdge] = Field(default_factory=list)
    routes: list[RouteFinding] = Field(default_factory=list)
    models: list[ModelFinding] = Field(default_factory=list)
    files_with_syntax_errors: list[str] = Field(default_factory=list)

    def imported_packages(self) -> dict[str, list[Evidence]]:
        result: dict[str, list[Evidence]] = {}
        for edge in self.imports:
            if edge.package and not edge.builtin:
                result.setdefault(edge.package, []).append(edge.evidence)
        return result


# --- helpers -------------------------------------------------------------------------------

def _text(node: Node | None) -> str:
    return node.text.decode("utf-8", errors="replace") if node is not None and node.text else ""


def _string_value(node: Node | None) -> str | None:
    """Literal value of a string or substitution-free template string, else None."""
    if node is None:
        return None
    if node.type == "string":
        return _text(node)[1:-1]
    if node.type == "template_string" and not any(
        c.type == "template_substitution" for c in node.named_children
    ):
        return _text(node)[1:-1]
    return None


def _walk(node: Node) -> Iterator[Node]:
    stack = [node]
    while stack:
        current = stack.pop()
        yield current
        stack.extend(reversed(current.children))


def _lines(node: Node) -> tuple[int, int]:
    return node.start_point.row + 1, node.end_point.row + 1


def _args(call: Node) -> list[Node]:
    arguments = call.child_by_field_name("arguments")
    return list(arguments.named_children) if arguments is not None else []


def _package_name(specifier: str) -> tuple[str, bool]:
    if specifier.startswith("node:"):
        return specifier[5:].split("/")[0], True
    parts = specifier.split("/")
    name = "/".join(parts[:2]) if specifier.startswith("@") else parts[0]
    return name, name in NODE_BUILTINS


def _resolve(source_file: str, specifier: str, existing: set[str]) -> str | None:
    base = posixpath.dirname(source_file)
    joined = posixpath.normpath(posixpath.join(base, specifier))
    if joined.startswith(".."):
        return None
    candidates = [joined] + [joined + s for s in _RESOLVE_SUFFIXES]
    candidates += [f"{joined}/index{s}" for s in _RESOLVE_SUFFIXES]
    return next((c for c in candidates if c in existing), None)


def _callee_name(call: Node) -> str:
    """'require', 'express', 'express.Router', 'mongoose.model', ... for simple callees."""
    function = call.child_by_field_name("function")
    if function is None:
        return ""
    if function.type in ("identifier", "import"):
        return _text(function)
    if function.type == "member_expression":
        obj, prop = function.child_by_field_name("object"), function.child_by_field_name("property")
        if obj is not None and obj.type == "identifier" and prop is not None:
            return f"{_text(obj)}.{_text(prop)}"
    return ""


# --- extractors ----------------------------------------------------------------------------

def _extract_imports(path: str, root: Node, existing: set[str]) -> list[ImportEdge]:
    edges = []
    for node in _walk(root):
        specifier, kind = None, ""
        if node.type in ("import_statement", "export_statement"):
            specifier = _string_value(node.child_by_field_name("source"))
            kind = "esm" if node.type == "import_statement" else "reexport"
        elif node.type == "call_expression":
            name = _callee_name(node)
            if name in ("require", "import"):
                args = _args(node)
                specifier = _string_value(args[0]) if args else None
                kind = "require" if name == "require" else "dynamic"
        if not specifier:
            continue
        start, end = _lines(node)
        edge = ImportEdge(
            source_file=path,
            specifier=specifier,
            kind=kind,
            evidence=make_evidence(DETECTOR_IMPORT, path, start, end, detail=f"import {specifier}"),
        )
        if specifier.startswith("."):
            edge.target_file = _resolve(path, specifier, existing)
        elif not specifier.startswith(("/", "http:", "https:")):
            edge.package, edge.builtin = _package_name(specifier)
        edges.append(edge)
    return edges


def _router_variables(root: Node) -> set[str]:
    names = set()
    for node in _walk(root):
        if node.type != "variable_declarator":
            continue
        value = node.child_by_field_name("value")
        name = node.child_by_field_name("name")
        if value is None or name is None or name.type != "identifier":
            continue
        if value.type == "call_expression" and _callee_name(value) in (
            "express", "express.Router", "Router", "express.default"
        ):
            names.add(_text(name))
    return names


def _extract_routes(path: str, root: Node) -> list[RouteFinding]:
    receivers = _router_variables(root)
    if not receivers:
        return []
    routes = []
    for node in _walk(root):
        if node.type != "call_expression":
            continue
        function = node.child_by_field_name("function")
        if function is None or function.type != "member_expression":
            continue
        method = _text(function.child_by_field_name("property")).lower()
        obj = function.child_by_field_name("object")
        if obj is None or (method not in HTTP_METHODS and method != "use"):
            continue

        route_path: str | None = None
        args = _args(node)
        if obj.type == "identifier" and _text(obj) in receivers:
            receiver = _text(obj)
            if args and (value := _string_value(args[0])) is not None:
                route_path, args = value, args[1:]
            elif method != "use":
                continue  # e.g. app.get('env') settings lookups need a literal path
        elif obj.type == "call_expression":  # router.route('/x').get(handler)
            inner = obj.child_by_field_name("function")
            inner_obj = inner.child_by_field_name("object") if inner is not None else None
            if (
                inner is None or inner.type != "member_expression"
                or _text(inner.child_by_field_name("property")) != "route"
                or inner_obj is None or _text(inner_obj) not in receivers
            ):
                continue
            receiver = _text(inner_obj)
            inner_args = _args(obj)
            route_path = _string_value(inner_args[0]) if inner_args else None
        else:
            continue

        middleware = [_text(a)[:80] for a in (args[:-1] if method != "use" else args)]
        start, end = _lines(node)
        routes.append(
            RouteFinding(
                file=path,
                method=method.upper(),
                path=route_path,
                receiver=receiver,
                middleware=middleware,
                evidence=make_evidence(
                    DETECTOR_ROUTE, path, start, end, detail=f"{method.upper()} {route_path or ''}".strip()
                ),
            )
        )
    return routes


def _is_schema_constructor(node: Node) -> bool:
    if node.type != "new_expression":
        return False
    return _text(node.child_by_field_name("constructor")) in ("Schema", "mongoose.Schema")


def _schema_fields(new_expr: Node) -> tuple[list[str], list[str]]:
    args = _args(new_expr)
    if not args or args[0].type != "object":
        return [], []
    fields, refs = [], []
    for pair in args[0].named_children:
        if pair.type != "pair":
            continue
        key = pair.child_by_field_name("key")
        key_text = _string_value(key) if key is not None and key.type == "string" else _text(key)
        fields.append(key_text)
        value = pair.child_by_field_name("value")
        for inner in _walk(value) if value is not None else []:
            if inner.type == "pair" and _text(inner.child_by_field_name("key")) in ("ref", "'ref'", '"ref"'):
                ref = _string_value(inner.child_by_field_name("value"))
                if ref and ref not in refs:
                    refs.append(ref)
    return fields, refs


def _extract_models(path: str, root: Node, imports: list[ImportEdge]) -> list[ModelFinding]:
    if not any(e.package == "mongoose" for e in imports):
        return []
    schemas: dict[str, Node] = {}
    for node in _walk(root):
        if node.type == "variable_declarator":
            name, value = node.child_by_field_name("name"), node.child_by_field_name("value")
            if name is not None and value is not None and _is_schema_constructor(value):
                schemas[_text(name)] = value

    models = []
    for node in _walk(root):
        if node.type != "call_expression" or _callee_name(node) not in ("mongoose.model", "model"):
            continue
        args = _args(node)
        model_name = _string_value(args[0]) if args else None
        if not model_name:
            continue
        schema_node = None
        if len(args) > 1:
            schema_node = args[1] if _is_schema_constructor(args[1]) else schemas.get(_text(args[1]))
        fields, refs = _schema_fields(schema_node) if schema_node is not None else ([], [])
        start, end = _lines(node)
        models.append(
            ModelFinding(
                name=model_name,
                file=path,
                fields=fields,
                refs=refs,
                evidence=make_evidence(DETECTOR_MODEL, path, start, end, detail=f"mongoose model {model_name}"),
            )
        )
    return models


def extract_file(path: str, source: bytes, existing: set[str]) -> tuple[CodeRelationships, bool]:
    """Extract relationships from one file. Returns (relationships, had_syntax_errors)."""
    language = _LANG_BY_SUFFIX[PurePosixPath(path).suffix.lower()]
    tree = Parser(language).parse(source)
    root = tree.root_node
    imports = _extract_imports(path, root, existing)
    rel = CodeRelationships(
        files_parsed=1,
        imports=imports,
        routes=_extract_routes(path, root),
        models=_extract_models(path, root, imports),
    )
    return rel, root.has_error


def extract_relationships(root: Path, scan: ScanResult) -> CodeRelationships:
    existing = {f.path for f in scan.files}
    result = CodeRelationships()
    for record in scan.files:
        suffix = PurePosixPath(record.path).suffix.lower()
        if (
            suffix not in _LANG_BY_SUFFIX
            or record.category not in (FileCategory.SOURCE, FileCategory.TEST)
            or record.is_binary
            or record.size > MAX_PARSE_BYTES
        ):
            continue
        rel, had_errors = extract_file(record.path, (root / record.path).read_bytes(), existing)
        result.files_parsed += 1
        result.imports.extend(rel.imports)
        result.routes.extend(rel.routes)
        result.models.extend(rel.models)
        if had_errors:
            result.files_with_syntax_errors.append(record.path)
    return result
