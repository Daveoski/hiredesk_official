# Part 8: Interviews (copyable)

An interview happens in two steps:
1. **Assign:** the hiring manager picks the interviewer, with no time yet.
2. **Schedule:** the interviewer picks the time, length and format (video link or in person).

The database itself prevents an interviewer from having two overlapping interviews (the **exclusion constraint**, created in migration 0002; see Part 11).

```text
assigned ──(interviewer schedules)──► scheduled ──(scorecard submitted)──► completed
    └──────────────(hiring manager cancels)──────────┴──────────────────► cancelled
```

## `backend/app/interviews/schemas.py`

```python
# ── interviews/schemas.py ──

import uuid
from datetime import datetime, timezone

# AwareDatetime = a datetime that MUST include a time zone (e.g. "2026-10-12T10:00:00Z").
# computed_field = a field calculated from other fields, included in the JSON output.
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.interviews.models import InterviewStatus, MeetingType


# BODY of POST /interviews (assign): which candidate, which interviewer.
class InterviewCreate(BaseModel):
    application_id: uuid.UUID
    interviewer_id: uuid.UUID


# BODY of PATCH /interviews/{id}/schedule.
class InterviewSchedule(BaseModel):
    # Must include a time zone, so "10:00" can't be misread as another zone.
    starts_at: AwareDatetime
    duration_minutes: int = Field(ge=15, le=240)          # 15 minutes to 4 hours
    meeting_type: MeetingType                             # "virtual" or "in_person"
    meeting_url: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=500)

    # No interviews in the past.
    @field_validator("starts_at")
    @classmethod
    def must_be_in_the_future(cls, starts_at: datetime) -> datetime:
        if starts_at <= datetime.now(timezone.utc):
            raise ValueError("starts_at must be in the future")
        return starts_at

    # Rules involving TWO fields go in a model validator.
    @model_validator(mode="after")
    def meeting_details_match_type(self):
        # A video interview needs a link...
        if self.meeting_type == MeetingType.virtual and not self.meeting_url:
            raise ValueError("A meeting link is required for a virtual interview")
        # ...an in-person interview needs a place.
        if self.meeting_type == MeetingType.in_person and not self.location:
            raise ValueError("A location is required for an in-person interview")
        return self


# What the API returns for an interview.
class InterviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    interviewer_id: uuid.UUID
    starts_at: datetime | None
    ends_at: datetime | None
    status: InterviewStatus
    meeting_type: MeetingType | None
    meeting_url: str | None
    location: str | None

    # The database stores start and end; the duration is CALCULATED, so it can never disagree with them.
    # @computed_field + @property = a read-only field that appears in the JSON as "duration_minutes".
    @computed_field
    @property
    def duration_minutes(self) -> int | None:
        if self.starts_at is None or self.ends_at is None:
            return None                           # not scheduled yet
        # end - start = a timedelta; total_seconds() // 60 = whole minutes (// = whole-number division).
        return int((self.ends_at - self.starts_at).total_seconds() // 60)
```

## `backend/app/interviews/router.py`

