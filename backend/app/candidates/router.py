import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Query
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
from app.db.session import DbSession
from app.jobs.models import Stage
from app.users.models import Role, User

router = APIRouter(prefix="/applications", tags=["Candidates"])


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


def notify_company_admins(
    db: DbSession,
    background_tasks: BackgroundTasks,
    company_id: uuid.UUID,
    subject: str,
    text: str,
) -> None:
    admins = db.exec(
        select(User).where(User.company_id == company_id, User.role == Role.company_admin)
    ).all()
    for admin in admins:
        background_tasks.add_task(send_email, to=admin.email, subject=subject, text=text)


def assessment_summary(application: Application, job_title: str) -> str:
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


@router.get("", response_model=list[ApplicationRead])
def list_applications(
    user: CurrentUser,
    db: DbSession,
    job_id: uuid.UUID | None = None,
    stage: Stage | None = None,
    sort_by: Literal["created_at", "match_score", "expected_salary", "interviewer_recommendation"] = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Admins and hiring managers see their jobs' candidates. Interviewers see only assigned ones."""
    query = visible_applications(user)
    if job_id is not None:
        query = query.where(Application.job_id == job_id)
    if stage is not None:
        query = query.where(Application.stage == stage)
    sort_columns = {
        "created_at": Application.created_at,
        "match_score": Application.match_score,
        "expected_salary": Application.expected_salary,
    }
    if sort_by == "interviewer_recommendation":
        recommendation_rank = case(
            (Application.interviewer_recommendation == "recommend", 2),
            (Application.interviewer_recommendation == "maybe", 1),
            (Application.interviewer_recommendation == "not_recommend", 0),
            else_=-1,
        )
        order = recommendation_rank.asc() if sort_order == "asc" else recommendation_rank.desc()
    else:
        column = col(sort_columns[sort_by])
        order = column.asc().nullslast() if sort_order == "asc" else column.desc().nullslast()
    rows = db.exec(query.order_by(order).offset(offset).limit(limit)).all()
    return [ApplicationRead.from_rows(application, job) for application, job in rows]


@router.get("/{application_id}", response_model=ApplicationRead)
def read_application(application_id: uuid.UUID, user: CurrentUser, db: DbSession):
    application, job = get_visible_application(db, user, application_id)
    return ApplicationRead.from_rows(application, job)


@router.patch("/{application_id}/stage", response_model=ApplicationRead)
def move_application(
    application_id: uuid.UUID,
    body: StageMove,
    manager: HiringManagerUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """Move a candidate forward: applied -> screen -> interview -> offer."""
    _, job = get_visible_application(db, manager, application_id)
    application = change_stage(db, application_id, body.stage, manager)
    notify_candidate(background_tasks, application, job.title, body.stage)
    return ApplicationRead.from_rows(application, job)


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
    db.refresh(application)
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


@router.post("/{application_id}/decision", response_model=ApplicationRead)
def decide_application(
    application_id: uuid.UUID,
    body: DecisionRequest,
    manager: HiringManagerUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """The final decision. A candidate can only be hired from the offer stage."""
    application, job = get_visible_application(db, manager, application_id)
    application = change_stage(db, application_id, body.decision, manager)
    if body.decision == Stage.hired:
        notify_company_admins(
            db,
            background_tasks,
            job.company_id,
            subject=f"Successful applicant hired: {application.full_name} for {job.title}",
            text=(
                "A successful applicant has been hired.\n\n"
                f"{assessment_summary(application, job.title)}"
            ),
        )
    notify_candidate(background_tasks, application, job.title, body.decision)
    return ApplicationRead.from_rows(application, job)


@router.get("/{application_id}/history", response_model=list[StageHistoryRead])
def read_stage_history(application_id: uuid.UUID, manager: ManagerUser, db: DbSession):
    get_visible_application(db, manager, application_id)  # 404 if the manager cannot see it
    return db.exec(
        select(StageHistory)
        .where(StageHistory.application_id == application_id)
        .order_by(col(StageHistory.changed_at))
    ).all()
