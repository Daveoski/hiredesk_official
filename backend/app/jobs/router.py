import uuid

from fastapi import APIRouter, HTTPException
from sqlmodel import col

from app.auth.dependencies import HiringManagerUser, ManagerUser
from app.auth.permissions import get_visible_job, visible_jobs
from app.db.session import DbSession
from app.jobs.models import Job
from app.jobs.schemas import JobCreate, JobRead, JobUpdate

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.post("", response_model=JobRead, status_code=201)
def create_job(body: JobCreate, manager: HiringManagerUser, db: DbSession):
    """New jobs start as drafts and belong to the creating hiring manager."""
    job = Job(company_id=manager.company_id, hiring_manager_id=manager.id, **body.model_dump())
    db.add(job)
    db.commit()
    return job


@router.get("", response_model=list[JobRead])
def list_jobs(manager: ManagerUser, db: DbSession):
    return db.exec(visible_jobs(manager).order_by(col(Job.created_at).desc())).all()


@router.get("/{job_id}", response_model=JobRead)
def read_job(job_id: uuid.UUID, manager: ManagerUser, db: DbSession):
    return get_visible_job(db, manager, job_id)


@router.patch("/{job_id}", response_model=JobRead)
def update_job(job_id: uuid.UUID, body: JobUpdate, manager: HiringManagerUser, db: DbSession):
    job = get_visible_job(db, manager, job_id)
    changes = body.model_dump(exclude_unset=True)
    salary_min = changes.get("salary_min", job.salary_min)
    salary_max = changes.get("salary_max", job.salary_max)
    if salary_min is not None and salary_max is not None and salary_min > salary_max:
        raise HTTPException(422, "salary_min cannot exceed salary_max")
    for field, value in changes.items():
        setattr(job, field, value)
    db.add(job)
    db.commit()
    return job
