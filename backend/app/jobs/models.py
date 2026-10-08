import uuid
from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.db.common import TIMESTAMPTZ, enum_column, utcnow


class Stage(StrEnum):
    """The hiring pipeline: applied -> screen -> interview -> offer -> hired / rejected."""

    applied = "applied"
    screen = "screen"
    interview = "interview"
    offer = "offer"
    hired = "hired"
    rejected = "rejected"


class JobStatus(StrEnum):
    draft = "draft"  # not visible to candidates
    open = "open"  # the public application page accepts applications
    closed = "closed"  # no longer accepts applications


class Job(SQLModel, table=True):
    __tablename__ = "jobs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="companies.id", index=True)
    hiring_manager_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    title: str
    description: str
    qualification_requirements: str = Field(default="", max_length=5000)
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)
    status: JobStatus = Field(default=JobStatus.draft, sa_type=enum_column(JobStatus))
    created_at: datetime = Field(default_factory=utcnow, sa_type=TIMESTAMPTZ)
