import json

from app.analysis.frameworks import apply_usage, detect_frameworks
from app.analysis.manifests import parse_manifests
from app.analysis.relationships import extract_file, extract_relationships
from app.analysis.scanner import scan_project

SERVER_INDEX = """\
const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const app = express();

app.use(express.json());
app.use('/api/auth', authRoutes);
app.get('/health', (req, res) => res.send('ok'));
app.listen(5000);
"""

AUTH_ROUTES = """\
import express from 'express';
import { verifyToken, requireRole } from '../middleware/auth.js';
import upload from '../middleware/upload';
const router = express.Router();

router.post('/register', async (req, res) => {});
router.post(
  '/upload',
  verifyToken,
  requireRole('artist'),
  upload.single('audio'),
  async (req, res) => {}
);
router.route('/me').get(verifyToken, (req, res) => {});
export default router;
"""

SONG_MODEL = """\
const mongoose = require('mongoose');
const songSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  'audioUrl': String,
});
module.exports = mongoose.model('Song', songSchema);
"""

CLIENT_API = """\
import axios from 'axios';
import type { Song } from './types';
export const getSongs = () => axios.get('/api/songs');
const lazy = () => import('./Player');
"""


def test_imports_kinds_and_resolution() -> None:
    existing = {"server/index.js", "server/routes/auth.js"}
    rel, had_errors = extract_file("server/index.js", SERVER_INDEX.encode(), existing)

    assert not had_errors
    by_spec = {e.specifier: e for e in rel.imports}
    assert by_spec["express"].package == "express" and by_spec["express"].kind == "require"
    assert by_spec["./routes/auth"].target_file == "server/routes/auth.js"
    assert by_spec["./routes/auth"].package is None
    assert by_spec["mongoose"].evidence.line_start == 2


def test_express_routes_with_middleware_and_mounts() -> None:
    index_rel, _ = extract_file("server/index.js", SERVER_INDEX.encode(), set())
    auth_rel, _ = extract_file("server/routes/auth.js", AUTH_ROUTES.encode(), set())

    index_routes = [(r.method, r.path) for r in index_rel.routes]
    assert index_routes == [("USE", None), ("USE", "/api/auth"), ("GET", "/health")]
    mount = index_rel.routes[1]
    assert mount.middleware == ["authRoutes"] and mount.evidence.line_start == 7

    routes = {(r.method, r.path): r for r in auth_rel.routes}
    assert set(routes) == {("POST", "/register"), ("POST", "/upload"), ("GET", "/me")}
    upload = routes[("POST", "/upload")]
    assert upload.middleware == ["verifyToken", "requireRole('artist')", "upload.single('audio')"]
    assert (upload.evidence.line_start, upload.evidence.line_end) == (7, 13)
    assert routes[("GET", "/me")].middleware == ["verifyToken"]


def test_client_http_calls_are_not_routes() -> None:
    rel, had_errors = extract_file("client/src/api.ts", CLIENT_API.encode(), {"client/src/Player.tsx"})

    assert not had_errors
    assert rel.routes == []
    kinds = {e.specifier: e.kind for e in rel.imports}
    assert kinds == {"axios": "esm", "./types": "esm", "./Player": "dynamic"}
    assert next(e for e in rel.imports if e.specifier == "./Player").target_file == "client/src/Player.tsx"


def test_mongoose_model_fields_and_refs() -> None:
    rel, _ = extract_file("server/models/Song.js", SONG_MODEL.encode(), set())

    assert len(rel.models) == 1
    song = rel.models[0]
    assert song.name == "Song"
    assert song.fields == ["title", "artist", "likes", "audioUrl"]
    assert song.refs == ["User"]
    assert song.evidence.line_start == 8


def test_model_call_without_mongoose_import_is_ignored() -> None:
    rel, _ = extract_file("x.js", b"const m = model('Thing', {});\n", set())
    assert rel.models == []


def test_tsx_and_syntax_errors_are_tolerated() -> None:
    rel, had_errors = extract_file(
        "client/src/App.tsx",
        b"import React from 'react';\nexport default function App(): JSX.Element { return <div>hi</div>; }\n",
        set(),
    )
    assert not had_errors and [e.package for e in rel.imports] == ["react"]

    rel, had_errors = extract_file("broken.js", b"import fs from 'fs';\nconst = = ;\n", set())
    assert had_errors
    assert rel.imports[0].builtin


def test_extract_relationships_and_usage_upgrade(make_tree) -> None:
    root = make_tree(
        {
            "server/package.json": json.dumps(
                {"dependencies": {"express": "4", "mongoose": "7", "jsonwebtoken": "9"}}, indent=2
            ),
            "server/index.js": SERVER_INDEX,
            "server/routes/auth.js": AUTH_ROUTES,
            "server/models/Song.js": SONG_MODEL,
            "server/node_modules/express/index.js": "module.exports = 1;\n",
        }
    )
    scan = scan_project(root)
    rel = extract_relationships(root, scan)

    assert rel.files_parsed == 3
    assert {m.name for m in rel.models} == {"Song"}
    assert len(rel.routes) == 6

    findings = apply_usage(detect_frameworks(parse_manifests(root, scan), scan), rel.imported_packages())
    status = {f.name: f.status for f in findings}
    assert status["Express"] == "used"
    assert status["Mongoose"] == "used"
    assert status["JWT"] == "declared"  # jsonwebtoken is a dependency but never imported
    express = next(f for f in findings if f.name == "Express")
    assert any(e.detector == "ts-imports" for e in express.evidence)
