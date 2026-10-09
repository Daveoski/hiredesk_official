import uuid
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException
from psycopg.errors import ExclusionViolation
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select

from app.auth.dependencies import CurrentUser, HiringManagerUser, InterviewerUser
from app.auth.permissions import get_visible_application, get_visible_interview, visible_interviews
from app.candidates.models import Application
from app.core.email import send_email
from app.core.config import get_settings
from app.db.session import DbSession
from app.interviews.models import Interview, InterviewStatus
from app.interviews.schemas import InterviewCreate, InterviewRead, InterviewSchedule
from app.jobs.models import Job, Stage
from app.scorecards.models import Scorecard
from app.users.models import Role, User

router = APIRouter(prefix="/interviews", tags=["Interviews"])


@router.post("", response_model=InterviewRead, status_code=201)
def schedule_interview(
    body: InterviewCreate,
    manager: HiringManagerUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    application, job = get_visible_application(db, manager, body.application_id)
    if application.stage in (Stage.hired, Stage.rejected):
        raise HTTPException(409, "This candidate's hiring process is already finished")

    interviewer = db.get(User, body.interviewer_id)
    if interviewer is None or interviewer.company_id != manager.company_id or interviewer.role != Role.interviewer:
        raise HTTPException(422, "interviewer_id must be an interviewer of your company")

    interview = Interview(
        application_id=application.id,
        interviewer_id=interviewer.id,
        status=InterviewStatus.assigned,
    )
    try:
        db.add(interview)
        db.flush()  # the database rejects an overlapping interview right here
        db.add(Scorecard(interview_id=interview.id))  # the interviewer receives an empty scorecard
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if isinstance(error.orig, ExclusionViolation):
            raise HTTPException(409, "This interviewer already has an interview at that time") from error
        raise

    background_tasks.add_task(
        send_email,
        to=interviewer.email,
        subject=f"Interview assigned: {application.full_name} for {job.title}",
        text=(
            f"Hi {interviewer.full_name},\n\n"
            f"You have been assigned an interview with {application.full_name} for {job.title}.\n"
            "Please sign in to choose a date and meeting format.\n\n"
            f"Open HireDesk: {get_settings().frontend_base_url}/interviews\n"
        ),
    )
    return interview


@router.patch("/{interview_id}/schedule", response_model=InterviewRead)
def schedule_assigned_interview(
    interview_id: uuid.UUID,
    body: InterviewSchedule,
    interviewer: InterviewerUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    interview = get_visible_interview(db, interviewer, interview_id)
    if interview.status != InterviewStatus.assigned:
        raise HTTPException(409, "Only an assigned interview can be scheduled")

    interview.starts_at = body.starts_at
    interview.ends_at = body.starts_at + timedelta(minutes=body.duration_minutes)
    interview.meeting_type = body.meeting_type
    interview.meeting_url = body.meeting_url
    interview.location = body.location
    interview.status = InterviewStatus.scheduled
    try:
        db.add(interview)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if isinstance(error.orig, ExclusionViolation):
            raise HTTPException(409, "You already have an interview at that time") from error
        raise

    application = db.get(Application, interview.application_id)
    job = db.get(Job, application.job_id)
    meeting_details = body.meeting_url if body.meeting_type.value == "virtual" else body.location
    interview_link = f"{get_settings().frontend_base_url}/interviews/{interview.id}"
    candidate_message = (
        f"Hi {application.full_name},\n\n"
        f"Your interview for {job.title} is scheduled for {body.starts_at.isoformat()}.\n"
        f"{'Join here' if body.meeting_type.value == 'virtual' else 'Location'}: {meeting_details}\n\n"
        f"Interview details: {interview_link}\n"
    )
    background_tasks.add_task(
        send_email,
        to=application.email,
        subject=f"Interview scheduled: {job.title}",
        text=candidate_message,
    )

    recipients: set[str] = {interviewer.email}
    if job.hiring_manager_id:
        manager = db.get(User, job.hiring_manager_id)
        if manager:
            recipients.add(manager.email)
    admins = db.exec(
        select(User).where(User.company_id == interviewer.company_id, User.role == Role.company_admin)
    ).all()
    recipients.update(admin.email for admin in admins)
    internal_message = (
        f"Interview scheduled for {application.full_name} ({application.email}) for {job.title}.\n"
        f"Time: {body.starts_at.isoformat()}\n"
        f"{'Meeting link' if body.meeting_type.value == 'virtual' else 'Location'}: {meeting_details}\n"
        f"Open interview: {interview_link}\n"
    )
    for recipient in recipients:
        background_tasks.add_task(
            send_email,
            to=recipient,
            subject=f"Interview scheduled: {application.full_name} — {job.title}",
            text=internal_message,
        )
    return interview


@router.get("", response_model=list[InterviewRead])
def list_interviews(user: CurrentUser, db: DbSession, application_id: uuid.UUID | None = None):
    """Managers see their jobs' interviews. Interviewers see only their own."""
    query = visible_interviews(user)
    if application_id is not None:
        query = query.where(Interview.application_id == application_id)
    return db.exec(query.order_by(col(Interview.starts_at))).all()


@router.get("/{interview_id}", response_model=InterviewRead)
def read_interview(interview_id: uuid.UUID, user: CurrentUser, db: DbSession):
    return get_visible_interview(db, user, interview_id)


@router.post("/{interview_id}/cancel", response_model=InterviewRead)
def cancel_interview(interview_id: uuid.UUID, manager: HiringManagerUser, db: DbSession):
    """Cancelling frees the interviewer's time slot."""
    interview = get_visible_interview(db, manager, interview_id)
    if interview.status not in (InterviewStatus.assigned, InterviewStatus.scheduled):
        raise HTTPException(409, f"A {interview.status.value} interview cannot be cancelled")
    interview.status = InterviewStatus.cancelled
    db.add(interview)
    db.commit()
    return interview
