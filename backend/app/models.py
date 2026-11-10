"""Database models. Reports are stored as JSONB (JSON on non-Postgres test databases)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

JSONDocument = JSON().with_variant(JSONB(), "postgresql")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True)  # stored lower-cased
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))  # Argon2id, never the password
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserSession(Base):
    """A login session. Only the SHA-256 of the cookie token is stored, so a DB leak can't log anyone in."""

    __tablename__ = "user_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Nullable only for uploads made before accounts existed; those are visible to no one.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    runs: Mapped[list["AnalysisRun"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="AnalysisRun.created_at"
    )


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(20))  # running | succeeded | failed
    error: Mapped[str | None] = mapped_column(Text)
    report: Mapped[dict[str, Any] | None] = mapped_column(JSONDocument)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSONDocument)  # validated LLM claims
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project: Mapped[Project] = relationship(back_populates="runs")


class LearningOutput(Base):
    """Generated, validated learning content: concept explanations, question sets, presentations."""

    __tablename__ = "learning_outputs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("analysis_runs.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(30))  # explanation | questions | presentation
    key: Mapped[str] = mapped_column(String(100))  # concept key, or "" when not per concept
    content: Mapped[dict[str, Any]] = mapped_column(JSONDocument)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ConceptProgress(Base):
    __tablename__ = "concept_progress"

    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    concept_key: Mapped[str] = mapped_column(String(50), primary_key=True)
    score: Mapped[float] = mapped_column(Float)  # 0-100, moving average of graded answers
    attempts: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PracticeAttempt(Base):
    __tablename__ = "practice_attempts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    concept_key: Mapped[str] = mapped_column(String(50))
    mode: Mapped[str] = mapped_column(String(10))  # quiz | viva
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    score: Mapped[int] = mapped_column(Integer)
    grade: Mapped[dict[str, Any]] = mapped_column(JSONDocument)  # feedback, missing points, evidence
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
