"""hiring workflows

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("qualification_requirements", sa.String(length=5000), nullable=False, server_default=""))
    op.add_column("jobs", sa.Column("salary_min", sa.Integer(), nullable=True))
    op.add_column("jobs", sa.Column("salary_max", sa.Integer(), nullable=True))

    op.add_column("applications", sa.Column("candidate_qualifications", sa.String(length=5000), nullable=False, server_default=""))
    op.add_column("applications", sa.Column("expected_salary", sa.Integer(), nullable=True))
    op.add_column("applications", sa.Column("match_score", sa.Integer(), nullable=True))
    op.add_column("applications", sa.Column("manager_notes", sa.String(length=5000), nullable=True))
    op.add_column("applications", sa.Column("interviewer_recommendation", sa.String(length=20), nullable=True))
    op.add_column(
        "applications",
        sa.Column("supporting_documents", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )

    op.execute("ALTER TABLE interviews DROP CONSTRAINT IF EXISTS no_overlapping_interviews")
    op.alter_column("interviews", "starts_at", existing_type=sa.DateTime(timezone=True), nullable=True)
    op.alter_column("interviews", "ends_at", existing_type=sa.DateTime(timezone=True), nullable=True)
    op.add_column("interviews", sa.Column("meeting_type", sa.String(length=20), nullable=True))
    op.add_column("interviews", sa.Column("meeting_url", sa.String(), nullable=True))
    op.add_column("interviews", sa.Column("location", sa.String(), nullable=True))
    op.alter_column(
        "interviews",
        "status",
        existing_type=sa.Enum("scheduled", "completed", "cancelled", name="interviewstatus", native_enum=False, length=20),
        type_=sa.String(length=20),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "ck_interviews_status",
        "interviews",
        "status IN ('assigned', 'scheduled', 'completed', 'cancelled')",
    )
    op.execute(
        """
        CREATE EXTENSION IF NOT EXISTS btree_gist;
        ALTER TABLE interviews
        ADD CONSTRAINT no_overlapping_interviews
        EXCLUDE USING gist (interviewer_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
        WHERE (status = 'scheduled');
        """
    )

    op.add_column("scorecards", sa.Column("recommendation", sa.String(length=20), nullable=True))
    op.create_check_constraint(
        "ck_scorecards_recommendation",
        "scorecards",
        "recommendation IS NULL OR recommendation IN ('recommend', 'maybe', 'not_recommend')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_scorecards_recommendation", "scorecards", type_="check")
    op.drop_column("scorecards", "recommendation")

    op.execute("ALTER TABLE interviews DROP CONSTRAINT IF EXISTS no_overlapping_interviews")
    op.drop_constraint("ck_interviews_status", "interviews", type_="check")
    op.alter_column(
        "interviews",
        "status",
        existing_type=sa.String(length=20),
        type_=sa.Enum("scheduled", "completed", "cancelled", name="interviewstatus", native_enum=False, length=20),
        existing_nullable=False,
    )
    op.execute(
        """
        CREATE EXTENSION IF NOT EXISTS btree_gist;
        ALTER TABLE interviews
        ADD CONSTRAINT no_overlapping_interviews
        EXCLUDE USING gist (interviewer_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
        WHERE (status <> 'cancelled');
        """
    )
    op.drop_column("interviews", "location")
    op.drop_column("interviews", "meeting_url")
    op.drop_column("interviews", "meeting_type")
    op.alter_column("interviews", "ends_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("interviews", "starts_at", existing_type=sa.DateTime(timezone=True), nullable=False)

    op.drop_column("applications", "supporting_documents")
    op.drop_column("applications", "interviewer_recommendation")
    op.drop_column("applications", "manager_notes")
    op.drop_column("applications", "match_score")
    op.drop_column("applications", "expected_salary")
    op.drop_column("applications", "candidate_qualifications")

    op.drop_column("jobs", "salary_max")
    op.drop_column("jobs", "salary_min")
    op.drop_column("jobs", "qualification_requirements")
