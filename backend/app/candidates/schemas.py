import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.candidates.models import Application
from app.jobs.models import Job, Stage
from app.scorecards.models import Recommendation

FINAL_STAGES = (Stage.hired, Stage.rejected)


class ApplicationRead(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    job_title: str
    job_qualification_requirements: str
    job_salary_min: int | None
    job_salary_max: int | None
    full_name: str
    email: str
    phone: str
    cv_url: str
    candidate_qualifications: str
    expected_salary: int | None
    match_score: int | None
    manager_notes: str | None
    interviewer_recommendation: Recommendation | None
    supporting_documents: list[dict[str, str]]
    cover_letter: str | None
    stage: Stage
    created_at: datetime

    @classmethod
    def from_rows(cls, application: Application, job: Job) -> "ApplicationRead":
        return cls(
            **application.model_dump(),
            job_title=job.title,
            job_qualification_requirements=job.qualification_requirements,
            job_salary_min=job.salary_min,
            job_salary_max=job.salary_max,
        )


class ApplicationReceipt(BaseModel):
    """What a candidate gets back after applying."""

    id: uuid.UUID
    created_at: datetime


class StageMove(BaseModel):
    """Move a candidate forward to screen, interview or offer."""

    stage: Stage

    @field_validator("stage")
    @classmethod
    def not_a_final_stage(cls, stage: Stage) -> Stage:
        if stage in FINAL_STAGES:
            raise ValueError("Use the decision endpoint to hire or reject a candidate")
        return stage


class DecisionRequest(BaseModel):
    """The hiring decision. The value must be "hired" or "rejected"."""

    decision: Stage

    @field_validator("decision")
    @classmethod
    def must_be_a_final_stage(cls, decision: Stage) -> Stage:
        if decision not in FINAL_STAGES:
            raise ValueError('decision must be "hired" or "rejected"')
        return decision


class ApplicationAssessment(BaseModel):
    match_score: int | None = Field(default=None, ge=0, le=100)
    manager_notes: str | None = Field(default=None, max_length=5000)


class StageHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_stage: Stage | None
    to_stage: Stage
    changed_by_id: uuid.UUID | None
    changed_at: datetime
