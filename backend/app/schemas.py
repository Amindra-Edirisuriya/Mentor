"""API response models."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    created_at: datetime


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    error: str | None
    created_at: datetime
    finished_at: datetime | None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    original_filename: str
    created_at: datetime
    runs: list[RunOut]


class ProjectCreated(BaseModel):
    project_id: uuid.UUID
    run_id: uuid.UUID
    status: str
    error: str | None = None
    summary: dict[str, Any] | None = None
