import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, EmailStr
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.candidates.models import Application, StageHistory
from app.candidates.schemas import ApplicationReceipt
from app.companies.models import Company
from app.core.email import send_email
from app.core.storage import upload_cv, upload_supporting_document
from app.db.session import DbSession
from app.jobs.models import Job, JobStatus, Stage

# No login is needed here: candidates apply without an account.
router = APIRouter(prefix="/public/jobs", tags=["Public applications"])


class PublicJobRead(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    company_name: str
    qualification_requirements: str
    salary_min: int | None
    salary_max: int | None


def get_open_job(db: Session, job_id: uuid.UUID) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.status != JobStatus.open:
        raise HTTPException(404, "This job is not accepting applications")
    return job


@router.get("/{job_id}", response_model=PublicJobRead)
def read_public_job(job_id: uuid.UUID, db: DbSession):
    """The public job page: only jobs with status "open" are visible."""
    job = get_open_job(db, job_id)
    company = db.get(Company, job.company_id)
    return PublicJobRead(
        id=job.id,
        title=job.title,
        description=job.description,
        company_name=company.name,
        qualification_requirements=job.qualification_requirements,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
    )


@router.post("/{job_id}/applications", response_model=ApplicationReceipt, status_code=201)
def apply_to_job(
    job_id: uuid.UUID,
    full_name: Annotated[str, Form(min_length=1, max_length=100)],
    email: Annotated[EmailStr, Form()],
    phone: Annotated[str, Form(min_length=5, max_length=30)],
    cv: UploadFile,
    db: DbSession,
    background_tasks: BackgroundTasks,
    cover_letter: Annotated[str | None, Form(max_length=5000)] = None,
    candidate_qualifications: Annotated[str, Form(max_length=5000)] = "",
    expected_salary: Annotated[int | None, Form(ge=0)] = None,
    supporting_documents: list[UploadFile] = File(default=[]),
):
    """Apply with a multipart form: full_name, email, phone, cv (file) and an optional cover_letter."""
    job = get_open_job(db, job_id)
    email = email.lower()

    if len(supporting_documents) > 6:
        raise HTTPException(422, "You can upload up to 6 supporting documents")

    already_applied = db.exec(
        select(Application.id).where(Application.job_id == job.id, Application.email == email)
    ).first()
    if already_applied is not None:
        raise HTTPException(409, "You have already applied to this job")

    cv_url = upload_cv(cv)
    uploaded_documents = [upload_supporting_document(document) for document in supporting_documents]

    application = Application(
        job_id=job.id,
        full_name=full_name,
        email=email,
        phone=phone,
        cv_url=cv_url,
        candidate_qualifications=candidate_qualifications,
        expected_salary=expected_salary,
        supporting_documents=uploaded_documents,
        cover_letter=cover_letter or None,
    )
    db.add(application)
    try:
        db.flush()  # insert the application first, because the history row points to it
    except IntegrityError as error:  # two identical applications arrived at the same moment
        db.rollback()
        raise HTTPException(409, "You have already applied to this job") from error
    db.add(StageHistory(application_id=application.id, from_stage=None, to_stage=Stage.applied))
    db.commit()

    company = db.get(Company, job.company_id)
    background_tasks.add_task(
        send_email,
        to=email,
        subject=f"We received your application for {job.title}",
        text=(
            f"Hi {full_name},\n\n"
            f"{company.name} has received your application for {job.title}. "
            "They will contact you if you move forward.\n"
        ),
    )
    return ApplicationReceipt(id=application.id, created_at=application.created_at)
