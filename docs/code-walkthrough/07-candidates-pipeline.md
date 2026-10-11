# Part 7: The candidate pipeline (copyable)

- `candidates/schemas.py`: what a candidate looks like over the wire, and the rules for stage moves and decisions.
- `candidates/service.py`: **the** stage-change function, with the allowed-moves table and the row lock that keeps history consistent.
- `candidates/router.py`: list, read, move, assess, decide and history.

```text
applied ──► screen ──► interview ──► offer ──► hired
   └──────────┴───────────┴───────────┴──────► rejected  (from any open stage)
```

## `backend/app/candidates/schemas.py`

```python
# ── candidates/schemas.py ──

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.candidates.models import Application
from app.jobs.models import Job, Stage
from app.scorecards.models import Recommendation

# The two stages you can't leave. A tuple (...) is a fixed, read-only list.
FINAL_STAGES = (Stage.hired, Stage.rejected)


# What the API returns for a candidate: the application PLUS a few details of its job,
# so the frontend doesn't need a second request to show "Applied for Designer".
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

    # A "named constructor": build an ApplicationRead from an Application row + its Job row.
    # @classmethod = called on the class: ApplicationRead.from_rows(app, job).
    @classmethod
    def from_rows(cls, application: Application, job: Job) -> "ApplicationRead":
        return cls(
            # model_dump() = all the application's fields as a dict; ** spreads them as arguments.
            **application.model_dump(),
            # ...plus the job fields the frontend needs.
            job_title=job.title,
            job_qualification_requirements=job.qualification_requirements,
            job_salary_min=job.salary_min,
            job_salary_max=job.salary_max,
        )


class ApplicationReceipt(BaseModel):
    """What a candidate gets back after applying."""

    id: uuid.UUID
    created_at: datetime


# BODY of PATCH /applications/{id}/stage.
class StageMove(BaseModel):
    """Move a candidate forward to screen, interview or offer."""

    stage: Stage

    # Hired/rejected must go through the decision endpoint (it has different emails and checks).
    @field_validator("stage")
    @classmethod
    def not_a_final_stage(cls, stage: Stage) -> Stage:
        if stage in FINAL_STAGES:
            raise ValueError("Use the decision endpoint to hire or reject a candidate")
        return stage


# BODY of POST /applications/{id}/decision.
class DecisionRequest(BaseModel):
    """The hiring decision. The value must be "hired" or "rejected"."""

    decision: Stage

    # The opposite check: only final stages are allowed here.
    @field_validator("decision")
    @classmethod
    def must_be_a_final_stage(cls, decision: Stage) -> Stage:
        if decision not in FINAL_STAGES:
            raise ValueError('decision must be "hired" or "rejected"')
        return decision


# BODY of PATCH /applications/{id}/assessment. Both optional (send null to clear).
class ApplicationAssessment(BaseModel):
    match_score: int | None = Field(default=None, ge=0, le=100)    # 0 to 100
    manager_notes: str | None = Field(default=None, max_length=5000)


# One stage-history row, as returned by GET /applications/{id}/history.
class StageHistoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_stage: Stage | None
    to_stage: Stage
    changed_by_id: uuid.UUID | None
    changed_at: datetime
```

## `backend/app/candidates/service.py`

