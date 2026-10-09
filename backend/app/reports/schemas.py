import uuid
from datetime import datetime

from pydantic import BaseModel

from app.interviews.models import InterviewStatus
from app.jobs.models import JobStatus, Stage
from app.scorecards.models import Recommendation
from app.users.models import Role


class ReportTotals(BaseModel):
    open_jobs: int
    active_candidates: int  # not hired and not rejected
    new_applications: int  # in the report period
    hired: int  # in the report period
    rejected: int  # in the report period
    interviews_to_schedule: int
    upcoming_interviews: int
    scorecards_due: int  # the interview time has passed but the scorecard is not submitted


class JobProgress(BaseModel):
    id: uuid.UUID
    title: str
    status: JobStatus
    hiring_manager_name: str | None
    applicants: int
    pipeline: dict[Stage, int]


class TeamMemberProgress(BaseModel):
    id: uuid.UUID
    full_name: str
    role: Role
    open_jobs: int  # hiring managers
    active_candidates: int  # hiring managers
    interviews_to_schedule: int  # interviewers
    upcoming_interviews: int  # interviewers
    scorecards_due: int  # interviewers
    scorecards_submitted: int  # interviewers, in the report period


class StageActivity(BaseModel):
    application_id: uuid.UUID
    candidate_name: str
    job_title: str
    from_stage: Stage | None
    to_stage: Stage
    changed_by_name: str | None  # empty when the candidate applied
    changed_at: datetime


class HiringResult(BaseModel):
    application_id: uuid.UUID
    candidate_name: str
    job_title: str
    outcome: Stage  # hired or rejected
    decided_by_name: str | None
    decided_at: datetime
    match_score: int | None
    interviewer_recommendation: str | None


class ScorecardResult(BaseModel):
    application_id: uuid.UUID
    candidate_name: str
    job_title: str
    interviewer_name: str
    recommendation: Recommendation | None
    average_score: float | None
    submitted_at: datetime


class ProgressReport(BaseModel):
    company_name: str
    generated_at: datetime
    period_days: int
    period_start: datetime
    totals: ReportTotals
    pipeline: dict[Stage, int]
    interviews_by_status: dict[InterviewStatus, int]
    jobs: list[JobProgress]
    team: list[TeamMemberProgress]
    recent_activity: list[StageActivity]
    results: list[HiringResult]
    scorecards: list[ScorecardResult]


class ReportEmailed(BaseModel):
    sent_to: list[str]
