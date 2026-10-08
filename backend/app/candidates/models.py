import uuid
from datetime import datetime

from sqlalchemy import JSON, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.db.common import TIMESTAMPTZ, enum_column, utcnow
from app.jobs.models import Stage


class Application(SQLModel, table=True):
    """A candidate's application to one job. Candidates have no account."""

    __tablename__ = "applications"
    # The same email cannot apply twice to the same job. This also indexes job_id lookups.
    __table_args__ = (UniqueConstraint("job_id", "email", name="uq_applications_job_id_email"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    job_id: uuid.UUID = Field(foreign_key="jobs.id")
    full_name: str
    email: str
    phone: str
    cv_url: str
    candidate_qualifications: str = Field(default="", max_length=5000)
    expected_salary: int | None = Field(default=None, ge=0)
    match_score: int | None = Field(default=None, ge=0, le=100)
    manager_notes: str | None = Field(default=None, max_length=5000)
    interviewer_recommendation: str | None = None
    supporting_documents: list[dict[str, str]] = Field(default_factory=list, sa_type=JSON)
    cover_letter: str | None = None
    stage: Stage = Field(default=Stage.applied, sa_type=enum_column(Stage))
    created_at: datetime = Field(default_factory=utcnow, sa_type=TIMESTAMPTZ)


class StageHistory(SQLModel, table=True):
    """One row for every stage change. The first row (from_stage empty) is the application itself."""

    __tablename__ = "stage_history"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    application_id: uuid.UUID = Field(foreign_key="applications.id", index=True)
    from_stage: Stage | None = Field(default=None, sa_type=enum_column(Stage))
    to_stage: Stage = Field(sa_type=enum_column(Stage))
    # Empty for the first row, because the candidate applied without an account.
    changed_by_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    changed_at: datetime = Field(default_factory=utcnow, sa_type=TIMESTAMPTZ)