```python
# ── service.py: the ONE place that changes a candidate's stage. ──
# Both "move" and "decide" call change_stage, so the rules can't drift apart.

import uuid

from fastapi import HTTPException
from sqlmodel import Session, select

from app.candidates.models import Application, StageHistory
from app.jobs.models import Stage
from app.users.models import User

# The pipeline rules: a candidate moves one step forward, or is rejected from any open stage.
# A dict of {current stage: set of stages you may go to next}. This is a STATE MACHINE.
ALLOWED_TRANSITIONS: dict[Stage, set[Stage]] = {
    Stage.applied: {Stage.screen, Stage.rejected},
    Stage.screen: {Stage.interview, Stage.rejected},
    Stage.interview: {Stage.offer, Stage.rejected},
    Stage.offer: {Stage.hired, Stage.rejected},     # hiring only from offer
    Stage.hired: set(),                             # set() = empty: no way out
    Stage.rejected: set(),
}


def change_stage(db: Session, application_id: uuid.UUID, new_stage: Stage, user: User) -> Application:
    """Move an application to a new stage and record it in the stage history.

    The application row is locked (SELECT ... FOR UPDATE) until commit. If two requests
    change the same candidate at the same time, the second one waits, then sees the
    stage the first one set and is checked against it. So the history never contains
    two rows that claim the same "from" stage.
    """
    # populate_existing makes sure we read the stage as it is now, not an older copy
    # that this session loaded before the lock was taken.
    application = db.exec(
        select(Application)
        .where(Application.id == application_id)
        # SELECT ... FOR UPDATE: lock this row. Any other transaction that wants to lock it
        # WAITS here until we commit or roll back.
        .with_for_update()
        # The caller already loaded this application (to check permissions) BEFORE the lock.
        # Without this, SQLAlchemy would reuse that possibly stale copy instead of the fresh row.
        .execution_options(populate_existing=True)
    ).one()     # .one() = exactly one row expected (it exists: the caller already checked)

    # Is this move allowed from where the candidate is NOW?
    if new_stage not in ALLOWED_TRANSITIONS[application.stage]:
        # 409 Conflict: e.g. "A candidate in 'applied' cannot be moved to 'offer'" (skipping),
        # or any move out of hired/rejected.
        raise HTTPException(
            409,
            f"A candidate in '{application.stage.value}' cannot be moved to '{new_stage.value}'",
        )

    # Record the move in the audit trail: from, to, who (changed_at defaults to now).
    db.add(
        StageHistory(
            application_id=application.id,
            from_stage=application.stage,
            to_stage=new_stage,
            changed_by_id=user.id,
        )
    )
    # Change the stage itself.
    application.stage = new_stage
    db.add(application)
    # Save history + new stage together. Committing also RELEASES the lock,
    # letting a waiting request continue (and be checked against the new stage).
    db.commit()
    return application
```

### Why the lock matters
```text
Without a lock:                         With FOR UPDATE:
A reads stage=screen                    A locks row, reads screen
B reads stage=screen                    B tries to lock → WAITS
A writes screen→interview               A writes screen→interview, commits (unlock)
B writes screen→interview  (duplicate!) B reads interview; interview→interview not allowed → 409
```

## `backend/app/candidates/router.py`

