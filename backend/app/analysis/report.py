"""Assemble the deterministic analysis report for an extracted project."""

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.analysis.evidence import Evidence
from app.analysis.frameworks import FrameworkFinding, apply_usage, detect_frameworks
from app.analysis.manifests import Manifest, parse_manifests
from app.analysis.relationships import CodeRelationships, extract_relationships
from app.analysis.scanner import ScanResult, scan_project
from app.analysis.structure import ProjectStructure, build_structure

REPORT_SCHEMA_VERSION = 1


class ReportSummary(BaseModel):
    file_count: int
    source_lines: int
    languages: dict[str, int]  # language -> source/test lines
    frameworks_used: list[str]
    frameworks_declared_only: list[str]
    route_count: int
    model_count: int


class AnalysisReport(BaseModel):
    schema_version: int = REPORT_SCHEMA_VERSION
    summary: ReportSummary
    scan: ScanResult
    manifests: list[Manifest]
    frameworks: list[FrameworkFinding]
    structure: ProjectStructure
    relationships: CodeRelationships
    skipped_nested_archives: list[str] = Field(default_factory=list)


def analyse_project(root: Path, skipped_nested_archives: list[str] | None = None) -> AnalysisReport:
    scan = scan_project(root)
    manifests = parse_manifests(root, scan)
    relationships = extract_relationships(root, scan)
    frameworks = apply_usage(detect_frameworks(manifests, scan), relationships.imported_packages())
    structure = build_structure(scan, manifests)

    summary = ReportSummary(
        file_count=len(scan.files),
        source_lines=sum(s.lines for s in scan.languages.values()),
        languages={lang: s.lines for lang, s in scan.languages.items()},
        frameworks_used=[f.name for f in frameworks if f.status == "used"],
        frameworks_declared_only=[f.name for f in frameworks if f.status == "declared"],
        route_count=len(relationships.routes),
        model_count=len(relationships.models),
    )
    return AnalysisReport(
        summary=summary,
        scan=scan,
        manifests=manifests,
        frameworks=frameworks,
        structure=structure,
        relationships=relationships,
        skipped_nested_archives=sorted(skipped_nested_archives or []),
    )


_EVIDENCE_KEYS = frozenset(Evidence.model_fields)


def collect_evidence(report: dict[str, Any] | AnalysisReport) -> dict[str, Evidence]:
    """Index every evidence object in a report (model or stored JSON) by id."""
    data = report.model_dump() if isinstance(report, AnalysisReport) else report
    found: dict[str, Evidence] = {}
    stack: list[Any] = [data]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            if _EVIDENCE_KEYS <= item.keys() and str(item.get("id", "")).startswith("ev-"):
                found[item["id"]] = Evidence.model_validate({k: item[k] for k in _EVIDENCE_KEYS})
            else:
                stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return found
