"""AI hiring assistant: job eligibility criteria and stored AI screening and final reviews.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("eligibility_criteria", sa.String(length=5000), nullable=False, server_default=""))
    op.add_column("applications", sa.Column("ai_screening", sa.JSON(), nullable=True))
    op.add_column("applications", sa.Column("ai_final_review", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("applications", "ai_final_review")
    op.drop_column("applications", "ai_screening")
    op.drop_column("jobs", "eligibility_criteria")