```python
# ── candidates/router.py: the hiring manager's pipeline actions. ──

import uuid
# Literal = only these exact strings are allowed (FastAPI returns 422 otherwise).
from typing import Literal

# Query = rules for query-string parameters (?limit=50).
from fastapi import APIRouter, BackgroundTasks, Query
# case() = SQL CASE WHEN ... THEN ... (used to rank recommendations for sorting).
from sqlalchemy import case
from sqlmodel import col, select

from app.auth.dependencies import CurrentUser, HiringManagerUser, ManagerUser
from app.auth.permissions import get_visible_application, visible_applications
from app.candidates.models import Application, StageHistory
from app.candidates.schemas import (
    ApplicationRead,
    ApplicationAssessment,
    DecisionRequest,
    StageHistoryRead,
    StageMove,
)
from app.candidates.service import change_stage
from app.core.email import send_email
from app.core.notifications import label, notify_company_admins
from app.db.session import DbSession
from app.jobs.models import Stage

router = APIRouter(prefix="/applications", tags=["Candidates"])


# Email the CANDIDATE that their application moved (sent after the response).
def notify_candidate(background_tasks: BackgroundTasks, application: Application, job_title: str, stage: Stage) -> None:
    background_tasks.add_task(
        send_email,
        to=application.email,
        subject=f"Update on your application for {job_title}",
        text=(
            f"Hi {application.full_name},\n\n"
            f"Your application for {job_title} has moved to: {stage.value.replace('_', ' ')}.\n"
            "The hiring team will contact you with further updates.\n"
        ),
    )


# A short text summary of a candidate, reused in several admin emails.
def assessment_summary(application: Application, job_title: str) -> str:
    # Python's one-line if/else: A if condition else B.
    match_score = f"{application.match_score}/100" if application.match_score is not None else "Not provided"
    recommendation = application.interviewer_recommendation or "Not submitted"
    notes = application.manager_notes or "No HR notes provided"
    return (
        f"Candidate: {application.full_name}\n"
        f"Position: {job_title}\n"
        f"HR qualification match score: {match_score}\n"
        f"Interviewer recommendation: {recommendation.replace('_', ' ')}\n"
        f"HR assessment notes: {notes}\n"
    )


# ── GET /applications: list candidates the caller may see, with filters, sorting, paging. ──
# Example: GET /applications?job_id=...&stage=screen&sort_by=match_score&sort_order=desc&limit=20
@router.get("", response_model=list[ApplicationRead])
def list_applications(
    user: CurrentUser,
    db: DbSession,
    job_id: uuid.UUID | None = None,          # optional filter: one job
    stage: Stage | None = None,               # optional filter: one stage
    sort_by: Literal["created_at", "match_score", "expected_salary", "interviewer_recommendation"] = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
    limit: int = Query(50, ge=1, le=200),     # page size: default 50, between 1 and 200
    offset: int = Query(0, ge=0),             # how many to skip (for page 2, 3...)
):
    """Admins and hiring managers see their jobs' candidates. Interviewers see only assigned ones."""
    # Start from the rows this user may see (Part 3). Every filter narrows THIS query.
    query = visible_applications(user)
    if job_id is not None:
        query = query.where(Application.job_id == job_id)
    if stage is not None:
        query = query.where(Application.stage == stage)
    # Map the allowed sort names to real columns. Using a fixed map (not the raw text)
    # means users can only sort by these, never inject SQL.
    sort_columns = {
        "created_at": Application.created_at,
        "match_score": Application.match_score,
        "expected_salary": Application.expected_salary,
    }
    if sort_by == "interviewer_recommendation":
        # Text can't be sorted by meaning ("recommend" > "maybe"), so turn it into numbers:
        # CASE WHEN rec='recommend' THEN 2 WHEN 'maybe' THEN 1 WHEN 'not_recommend' THEN 0 ELSE -1 END
        recommendation_rank = case(
            (Application.interviewer_recommendation == "recommend", 2),
            (Application.interviewer_recommendation == "maybe", 1),
            (Application.interviewer_recommendation == "not_recommend", 0),
            else_=-1,
        )
        order = recommendation_rank.asc() if sort_order == "asc" else recommendation_rank.desc()
    else:
        column = col(sort_columns[sort_by])
        # nullslast(): candidates WITHOUT a score/salary always go to the bottom, in either direction.
        order = column.asc().nullslast() if sort_order == "asc" else column.desc().nullslast()
    # Apply the order and paging, then run the query. Each row is a pair (application, job).
    rows = db.exec(query.order_by(order).offset(offset).limit(limit)).all()
    # Turn every pair into the response shape.
    return [ApplicationRead.from_rows(application, job) for application, job in rows]


# ── GET /applications/{application_id} ──
@router.get("/{application_id}", response_model=ApplicationRead)
def read_application(application_id: uuid.UUID, user: CurrentUser, db: DbSession):
    # 404 if not visible to this user.
    application, job = get_visible_application(db, user, application_id)
    return ApplicationRead.from_rows(application, job)


# ── PATCH /applications/{application_id}/stage: move forward (screen / interview / offer). ──
@router.patch("/{application_id}/stage", response_model=ApplicationRead)
def move_application(
    application_id: uuid.UUID,
    body: StageMove,                 # already refuses hired/rejected
    manager: HiringManagerUser,      # hiring managers only
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """Move a candidate forward: applied -> screen -> interview -> offer."""
    # Permission check (their own job's candidate?), and remember the old stage for the email.
    previous, job = get_visible_application(db, manager, application_id)
    from_stage = previous.stage
    # The locked, rule-checked move (service.py). Raises 409 for an invalid move.
    application = change_stage(db, application_id, body.stage, manager)
    # Email the candidate...
    notify_candidate(background_tasks, application, job.title, body.stage)
    # ...and every admin of the company.
    notify_company_admins(
        db,
        background_tasks,
        job.company_id,
        subject=f"Candidate moved to {label(body.stage.value)}: {application.full_name} for {job.title}",
        text=(
            f"{manager.full_name} moved {application.full_name} from {label(from_stage.value)} "
            f"to {label(body.stage.value)}.\n\n"
            f"{assessment_summary(application, job.title)}"
        ),
    )
    return ApplicationRead.from_rows(application, job)


# ── PATCH /applications/{application_id}/assessment: match score + notes. ──
@router.patch("/{application_id}/assessment", response_model=ApplicationRead)
def assess_application(
    application_id: uuid.UUID,
    body: ApplicationAssessment,
    manager: HiringManagerUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """Only hiring managers can record a qualification assessment."""
    application, job = get_visible_application(db, manager, application_id)
    application.match_score = body.match_score
    application.manager_notes = body.manager_notes
    db.add(application)
    db.commit()
    db.refresh(application)       # reload the saved values
    # Admins get the summary each time the assessment is saved.
    notify_company_admins(
        db,
        background_tasks,
        job.company_id,
        subject=f"HR assessment completed: {application.full_name} for {job.title}",
        text=(
            "A hiring manager submitted or updated the final assessment.\n\n"
            f"{assessment_summary(application, job.title)}"
        ),
    )
    return ApplicationRead.from_rows(application, job)


# ── POST /applications/{application_id}/decision: hire or reject. ──
@router.post("/{application_id}/decision", response_model=ApplicationRead)
def decide_application(
    application_id: uuid.UUID,
    body: DecisionRequest,           # must be "hired" or "rejected"
    manager: HiringManagerUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """The final decision. A candidate can only be hired from the offer stage."""
    application, job = get_visible_application(db, manager, application_id)
    # Same locked, rule-checked function. "hired" from anywhere but offer -> 409.
    application = change_stage(db, application_id, body.decision, manager)
    # Different admin email for a hire and for a rejection.
    if body.decision == Stage.hired:
        notify_company_admins(
            db,
            background_tasks,
            job.company_id,
            subject=f"Successful applicant hired: {application.full_name} for {job.title}",
            text=(
                f"A successful applicant has been hired by {manager.full_name}.\n\n"
                f"{assessment_summary(application, job.title)}"
            ),
        )
    else:
        notify_company_admins(
            db,
            background_tasks,
            job.company_id,
            subject=f"Candidate rejected: {application.full_name} for {job.title}",
            text=(
                f"{manager.full_name} rejected {application.full_name}.\n\n"
                f"{assessment_summary(application, job.title)}"
            ),
        )
    # The candidate is told either way.
    notify_candidate(background_tasks, application, job.title, body.decision)
    return ApplicationRead.from_rows(application, job)


# ── GET /applications/{application_id}/history: the audit trail. ──
# ManagerUser allows admins in by role, but permissions.py hides all applications from admins,
# so in practice only the job's hiring manager gets results.
@router.get("/{application_id}/history", response_model=list[StageHistoryRead])
def read_stage_history(application_id: uuid.UUID, manager: ManagerUser, db: DbSession):
    get_visible_application(db, manager, application_id)  # 404 if the manager cannot see it
    return db.exec(
        select(StageHistory)
        .where(StageHistory.application_id == application_id)
        .order_by(col(StageHistory.changed_at))    # oldest first: reads like a timeline
    ).all()
```
