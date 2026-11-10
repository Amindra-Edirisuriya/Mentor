"""Project upload and report endpoints."""

import logging
import re
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path, PurePath
from typing import Any

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analysis.report import analyse_project
from app.config import Settings, get_settings
from app.db import get_db
from app.ingestion.zip_safe import MB, UnsafeArchiveError, ZipLimits, extract_zip_safely
from app.models import AnalysisRun, Project, User
from app.schemas import ProjectCreated, ProjectOut
from app.security.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])
_CHUNK = 1024 * 1024
_SAFE_NAME = re.compile(r"[^A-Za-z0-9 ._-]+")


def _clean_name(raw: str) -> str:
    return _SAFE_NAME.sub("", raw).strip()[:255] or "project"


def _save_upload(file: UploadFile, target: Path, max_bytes: int) -> None:
    """Stream the upload to disk, refusing anything larger than ``max_bytes``."""
    target.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with open(target, "xb") as out:
        while chunk := file.file.read(_CHUNK):
            written += len(chunk)
            if written > max_bytes:
                raise HTTPException(413, "Uploaded file is too large.")
            out.write(chunk)


def project_source_dir(settings: Settings, project_id: uuid.UUID) -> Path:
    return settings.storage_dir / "projects" / str(project_id) / "source"


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ProjectCreated)
def create_project(
    file: UploadFile,
    name: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ProjectCreated:
    original = PurePath(file.filename or "").name
    if not original.lower().endswith(".zip"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please upload a .zip file.")

    project_id = uuid.uuid4()
    upload_path = settings.storage_dir / "uploads" / f"{project_id}.zip"
    source_dir = project_source_dir(settings, project_id)
    limits = ZipLimits(max_archive_bytes=settings.max_upload_mb * MB)
    try:
        _save_upload(file, upload_path, limits.max_archive_bytes)
        extraction = extract_zip_safely(upload_path, source_dir, limits)
    except UnsafeArchiveError as exc:
        shutil.rmtree(source_dir.parent, ignore_errors=True)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except BaseException:
        shutil.rmtree(source_dir.parent, ignore_errors=True)
        raise
    finally:
        upload_path.unlink(missing_ok=True)

    project = Project(id=project_id, owner_id=user.id, name=_clean_name(name or Path(original).stem), original_filename=original)
    db.add(project)
    return _run_analysis(db, project, source_dir, extraction.skipped_nested_archives)


def _run_analysis(db: Session, project: Project, source_dir: Path, skipped: list[str]) -> ProjectCreated:
    """Analyse the extracted source into a new run. Uploaded code is only read, never run."""
    run = AnalysisRun(project=project, status="running", created_at=datetime.now(UTC))
    db.add(run)
    db.flush()

    summary: dict[str, Any] | None = None
    try:
        report = analyse_project(source_dir, skipped)
        run.report = report.model_dump(mode="json")
        run.status = "succeeded"
        summary = run.report["summary"]
    except Exception:  # analysis bugs must not lose the upload record
        logger.exception("Analysis failed for project %s", project.id)
        run.status = "failed"
        run.error = "Analysis failed due to an internal error."
    run.finished_at = datetime.now(UTC)
    db.commit()
    return ProjectCreated(
        project_id=project.id, run_id=run.id, status=run.status, error=run.error, summary=summary
    )


@router.post("/{project_id}/reanalyse", response_model=ProjectCreated)
def reanalyse_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ProjectCreated:
    """Re-run analysis on the stored source, so detector improvements reach old uploads."""
    project = get_project_or_404(db, project_id, user)
    source_dir = project_source_dir(settings, project.id)
    if not source_dir.is_dir():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The uploaded files are no longer stored. Upload the ZIP again.")
    previous = next((r.report for r in reversed(project.runs) if r.report), None) or {}
    return _run_analysis(db, project, source_dir, list(previous.get("skipped_nested_archives", [])))


@router.get("", response_model=list[ProjectOut])
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Project]:
    query = select(Project).where(Project.owner_id == user.id).order_by(Project.created_at.desc())
    return list(db.scalars(query))


def get_project_or_404(db: Session, project_id: uuid.UUID, user: User) -> Project:
    """The user's own project. Someone else's project is a 404, so ids can't be probed."""
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    return project


def latest_successful_run(project: Project) -> AnalysisRun:
    run = next((r for r in reversed(project.runs) if r.status == "succeeded"), None)
    if run is None or run.report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No successful analysis for this project.")
    return run


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Project:
    return get_project_or_404(db, project_id, user)


@router.get("/{project_id}/report")
def get_report(
    project_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    run = latest_successful_run(get_project_or_404(db, project_id, user))
    return {"run_id": str(run.id), "report": run.report}
