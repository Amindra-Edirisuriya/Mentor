"""Deterministic concept detection: which engineering concepts a project uses, with evidence.

Works on the stored report JSON, so reports saved before this module existed still get concepts.
Every concept cites existing report evidence; nothing here guesses or calls an LLM.
"""

import re
from typing import Any

from pydantic import BaseModel

from app.analysis.evidence import Evidence

MAX_EVIDENCE = 6
_RBAC_MIDDLEWARE = re.compile(r"role|authori[sz]e|permission|admin|isartist|islistener|requireadmin", re.I)
_RBAC_FIELDS = {"role", "roles", "isadmin", "permissions", "usertype", "accounttype"}
_UPLOAD_MIDDLEWARE = re.compile(r"upload|\.single\(|\.array\(|\.fields\(|multer", re.I)


class Concept(BaseModel):
    key: str
    name: str
    evidence: list[Evidence]


# key, display name, frameworks (any of which, when *used*, shows the concept)
_FRAMEWORK_CONCEPTS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("components", "Component-based UI", ("React", "Vue", "Angular", "Svelte", "Next.js")),
    ("client-routing", "Client-side routing", ("React Router", "Next.js")),
    ("state-management", "State management", ("Redux",)),
    ("http-client", "Calling APIs from the client", ("Axios",)),
    ("styling", "Utility-first styling", ("Tailwind CSS",)),
    ("build-tooling", "Build tooling and bundling", ("Vite", "Webpack")),
    ("rest-api", "REST API and routing", ("Express", "NestJS", "Koa", "Fastify", "Flask", "FastAPI", "Django")),
    ("database", "Databases", ("MongoDB", "PostgreSQL", "MySQL", "Redis")),
    ("data-modelling", "Data modelling (ORM/ODM)", ("Mongoose", "Sequelize", "Prisma", "SQLAlchemy")),
    ("jwt-auth", "Token authentication (JWT)", ("JWT", "Passport")),
    ("password-hashing", "Password hashing", ("bcrypt",)),
    ("file-uploads", "File uploads", ("Multer (file uploads)",)),
    ("cors", "Cross-origin requests (CORS)", ("CORS middleware",)),
    ("config-secrets", "Configuration and secrets", ("dotenv",)),
    ("realtime", "Real-time communication", ("Socket.IO",)),
    ("testing", "Automated testing", ("Jest", "Vitest", "Mocha", "pytest")),
    ("containers", "Containers", ("Docker",)),
)


def _ev(raw: dict[str, Any]) -> Evidence:
    return Evidence.model_validate(raw)


def _framework_evidence(report: dict[str, Any], names: tuple[str, ...]) -> list[Evidence]:
    found: list[Evidence] = []
    for fw in report.get("frameworks", []):
        if fw["name"] in names and fw["status"] == "used":
            # Prefer source usage (imports) over manifest lines: it shows where the concept lives.
            ordered = sorted(fw["evidence"], key=lambda e: e["detector"] == "manifest")
            found += [_ev(e) for e in ordered]
    return found


def derive_concepts(report: dict[str, Any]) -> list[Concept]:
    rel = report.get("relationships", {})
    routes: list[dict[str, Any]] = rel.get("routes", [])
    models: list[dict[str, Any]] = rel.get("models", [])
    extra: dict[str, list[Evidence]] = {
        "rest-api": [_ev(r["evidence"]) for r in routes if r["method"] != "USE"],
        "middleware": [_ev(r["evidence"]) for r in routes if r["method"] == "USE" or r["middleware"]],
        "data-modelling": [_ev(m["evidence"]) for m in models],
        "file-uploads": [_ev(r["evidence"]) for r in routes if any(_UPLOAD_MIDDLEWARE.search(m) for m in r["middleware"])],
        "rbac": [_ev(r["evidence"]) for r in routes if any(_RBAC_MIDDLEWARE.search(m) for m in r["middleware"])]
        + [_ev(m["evidence"]) for m in models if _RBAC_FIELDS & {f.lower() for f in m["fields"]}],
    }

    concepts: list[Concept] = []
    for key, name, frameworks in _FRAMEWORK_CONCEPTS:
        evidence = _framework_evidence(report, frameworks)
        # Route/model evidence first: it is the student's own code, not a package import.
        evidence = extra.pop(key, []) + evidence if evidence else []
        if evidence:
            concepts.append(Concept(key=key, name=name, evidence=_dedupe(evidence)))
    # Route/model evidence alone is enough for these: it is the student's own code.
    if extra.get("file-uploads"):
        concepts.append(Concept(key="file-uploads", name="File uploads", evidence=_dedupe(extra["file-uploads"])))
    if extra.get("middleware"):
        concepts.append(Concept(key="middleware", name="Middleware pipelines", evidence=_dedupe(extra["middleware"])))
    if extra.get("rbac"):
        concepts.append(Concept(key="rbac", name="Role-based access control", evidence=_dedupe(extra["rbac"])))
    if extra.get("data-modelling") and not any(c.key == "data-modelling" for c in concepts):
        concepts.append(Concept(key="data-modelling", name="Data modelling (ORM/ODM)", evidence=_dedupe(extra["data-modelling"])))
    return concepts


def _dedupe(evidence: list[Evidence]) -> list[Evidence]:
    return list({e.id: e for e in evidence}.values())[:MAX_EVIDENCE]
