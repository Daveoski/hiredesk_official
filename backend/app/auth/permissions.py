"""Who can see what. Every router uses these functions, so the rules live in one place.

- Company admin:  everything in their company.
- Hiring manager: only the jobs where they are the hiring manager, and those jobs'
                  applications and interviews.
- Interviewer:    only applications and interviews they are assigned to (and not cancelled).

Anything outside a user's scope is answered with 404, so its existence is not revealed.
"""
import uuid

from fastapi import HTTPException
from sqlalchemy import false
from sqlmodel import Session, select

from app.candidates.models import Application
from app.interviews.models import Interview, InterviewStatus
from app.jobs.models import Job
from app.users.models import Role, User


def _limit_to_visible_jobs(query, user: User):
    """Company admins see all company jobs, hiring managers only the jobs they manage."""
    query = query.where(Job.company_id == user.company_id)
    if user.role == Role.hiring_manager:
        query = query.where(Job.hiring_manager_id == user.id)
    return query


def visible_jobs(user: User):
    return _limit_to_visible_jobs(select(Job), user)


def get_visible_job(db: Session, user: User, job_id: uuid.UUID) -> Job:
    job = db.exec(visible_jobs(user).where(Job.id == job_id)).first()
    if job is None:
        raise HTTPException(404, "Job not found")
    return job


def visible_applications(user: User):
    """A query returning (Application, Job) rows that this user may see."""
    query = select(Application, Job).join(Job, Job.id == Application.job_id)
    query = _limit_to_visible_jobs(query, user)
    if user.role == Role.company_admin:
        query = query.where(false())
    elif user.role == Role.interviewer:
        assigned_application_ids = select(Interview.application_id).where(
            Interview.interviewer_id == user.id,
            Interview.status != InterviewStatus.cancelled,
        )
        query = query.where(Application.id.in_(assigned_application_ids))
    return query


def get_visible_application(db: Session, user: User, application_id: uuid.UUID) -> tuple[Application, Job]:
    row = db.exec(visible_applications(user).where(Application.id == application_id)).first()
    if row is None:
        raise HTTPException(404, "Application not found")
    application, job = row
    return application, job


def visible_interviews(user: User):
    """A query returning the Interview rows that this user may see."""
    query = (
        select(Interview)
        .join(Application, Application.id == Interview.application_id)
        .join(Job, Job.id == Application.job_id)
    )
    query = _limit_to_visible_jobs(query, user)
    if user.role == Role.company_admin:
        query = query.where(false())
    elif user.role == Role.interviewer:
        query = query.where(
            Interview.interviewer_id == user.id,
            Interview.status != InterviewStatus.cancelled,
        )
    return query


def get_visible_interview(db: Session, user: User, interview_id: uuid.UUID) -> Interview:
    interview = db.exec(visible_interviews(user).where(Interview.id == interview_id)).first()
    if interview is None:
        raise HTTPException(404, "Interview not found")
    return interview
