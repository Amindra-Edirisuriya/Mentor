"""learning_outputs, concept_progress, practice_attempts

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_DOC = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _project_fk(primary_key: bool = False) -> sa.Column:
    return sa.Column(
        "project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=primary_key, nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "learning_outputs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _project_fk(),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("analysis_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("content", JSON_DOC, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_learning_outputs_project_id", "learning_outputs", ["project_id"])
    op.create_table(
        "concept_progress",
        _project_fk(primary_key=True),
        sa.Column("concept_key", sa.String(50), primary_key=True),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "practice_attempts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _project_fk(),
        sa.Column("concept_key", sa.String(50), nullable=False),
        sa.Column("mode", sa.String(10), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("grade", JSON_DOC, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_practice_attempts_project_id", "practice_attempts", ["project_id"])


def downgrade() -> None:
    op.drop_table("practice_attempts")
    op.drop_table("concept_progress")
    op.drop_table("learning_outputs")