```python
# ── interviews/router.py: assign, schedule, list, read, cancel. ──

import uuid
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException
# The specific PostgreSQL error raised when the no-overlap (exclusion) constraint is broken.
from psycopg.errors import ExclusionViolation
# SQLAlchemy wraps database rule violations in IntegrityError; the original is in error.orig.
from sqlalchemy.exc import IntegrityError
from sqlmodel import col

from app.auth.dependencies import CurrentUser, HiringManagerUser, InterviewerUser
from app.auth.permissions import get_visible_application, get_visible_interview, visible_interviews
from app.candidates.models import Application
from app.core.email import send_email
from app.core.notifications import label, notify_company_admins
from app.db.session import DbSession
from app.interviews.models import Interview, InterviewStatus
from app.interviews.schemas import InterviewCreate, InterviewRead, InterviewSchedule
from app.jobs.models import Job, Stage
from app.scorecards.models import Scorecard
from app.users.models import Role, User

router = APIRouter(prefix="/interviews", tags=["Interviews"])


# ── POST /interviews: the hiring manager ASSIGNS an interviewer. ──
# (The function is named "schedule_interview" for history, but it only assigns; no time yet.)
@router.post("", response_model=InterviewRead, status_code=201)
def schedule_interview(
    body: InterviewCreate,
    manager: HiringManagerUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    # Can this manager see the candidate? (Their own job's candidate.) 404 otherwise.
    application, job = get_visible_application(db, manager, body.application_id)
    # No interviews for a candidate who's already hired or rejected.
    if application.stage in (Stage.hired, Stage.rejected):
        raise HTTPException(409, "This candidate's hiring process is already finished")

    # The chosen interviewer must exist, be in the SAME company, and have the interviewer role.
    # (Otherwise a manager could assign someone from another company, or a non-interviewer.)
    interviewer = db.get(User, body.interviewer_id)
    if interviewer is None or interviewer.company_id != manager.company_id or interviewer.role != Role.interviewer:
        raise HTTPException(422, "interviewer_id must be an interviewer of your company")

    # A new interview with no time: status "assigned".
    interview = Interview(
        application_id=application.id,
        interviewer_id=interviewer.id,
        status=InterviewStatus.assigned,
    )
    try:
        db.add(interview)
        db.flush()  # the database rejects an overlapping interview right here
        # (In practice an "assigned" interview has no time, so it can't overlap. The constraint
        #  only applies to SCHEDULED rows. This catch is a safety net.)
        # Create the empty, pending scorecard at the same time: one per interview.
        db.add(Scorecard(interview_id=interview.id))  # the interviewer receives an empty scorecard
        db.commit()
    except IntegrityError as error:
        db.rollback()
        # isinstance = "is this error of that type?" Turn the overlap error into a friendly 409.
        if isinstance(error.orig, ExclusionViolation):
            raise HTTPException(409, "This interviewer already has an interview at that time") from error
        # Any other database error: re-raise unchanged (it becomes a 500 and is logged).
        raise

    # Tell the interviewer they have something to schedule.
    background_tasks.add_task(
        send_email,
        to=interviewer.email,
        subject=f"Interview assigned: {application.full_name} for {job.title}",
        text=(
            f"Hi {interviewer.full_name},\n\n"
            f"You have been assigned an interview with {application.full_name} for {job.title}.\n"
            "Please sign in to choose a date and meeting format.\n"
        ),
    )
    # Tell the admins.
    notify_company_admins(
        db,
        background_tasks,
        job.company_id,
        subject=f"Interviewer assigned: {application.full_name} for {job.title}",
        text=(
            f"{manager.full_name} asked {interviewer.full_name} to interview "
            f"{application.full_name} for {job.title}.\n"
            "The interviewer will now choose the date and meeting format.\n"
        ),
    )
    return interview


# ── PATCH /interviews/{interview_id}/schedule: the INTERVIEWER picks the time and format. ──
@router.patch("/{interview_id}/schedule", response_model=InterviewRead)
def schedule_assigned_interview(
    interview_id: uuid.UUID,
    body: InterviewSchedule,         # future time, 15-240 minutes, link or location (checked)
    interviewer: InterviewerUser,    # interviewers only
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    # visible_interviews for an interviewer = ONLY their own interviews, so they can't
    # schedule someone else's (they get a 404).
    interview = get_visible_interview(db, interviewer, interview_id)
    # Only once: you can't reschedule a scheduled/completed/cancelled interview this way.
    if interview.status != InterviewStatus.assigned:
        raise HTTPException(409, "Only an assigned interview can be scheduled")

    interview.starts_at = body.starts_at
    # end = start + duration. timedelta(minutes=45) is "45 minutes".
    interview.ends_at = body.starts_at + timedelta(minutes=body.duration_minutes)
    interview.meeting_type = body.meeting_type
    interview.meeting_url = body.meeting_url
    interview.location = body.location
    interview.status = InterviewStatus.scheduled
    try:
        db.add(interview)
        # On commit, PostgreSQL checks the no-overlap rule for this interviewer.
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if isinstance(error.orig, ExclusionViolation):
            # They already have a scheduled interview overlapping this time.
            raise HTTPException(409, "You already have an interview at that time") from error
        raise

    # Email the CANDIDATE the time and the link or location.
    application = db.get(Application, interview.application_id)
    job = db.get(Job, application.job_id)
    meeting_details = body.meeting_url if body.meeting_type.value == "virtual" else body.location
    background_tasks.add_task(
        send_email,
        to=application.email,
        subject=f"Interview scheduled: {job.title}",
        text=(
            f"Hi {application.full_name},\n\n"
            # isoformat() = "2026-10-12T10:00:00+00:00"
            f"Your interview for {job.title} is scheduled for {body.starts_at.isoformat()}.\n"
            # A conditional expression inside an f-string: "Join here: <link>" or "Location: <place>".
            f"{'Join here' if body.meeting_type.value == 'virtual' else 'Location'}: {meeting_details}\n"
        ),
    )
    notify_company_admins(
        db,
        background_tasks,
        job.company_id,
        subject=f"Interview scheduled: {application.full_name} for {job.title}",
        text=(
            f"{interviewer.full_name} scheduled the interview with {application.full_name} for {job.title}.\n"
            f"When: {body.starts_at.isoformat()} ({body.duration_minutes} minutes)\n"
            f"Format: {label(body.meeting_type.value)}\n"
        ),
    )
    return interview


# ── GET /interviews: list the interviews the caller may see. Optional ?application_id=... ──
@router.get("", response_model=list[InterviewRead])
def list_interviews(user: CurrentUser, db: DbSession, application_id: uuid.UUID | None = None):
    """Managers see their jobs' interviews. Interviewers see only their own."""
    query = visible_interviews(user)
    if application_id is not None:
        query = query.where(Interview.application_id == application_id)
    # Sorted by start time.
    return db.exec(query.order_by(col(Interview.starts_at))).all()


# ── GET /interviews/{interview_id} ──
@router.get("/{interview_id}", response_model=InterviewRead)
def read_interview(interview_id: uuid.UUID, user: CurrentUser, db: DbSession):
    return get_visible_interview(db, user, interview_id)


# ── POST /interviews/{interview_id}/cancel: the hiring manager cancels. ──
@router.post("/{interview_id}/cancel", response_model=InterviewRead)
def cancel_interview(
    interview_id: uuid.UUID,
    manager: HiringManagerUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """Cancelling frees the interviewer's time slot."""
    interview = get_visible_interview(db, manager, interview_id)
    # Only interviews that haven't finished. A completed interview (scorecard in) stays completed.
    if interview.status not in (InterviewStatus.assigned, InterviewStatus.scheduled):
        raise HTTPException(409, f"A {interview.status.value} interview cannot be cancelled")
    # "cancelled" rows are ignored by the no-overlap rule, so the time slot is free again.
    interview.status = InterviewStatus.cancelled
    db.add(interview)
    db.commit()

    # Load names for the admin email.
    application = db.get(Application, interview.application_id)
    job = db.get(Job, application.job_id)
    interviewer = db.get(User, interview.interviewer_id)
    notify_company_admins(
        db,
        background_tasks,
        job.company_id,
        subject=f"Interview cancelled: {application.full_name} for {job.title}",
        text=f"{manager.full_name} cancelled {interviewer.full_name}'s interview with {application.full_name}.\n",
    )
    return interview
```

**Who can do what with interviews:**

| Action | Who | Checked by |
|---|---|---|
| Assign | Hiring manager of that job | `HiringManagerUser` + `get_visible_application` |
| Schedule | That interviewer only | `InterviewerUser` + `get_visible_interview` |
| Cancel | Hiring manager of that job | `HiringManagerUser` + `get_visible_interview` |
| No overlaps | Everyone | PostgreSQL exclusion constraint → `ExclusionViolation` → 409 |
