"""A small MERN-shaped sample project used by report, API and intelligence tests."""

import io
import json
import zipfile


def zip_bytes(files: dict[str, str | bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buffer.getvalue()


MERN_PROJECT: dict[str, str | bytes] = {
    "soundapp/server/package.json": json.dumps(
        {
            "name": "sound-server",
            "main": "index.js",
            "scripts": {"start": "node index.js"},
            "dependencies": {
                "express": "^4.18.2",
                "mongoose": "^7.0.0",
                "jsonwebtoken": "^9.0.0",
                "multer": "^1.4.5",
            },
        },
        indent=2,
    ),
    "soundapp/server/index.js": (
        "const express = require('express');\n"
        "const mongoose = require('mongoose');\n"
        "const songRoutes = require('./routes/songs');\n"
        "const app = express();\n"
        "app.use('/api/songs', songRoutes);\n"
        "app.listen(5000);\n"
    ),
    "soundapp/server/routes/songs.js": (
        "const express = require('express');\n"
        "const jwt = require('jsonwebtoken');\n"
        "const router = express.Router();\n"
        "router.get('/', async (req, res) => {});\n"
        "router.post('/', verifyToken, async (req, res) => {});\n"
        "module.exports = router;\n"
    ),
    "soundapp/server/models/Song.js": (
        "const mongoose = require('mongoose');\n"
        "const songSchema = new mongoose.Schema({ title: String, artist: { type: String, ref: 'User' } });\n"
        "module.exports = mongoose.model('Song', songSchema);\n"
    ),
    "soundapp/server/.env": "JWT_SECRET=super-secret-value-123\nMONGO_URI=mongodb://user:pass@host/db\n",
    "soundapp/client/package.json": json.dumps({"dependencies": {"react": "^18.2.0", "axios": "^1"}}, indent=2),
    "soundapp/client/src/main.jsx": "import React from 'react';\nimport axios from 'axios';\n",
}
