"""Evidence-grounded summary endpoints."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.projects import get_project_or_404, latest_successful_run, project_source_dir
from app.config import Settings, get_settings
from app.db import get_db
from app.intelligence.llm import FakeLLMClient, LLMClient, LLMError, OpenAICompatibleClient
from app.intelligence.summary import generate_summary
from app.models import User
from app.security.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["summaries"])


def get_llm_client(settings: Settings = Depends(get_settings)) -> LLMClient:
    if settings.llm_provider == "fake":
        return FakeLLMClient()
    if settings.llm_provider == "openai_compatible":
        return OpenAICompatibleClient(
            settings.llm_base_url,
            settings.llm_model,
            settings.llm_api_key.get_secret_value(),
            settings.llm_timeout_seconds,
        )
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        f"LLM provider '{settings.llm_provider}' is not configured. Use 'fake' or 'openai_compatible'.",
    )


def provider_failed(exc: LLMError) -> HTTPException:
    return HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))


@router.post("/{project_id}/summary")
def create_summary(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    client: LLMClient = Depends(get_llm_client),
) -> dict[str, Any]:
    run = latest_successful_run(get_project_or_404(db, project_id, user))
    assert run.report is not None
    try:
        summary = generate_summary(run.report, project_source_dir(settings, project_id), client)
    except LLMError as exc:
        raise provider_failed(exc) from exc
    run.summary = summary.model_dump(mode="json")
    db.commit()
    return {"run_id": str(run.id), "summary": run.summary}


@router.get("/{project_id}/summary")
def get_summary(
    project_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict[str, Any]:
    run = latest_successful_run(get_project_or_404(db, project_id, user))
    if run.summary is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No summary generated yet.")
    return {"run_id": str(run.id), "summary": run.summary}
