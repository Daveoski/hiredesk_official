import uuid

from fastapi import APIRouter

from app.ai import service
from app.ai.schemas import ApplicationAI, JobDraft, JobDraftRequest
from app.auth.dependencies import HiringManagerUser, ManagerUser
from app.auth.permissions import get_visible_application
from app.candidates.models import Application
from app.companies.models import Company
from app.db.session import DbSession

router = APIRouter(tags=["AI assistant"])


def ai_read(application: Application) -> ApplicationAI:
    return ApplicationAI(
        enabled=service.is_enabled(),
        screening=application.ai_screening,
        final_review=application.ai_final_review,
    )


@router.post("/ai/job-draft", response_model=JobDraft)
def draft_job(body: JobDraftRequest, manager: HiringManagerUser, db: DbSession):
    """Draft a job description, required qualifications and eligibility criteria from a title and notes."""
    company = db.get(Company, manager.company_id)
    return service.draft_job(body.title.strip(), body.notes.strip(), company.name)


@router.get("/applications/{application_id}/ai", response_model=ApplicationAI)
def read_application_ai(application_id: uuid.UUID, manager: ManagerUser, db: DbSession):
    """The stored AI screening and final review. Interviewers cannot see these."""
    application, _ = get_visible_application(db, manager, application_id)
    return ai_read(application)


@router.post("/applications/{application_id}/ai/screening", response_model=ApplicationAI)
def screen_application(application_id: uuid.UUID, manager: HiringManagerUser, db: DbSession):
    """Run (or re-run) the AI screening of the CV, documents and typed answers."""
    application, job = get_visible_application(db, manager, application_id)
    service.screen_application(db, application, job)
    return ai_read(application)


@router.post("/applications/{application_id}/ai/final-review", response_model=ApplicationAI)
def review_application(application_id: uuid.UUID, manager: HiringManagerUser, db: DbSession):
    """Compare the interview scorecards with the hiring manager's assessment and recommend hire or not."""
    application, job = get_visible_application(db, manager, application_id)
    service.final_review(db, application, job)
    return ai_read(application)
