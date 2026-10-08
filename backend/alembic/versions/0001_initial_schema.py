"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Needed so the interview exclusion constraint can compare a uuid with "=".
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.create_table(
        "companies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("company_admin", "hiring_manager", "interviewer", name="role", native_enum=False, length=20),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("hiring_manager_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "open", "closed", name="jobstatus", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["hiring_manager_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jobs_company_id", "jobs", ["company_id"])

    op.create_table(
        "applications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("cv_url", sa.String(), nullable=False),
        sa.Column("cover_letter", sa.String(), nullable=True),
        sa.Column(
            "stage",
            sa.Enum(
                "applied", "screen", "interview", "offer", "hired", "rejected",
                name="stage", native_enum=False, length=20,
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "email", name="uq_applications_job_id_email"),
    )

    op.create_table(
        "stage_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column(
            "from_stage",
            sa.Enum(
                "applied", "screen", "interview", "offer", "hired", "rejected",
                name="stage", native_enum=False, length=20,
            ),
            nullable=True,
        ),
        sa.Column(
            "to_stage",
            sa.Enum(
                "applied", "screen", "interview", "offer", "hired", "rejected",
                name="stage", native_enum=False, length=20,
            ),
            nullable=False,
        ),
        sa.Column("changed_by_id", sa.Uuid(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"]),
        sa.ForeignKeyConstraint(["changed_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stage_history_application_id", "stage_history", ["application_id"])

    op.create_table(
        "interviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column("interviewer_id", sa.Uuid(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum("scheduled", "completed", "cancelled", name="interviewstatus", native_enum=False, length=20),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"]),
        sa.ForeignKeyConstraint(["interviewer_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_interviews_application_id", "interviews", ["application_id"])
    # An interviewer cannot have two overlapping interviews (cancelled ones do not count).
    # The time range is [start, end), so back-to-back interviews are allowed.
    # The database enforces this, so two simultaneous requests cannot both succeed.
    op.execute(
        """
        ALTER TABLE interviews
        ADD CONSTRAINT no_overlapping_interviews
        EXCLUDE USING gist (
            interviewer_id WITH =,
            tstzrange(starts_at, ends_at) WITH &&
        )
        WHERE (status <> 'cancelled')
        """
    )

    op.create_table(
        "scorecards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "submitted", name="scorecardstatus", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scorecards_interview_id", "scorecards", ["interview_id"], unique=True)

    op.create_table(
        "scorecard_ratings",
        sa.Column("scorecard_id", sa.Uuid(), nullable=False),
        sa.Column("criterion", sa.String(length=100), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(), nullable=True),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_scorecard_ratings_rating"),
        sa.ForeignKeyConstraint(["scorecard_id"], ["scorecards.id"]),
        sa.PrimaryKeyConstraint("scorecard_id", "criterion"),
    )


def downgrade() -> None:
    op.drop_table("scorecard_ratings")
    op.drop_table("scorecards")
    op.drop_table("interviews")
    op.drop_table("stage_history")
    op.drop_table("applications")
    op.drop_table("jobs")
    op.drop_table("users")
    op.drop_table("companies")
