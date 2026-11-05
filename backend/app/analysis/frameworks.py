"""Rule-based framework/technology detection from manifests and well-known config files.

A finding here means the technology is *declared* (dependency or config file present), not
that the code actually uses it. Usage evidence comes from source relationships (increment 5).
"""

import fnmatch
from dataclasses import dataclass
from pathlib import PurePosixPath

from pydantic import BaseModel

from app.analysis.evidence import Evidence, make_evidence
from app.analysis.manifests import Manifest
from app.analysis.scanner import ScanResult

DETECTOR = "framework-rules"


@dataclass(frozen=True)
class Rule:
    name: str
    category: str
    packages: tuple[str, ...] = ()
    config_globs: tuple[str, ...] = ()


RULES: tuple[Rule, ...] = (
    # Frontend
    Rule("React", "frontend", ("react",)),
    Rule("Vue", "frontend", ("vue",)),
    Rule("Angular", "frontend", ("@angular/core",), ("angular.json",)),
    Rule("Svelte", "frontend", ("svelte",)),
    Rule("Next.js", "frontend", ("next",), ("next.config.*",)),
    Rule("React Router", "frontend", ("react-router", "react-router-dom")),
    Rule("Redux", "frontend", ("redux", "@reduxjs/toolkit")),
    Rule("Tailwind CSS", "styling", ("tailwindcss",), ("tailwind.config.*",)),
    Rule("Vite", "build", ("vite",), ("vite.config.*",)),
    Rule("Webpack", "build", ("webpack",), ("webpack.config.*",)),
    # Backend (Node)
    Rule("Express", "backend", ("express",)),
    Rule("NestJS", "backend", ("@nestjs/core",)),
    Rule("Koa", "backend", ("koa",)),
    Rule("Fastify", "backend", ("fastify",)),
    Rule("Socket.IO", "realtime", ("socket.io", "socket.io-client")),
    # Data
    Rule("MongoDB", "database", ("mongodb", "mongoose")),
    Rule("Mongoose", "orm", ("mongoose",)),
    Rule("PostgreSQL", "database", ("pg", "psycopg", "psycopg2", "psycopg2-binary", "asyncpg")),
    Rule("MySQL", "database", ("mysql", "mysql2", "pymysql")),
    Rule("Sequelize", "orm", ("sequelize",)),
    Rule("Prisma", "orm", ("prisma", "@prisma/client"), ("prisma/schema.prisma",)),
    Rule("Redis", "database", ("redis", "ioredis")),
    # Auth & security
    Rule("JWT", "auth", ("jsonwebtoken", "jose", "pyjwt", "python-jose")),
    Rule("bcrypt", "auth", ("bcrypt", "bcryptjs", "passlib")),
    Rule("Passport", "auth", ("passport",)),
    # Uploads & HTTP
    Rule("Multer (file uploads)", "uploads", ("multer",)),
    Rule("Axios", "http-client", ("axios",)),
    Rule("CORS middleware", "backend", ("cors",)),
    Rule("dotenv", "config", ("dotenv", "python-dotenv")),
    # Python
    Rule("Django", "backend", ("django",), ("manage.py",)),
    Rule("Flask", "backend", ("flask",)),
    Rule("FastAPI", "backend", ("fastapi",)),
    Rule("SQLAlchemy", "orm", ("sqlalchemy",)),
    # Testing
    Rule("Jest", "testing", ("jest",), ("jest.config.*",)),
    Rule("Vitest", "testing", ("vitest",), ("vitest.config.*",)),
    Rule("Mocha", "testing", ("mocha",)),
    Rule("pytest", "testing", ("pytest",)),
    # Infra
    Rule("Docker", "infrastructure", (), ("Dockerfile", "docker-compose.yml", "docker-compose.yaml")),
)


MAX_USAGE_EVIDENCE = 5


class FrameworkFinding(BaseModel):
    name: str
    category: str
    status: str = "declared"  # "declared" (manifest/config only) or "used" (imported in source)
    evidence: list[Evidence]


def apply_usage(
    findings: list[FrameworkFinding], imported_packages: dict[str, list[Evidence]]
) -> list[FrameworkFinding]:
    """Upgrade findings to ``used`` when source code imports one of the rule's packages."""
    rules = {r.name: r for r in RULES}
    for finding in findings:
        usage: list[Evidence] = []
        for package in rules[finding.name].packages:
            usage.extend(imported_packages.get(package, []))
        if usage:
            finding.status = "used"
            known = {e.id for e in finding.evidence}
            finding.evidence += [e for e in usage if e.id not in known][:MAX_USAGE_EVIDENCE]
    return findings


def detect_frameworks(manifests: list[Manifest], scan: ScanResult) -> list[FrameworkFinding]:
    deps_by_name: dict[str, list[Evidence]] = {}
    for manifest in manifests:
        for dep in manifest.dependencies:
            deps_by_name.setdefault(dep.name.lower(), []).append(dep.evidence)

    findings = []
    for rule in RULES:
        evidence: list[Evidence] = []
        for package in rule.packages:
            evidence.extend(deps_by_name.get(package, []))
        for record in scan.files:
            name = PurePosixPath(record.path).name
            if any(
                fnmatch.fnmatchcase(name, g) or fnmatch.fnmatchcase(record.path, g)
                for g in rule.config_globs
            ):
                evidence.append(
                    make_evidence(DETECTOR, record.path, 0, detail=f"{rule.name} config file")
                )
        if evidence:
            unique = {e.id: e for e in evidence}
            findings.append(
                FrameworkFinding(
                    name=rule.name,
                    category=rule.category,
                    evidence=sorted(unique.values(), key=lambda e: (e.file_path, e.line_start)),
                )
            )
    return findings
