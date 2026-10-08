"""team invitations

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("invited_by_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("company_admin", "hiring_manager", "interviewer", name="role", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["invited_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_invitations_company_id", "invitations", ["company_id"])
    op.create_index("ix_invitations_email", "invitations", ["email"])
    op.create_index("ix_invitations_token_hash", "invitations", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_invitations_token_hash", table_name="invitations")
    op.drop_index("ix_invitations_email", table_name="invitations")
    op.drop_index("ix_invitations_company_id", table_name="invitations")
    op.drop_table("invitations")
