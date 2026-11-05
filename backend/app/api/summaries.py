"""Evidence-grounded summary endpoints."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.projects import get_project_or_404, latest_successful_run, project_source_dir
from app.config import Settings, get_settings
from app.db import get_db
from app.intelligence.llm import FakeLLMClient, LLMClient
from app.intelligence.summary import generate_summary

router = APIRouter(prefix="/projects", tags=["summaries"])


def get_llm_client(settings: Settings = Depends(get_settings)) -> LLMClient:
    if settings.llm_provider == "fake":
        return FakeLLMClient()
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        f"LLM provider '{settings.llm_provider}' is not configured. Only 'fake' is available.",
    )


@router.post("/{project_id}/summary")
def create_summary(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    client: LLMClient = Depends(get_llm_client),
) -> dict[str, Any]:
    run = latest_successful_run(get_project_or_404(db, project_id))
    assert run.report is not None
    summary = generate_summary(run.report, project_source_dir(settings, project_id), client)
    run.summary = summary.model_dump(mode="json")
    db.commit()
    return {"run_id": str(run.id), "summary": run.summary}


@router.get("/{project_id}/summary")
def get_summary(project_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    run = latest_successful_run(get_project_or_404(db, project_id))
    if run.summary is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No summary generated yet.")
    return {"run_id": str(run.id), "summary": run.summary}
