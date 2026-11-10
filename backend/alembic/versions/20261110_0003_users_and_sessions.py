"""users, sessions, password reset tokens, projects.owner_id

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for table in ("user_sessions", "password_reset_tokens"):
        extra = (
            [sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]
            if table == "user_sessions"
            else [sa.Column("used_at", sa.DateTime(timezone=True), nullable=True)]
        )
        op.create_table(
            table,
            sa.Column("token_hash", sa.String(64), primary_key=True),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            *extra,
        )
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])
    with op.batch_alter_table("projects") as batch:
        batch.add_column(sa.Column("owner_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key("fk_projects_owner_id_users", "users", ["owner_id"], ["id"], ondelete="CASCADE")
        batch.create_index("ix_projects_owner_id", ["owner_id"])


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.drop_index("ix_projects_owner_id")
        batch.drop_constraint("fk_projects_owner_id_users", type_="foreignkey")
        batch.drop_column("owner_id")
    op.drop_table("password_reset_tokens")
    op.drop_table("user_sessions")
    op.drop_table("users")
