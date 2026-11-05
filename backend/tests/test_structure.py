import json

from app.analysis.manifests import parse_manifests
from app.analysis.scanner import scan_project
from app.analysis.structure import build_structure


def _analyse(make_tree, files):
    root = make_tree(files)
    scan = scan_project(root)
    return build_structure(scan, parse_manifests(root, scan))


def test_mern_structure(make_tree) -> None:
    server_pkg = json.dumps(
        {"name": "api", "main": "index.js", "scripts": {"start": "node server.js"},
         "dependencies": {"express": "^4", "mongoose": "^7"}},
        indent=2,
    )
    structure = _analyse(
        make_tree,
        {
            "app/server/package.json": server_pkg,
            "app/server/server.js": "x\n",
            "app/server/routes/auth.js": "x\n",
            "app/server/routes/songs.js": "x\n",
            "app/server/models/User.js": "x\n",
            "app/client/package.json": json.dumps({"dependencies": {"react": "^18"}}),
            "app/client/src/main.jsx": "x\n",
            "app/client/src/components/Player.jsx": "x\n",
        },
    )

    assert structure.root_prefix == "app"
    pkgs = {p.directory: p for p in structure.packages}
    server, client = pkgs["app/server"], pkgs["app/client"]

    assert server.role == "backend" and server.name == "api"
    assert [e.path for e in server.entry_points] == ["app/server/server.js"]  # main index.js doesn't exist
    ep = server.entry_points[0]
    assert ep.reason == 'npm script "start"'
    assert ep.evidence.file_path == "app/server/package.json"
    assert '"start"' in server_pkg.splitlines()[ep.evidence.line_start - 1]
    assert {e.detail for e in server.role_evidence} == {"npm dependency express"}

    assert client.role == "frontend"
    assert [(e.path, e.reason) for e in client.entry_points] == [
        ("app/client/src/main.jsx", "conventional entry file name")
    ]

    layers = {(layer.kind, layer.directory, layer.file_count) for layer in structure.layers}
    assert ("routes", "app/server/routes", 2) in layers
    assert ("models", "app/server/models", 1) in layers
    assert ("components", "app/client/src/components", 1) in layers

    assert structure.tree.file_count == 8
    app_node = structure.tree.children[0]
    assert app_node.path == "app" and app_node.file_count == 8
    assert {c.path for c in app_node.children} == {"app/client", "app/server"}


def test_no_root_prefix_when_files_at_top(make_tree) -> None:
    structure = _analyse(make_tree, {"README.md": "x", "src/a.js": "x"})
    assert structure.root_prefix == ""
    assert structure.packages == []


def test_fullstack_and_malformed_manifest(make_tree) -> None:
    structure = _analyse(
        make_tree,
        {
            "package.json": json.dumps({"dependencies": {"next": "14", "express": "4"}}),
            "broken/package.json": "{nope",
        },
    )
    assert [(p.directory, p.role) for p in structure.packages] == [("", "fullstack")]
