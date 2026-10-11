# Part 6: Jobs, the public apply page and file uploads (copyable)

- `jobs/schemas.py` + `jobs/router.py`: hiring managers create, list and edit jobs.
- `candidates/public_router.py`: the **no-login** endpoints candidates use: view an open job, get an upload permission, apply.
- `core/storage.py`: saving CVs and documents on Cloudinary, including the direct-upload trick that gets around Vercel's 4.5 MB request limit.

## `backend/app/jobs/schemas.py`

```python
# ── jobs/schemas.py: what a job looks like going in (create/update) and coming out (read). ──

import uuid
from datetime import datetime

# field_validator = check one field. model_validator = check the whole object (several fields together).
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.jobs.models import JobStatus, Stage


# BODY of POST /jobs.
class JobCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    qualification_requirements: str = Field(default="", max_length=5000)
    salary_min: int | None = Field(default=None, ge=0)     # ge=0: no negative numbers
    salary_max: int | None = Field(default=None, ge=0)

    # mode="after" = run after each field passed its own checks; "self" is the finished object.
    @model_validator(mode="after")
    def valid_salary_range(self):
        # Only compare when BOTH are given.
        if self.salary_min is not None and self.salary_max is not None and self.salary_min > self.salary_max:
            # A ValueError inside a validator becomes a 422 response with this message.
            raise ValueError("salary_min cannot exceed salary_max")
        return self


# BODY of PATCH /jobs/{id}. Every field is optional: send only what you want to change.
class JobUpdate(BaseModel):
    """Only fields owned by the hiring manager are editable."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=10000)
    qualification_requirements: str | None = Field(default=None, max_length=5000)
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)
    status: JobStatus | None = None     # how a job is opened or closed
    # These four may be LEFT OUT, but may not be sent as an explicit null
    # (that would wipe a required column). Salaries CAN be null, meaning "remove the salary".
    @field_validator("title", "description", "qualification_requirements", "status")
    @classmethod
    def cannot_be_null(cls, value):
        if value is None:
            raise ValueError("cannot be null")
        return value

    @model_validator(mode="after")
    def valid_salary_range(self):
        if self.salary_min is not None and self.salary_max is not None and self.salary_min > self.salary_max:
            raise ValueError("salary_min cannot exceed salary_max")
        return self


# What the API returns for a job.
class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)   # build from a Job database object

    id: uuid.UUID
    title: str
    description: str
    qualification_requirements: str
    salary_min: int | None
    salary_max: int | None
    status: JobStatus
    hiring_manager_id: uuid.UUID | None
    created_at: datetime
    # Every job uses the same default pipeline; the Job table has no stages column.
    # list(Stage) = ["applied", "screen", ...]. Sent so the frontend could draw columns per job.
    stages: list[Stage] = list(Stage)
```

## `backend/app/jobs/router.py`

```python
# ── jobs/router.py: create, list, read and update jobs. ──

import uuid

from fastapi import APIRouter, HTTPException
# col() wraps a model attribute so SQLAlchemy methods like .desc() are available (and typed).
from sqlmodel import col

from app.auth.dependencies import HiringManagerUser, ManagerUser
# The permission helpers from Part 3: only jobs this user may see.
from app.auth.permissions import get_visible_job, visible_jobs
from app.db.session import DbSession
from app.jobs.models import Job
from app.jobs.schemas import JobCreate, JobRead, JobUpdate

router = APIRouter(prefix="/jobs", tags=["Jobs"])


# ── POST /jobs: hiring managers only. ──
@router.post("", response_model=JobRead, status_code=201)
def create_job(body: JobCreate, manager: HiringManagerUser, db: DbSession):
    """New jobs start as drafts and belong to the creating hiring manager."""
    # body.model_dump() = the validated body as a dict: {"title": ..., "description": ...}.
    # ** "unpacks" a dict into keyword arguments: Job(title=..., description=..., ...).
    # company_id and hiring_manager_id come from the LOGGED-IN user, never from the request,
    # so nobody can create a job in another company or on someone else's behalf.
    job = Job(company_id=manager.company_id, hiring_manager_id=manager.id, **body.model_dump())
    db.add(job)
    db.commit()
    # status isn't set, so the model default applies: "draft".
    return job


# ── GET /jobs: admins see all company jobs, hiring managers their own (permissions.py). ──
@router.get("", response_model=list[JobRead])
def list_jobs(manager: ManagerUser, db: DbSession):
    # Newest first.
    return db.exec(visible_jobs(manager).order_by(col(Job.created_at).desc())).all()


# ── GET /jobs/{job_id} ──
@router.get("/{job_id}", response_model=JobRead)
def read_job(job_id: uuid.UUID, manager: ManagerUser, db: DbSession):
    # 404 if it doesn't exist OR isn't visible to this user.
    return get_visible_job(db, manager, job_id)


# ── PATCH /jobs/{job_id}: partial update (PATCH = change some fields; PUT would replace all). ──
@router.patch("/{job_id}", response_model=JobRead)
def update_job(job_id: uuid.UUID, body: JobUpdate, manager: HiringManagerUser, db: DbSession):
    job = get_visible_job(db, manager, job_id)
    # exclude_unset=True = only fields the client actually SENT. Without it, every missing
    # field would come through as None and wipe the job.
    changes = body.model_dump(exclude_unset=True)
    # The schema can only compare the two salaries when both are in the request.
    # Here we compare against the stored values too: e.g. sending only salary_min=900 when the
    # saved salary_max is 500. dict.get(key, default) = the new value if sent, else the current one.
    salary_min = changes.get("salary_min", job.salary_min)
    salary_max = changes.get("salary_max", job.salary_max)
    if salary_min is not None and salary_max is not None and salary_min > salary_max:
        raise HTTPException(422, "salary_min cannot exceed salary_max")
    # Apply each change. setattr(job, "title", "X") is the same as job.title = "X".
    for field, value in changes.items():
        setattr(job, field, value)
    db.add(job)
    db.commit()
    return job
```

## `backend/app/candidates/public_router.py`

```python
# ── public_router.py: endpoints candidates use WITHOUT logging in. ──

import uuid
from pathlib import Path
from typing import Annotated

# File/Form = read multipart form fields and files. UploadFile = an uploaded file.
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.candidates.models import Application, StageHistory
from app.candidates.schemas import ApplicationReceipt
from app.companies.models import Company
from app.core.email import send_email
# Both upload styles from core/storage.py (below).
from app.core.storage import (
    UploadKind,
    confirm_upload,
    create_signed_upload,
    upload_cv,
    upload_supporting_document,
)
from app.db.session import DbSession
from app.jobs.models import Job, JobStatus, Stage

# No login is needed here: candidates apply without an account.
# Note: none of these endpoints use CurrentUser, so no token is required.
router = APIRouter(prefix="/public/jobs", tags=["Public applications"])


# What the public job page receives. It deliberately leaves out internal fields
# (hiring_manager_id, status, created_at...) and adds the company name.
class PublicJobRead(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    company_name: str
    qualification_requirements: str
    salary_min: int | None
    salary_max: int | None


# Shared helper: a job exists AND is open, otherwise 404.
# Draft and closed jobs look exactly like jobs that don't exist.
def get_open_job(db: Session, job_id: uuid.UUID) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.status != JobStatus.open:
        raise HTTPException(404, "This job is not accepting applications")
    return job


# ── GET /public/jobs/{job_id}: the job advert. ──
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


# BODY of the upload-permission request: which kind of file, its name and size.
class UploadRequest(BaseModel):
    kind: UploadKind                                     # "cv" or "document"
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=1)                              # bytes, at least 1


# The answer: where to send the file and the signed fields to send with it.
class SignedUpload(BaseModel):
    """POST `fields` plus the file (as `file`) to `upload_url`, then send `public_id` with the application."""

    upload_url: str
    public_id: str
    fields: dict[str, str]


# ── POST /public/jobs/{job_id}/uploads: step 1 of a direct upload. ──
@router.post("/{job_id}/uploads", response_model=SignedUpload)
def sign_upload(job_id: uuid.UUID, body: UploadRequest, db: DbSession):
    """Let the candidate's browser upload a CV or document straight to file storage.

    Used by the apply page so large files never pass through the API (hosted functions
    limit request bodies to 4.5 MB). Only open jobs hand out upload signatures.
    """
    # Only for open jobs, so random visitors can't use HireDesk as free file hosting.
    get_open_job(db, job_id)
    return create_signed_upload(body.kind, body.filename, body.size)


# ── POST /public/jobs/{job_id}/applications: apply. ──
# This is a MULTIPART FORM (like an HTML <form> with files), not JSON.
@router.post("/{job_id}/applications", response_model=ApplicationReceipt, status_code=201)
def apply_to_job(
    job_id: uuid.UUID,
    # Annotated[type, Form(rules)] = read this field from the form, with rules.
    full_name: Annotated[str, Form(min_length=1, max_length=100)],
    email: Annotated[EmailStr, Form()],
    phone: Annotated[str, Form(min_length=5, max_length=30)],
    db: DbSession,
    background_tasks: BackgroundTasks,
    # OLD style: the CV file itself in the request (still works; used by the tests).
    cv: UploadFile | None = None,
    cover_letter: Annotated[str | None, Form(max_length=5000)] = None,
    candidate_qualifications: Annotated[str, Form(max_length=5000)] = "",
    expected_salary: Annotated[int | None, Form(ge=0)] = None,
    supporting_documents: list[UploadFile] = File(default=[]),
    # NEW style: files already uploaded straight to Cloudinary; we receive only their ids.
    cv_public_id: Annotated[str | None, Form(max_length=200)] = None,
    # A form field sent several times becomes a list.
    document_public_ids: Annotated[list[str], Form()] = [],
    document_names: Annotated[list[str], Form()] = [],
):
    """Apply with a multipart form: full_name, email, phone, a CV and an optional cover_letter.

    Send the CV either as a file (`cv`) or, after a direct upload, as `cv_public_id`.
    Supporting documents work the same way: files in `supporting_documents`, or
    `document_public_ids` with the matching original `document_names`.
    """
    job = get_open_job(db, job_id)
    email = email.lower()
    # Collapse line breaks and runs of spaces: names end up in email subjects and lists.
    # "  Ada \n Obi " -> split() -> ["Ada", "Obi"] -> " ".join -> "Ada Obi"
    full_name = " ".join(full_name.split())
    phone = " ".join(phone.split())
    # A name made only of spaces becomes "" after that, so reject it.
    if not full_name:
        raise HTTPException(422, "Enter your name")

    # Exactly ONE way of giving the CV. (A == B) is True when both are None (no CV)
    # or both are given (two CVs): both are mistakes.
    if (cv is None) == (cv_public_id is None):
        raise HTTPException(422, "Attach your CV")
    # Each uploaded document id needs its original file name, so the lists must line up.
    if len(document_public_ids) != len(document_names):
        raise HTTPException(422, "Each uploaded document needs its file name")
    # At most 6 documents in total, whichever way they arrived.
    if len(supporting_documents) + len(document_public_ids) > 6:
        raise HTTPException(422, "You can upload up to 6 supporting documents")

    # Friendly early check for "already applied" (the database also enforces it, below).
    already_applied = db.exec(
        select(Application.id).where(Application.job_id == job.id, Application.email == email)
    ).first()
    if already_applied is not None:
        raise HTTPException(409, "You have already applied to this job")

    # Get the CV's URL: upload the file now (old style) OR check the direct upload (new style).
    cv_url = upload_cv(cv) if cv is not None else confirm_upload("cv", cv_public_id)
    # A LIST COMPREHENSION: upload each attached document file, collecting {"name", "url"} dicts.
    uploaded_documents = [upload_supporting_document(document) for document in supporting_documents]
    # Add the direct-uploaded documents. zip() pairs the two lists: (id1, name1), (id2, name2)...
    # Path(name).name strips any folder path a browser might send ("C:\\x\\cv.pdf" -> "cv.pdf").
    # [:255] cuts long names; 'or "document"' gives a fallback if the name ends up empty.
    uploaded_documents += [
        {"name": Path(name).name[:255] or "document", "url": confirm_upload("document", public_id)}
        for public_id, name in zip(document_public_ids, document_names)
    ]

    application = Application(
        job_id=job.id,
        full_name=full_name,
        email=email,
        phone=phone,
        cv_url=cv_url,
        candidate_qualifications=candidate_qualifications,
        expected_salary=expected_salary,
        supporting_documents=uploaded_documents,
        # An empty string "" becomes None (no cover letter).
        cover_letter=cover_letter or None,
        # stage isn't set, so the model default applies: "applied".
    )
    db.add(application)
    try:
        db.flush()  # insert the application first, because the history row points to it
    except IntegrityError as error:  # two identical applications arrived at the same moment
        # The unique (job_id, email) rule caught a race the early check above missed.
        db.rollback()
        raise HTTPException(409, "You have already applied to this job") from error
    # The first history row: from nothing (None) to "applied", changed by nobody (the candidate).
    db.add(StageHistory(application_id=application.id, from_stage=None, to_stage=Stage.applied))
    # Save application + history together.
    db.commit()

    # Confirmation email to the candidate, sent after the response.
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
    # A small receipt: the application id and when it was received.
    return ApplicationReceipt(id=application.id, created_at=application.created_at)
```

## `backend/app/core/storage.py`

```python
# ── storage.py: saving CVs and documents on Cloudinary. ──

"""CV and supporting-document storage on Cloudinary.

Two ways to get a file in:

- Through the API (`upload_cv`, `upload_supporting_document`): the file is part of the
  application request. Simple, but hosted serverless functions (Vercel) cap request
  bodies at 4.5 MB.
- Direct from the browser (`create_signed_upload`, then `confirm_upload`): the API signs
  a one-time upload for one exact file name in our folder, the browser sends the file
  straight to Cloudinary, and the application request only carries its public id. The
  API then asks Cloudinary for the real size before accepting it.
"""
# logging = write messages to the server log (visible in Vercel's logs).
import logging
# re = regular expressions (text patterns), used to check upload ids.
import re
import time
import uuid
from pathlib import Path
from typing import Literal

# The Cloudinary SDK: config, the admin API (look up files), exceptions, uploader, and signing utils.
import cloudinary
import cloudinary.api
import cloudinary.exceptions
import cloudinary.uploader
import cloudinary.utils
from fastapi import HTTPException, UploadFile

from app.core.config import Settings, get_settings

# A logger named after this module ("app.core.storage").
logger = logging.getLogger(__name__)

# Allowed file types and sizes. A set {...} makes "is X in here?" checks fast.
ALLOWED_CV_EXTENSIONS = {".pdf", ".doc", ".docx"}
MAX_CV_BYTES = 5 * 1024 * 1024  # 5 MB
# "|" on sets = union: the CV types plus images.
ALLOWED_DOCUMENT_EXTENSIONS = ALLOWED_CV_EXTENSIONS | {".png", ".jpg", ".jpeg"}
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

# A type that only allows the two strings "cv" or "document".
UploadKind = Literal["cv", "document"]
# Cloudinary folders (part of each file's id).
CV_FOLDER = "hiredesk/cvs"
DOCUMENT_FOLDER = "hiredesk/application-documents"

# kind -> (folder, allowed extensions, max bytes, size error, type error)
# One table of rules instead of repeating if/else for CVs and documents everywhere.
RULES: dict[str, tuple[str, set[str], int, str, str]] = {
    "cv": (
        CV_FOLDER,
        ALLOWED_CV_EXTENSIONS,
        MAX_CV_BYTES,
        "The CV must be 5 MB or smaller",
        "The CV must be a PDF, DOC or DOCX file",
    ),
    "document": (
        DOCUMENT_FOLDER,
        ALLOWED_DOCUMENT_EXTENSIONS,
        MAX_DOCUMENT_BYTES,
        "Each supporting document must be 10 MB or smaller",
        "Supporting documents must be PDF, DOC, DOCX, PNG or JPG files",
    ),
}


# Set up the Cloudinary SDK with our credentials, or 503 if they're missing.
def _configure() -> Settings:
    settings = get_settings()
    if not settings.cloudinary_cloud_name:
        raise HTTPException(503, "File storage is not configured")
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,      # always use https:// URLs
    )
    return settings


# Check the file type and size; return the lowercase extension (e.g. ".pdf").
def _check(kind: UploadKind, filename: str | None, size: int | None) -> str:
    """Return the lowercase extension, or raise if the type or size is not allowed."""
    # Unpack the rule tuple; "_" = a value we don't need here (the folder).
    _, extensions, max_bytes, size_error, type_error = RULES[kind]
    # Path("My CV.PDF").suffix -> ".PDF" -> .lower() -> ".pdf". "or ''" handles a missing name.
    extension = Path(filename or "").suffix.lower()
    if extension not in extensions:
        raise HTTPException(422, type_error)
    if size is None or size > max_bytes:
        # 413 Payload Too Large.
        raise HTTPException(413, size_error)
    return extension


# ── Upload through the API ──


# Send an uploaded file to Cloudinary and return its https URL.
def _upload(file: UploadFile, folder: str) -> str:
    _configure()
    try:
        result = cloudinary.uploader.upload(
            file.file,                # the file's contents (a stream)
            resource_type="raw",      # store as-is (not as an image/video to transform)
            folder=folder,
            # A random name (uuid4().hex = 32 hex characters) + the original extension.
            # Never use the candidate's file name: it could clash or contain odd characters.
            public_id=f"{uuid.uuid4().hex}{Path(file.filename or '').suffix.lower()}",
        )
    except Exception as error:
        # Log the full error for us; give the candidate a short, friendly message.
        logger.exception("Cloudinary upload failed")
        # 502 Bad Gateway = a service we depend on failed.
        raise HTTPException(502, "Could not upload the CV, please try again") from error
    return result["secure_url"]


def upload_cv(cv: UploadFile) -> str:
    """Check the CV file, upload it to Cloudinary and return its URL."""
    # cv.size = the size FastAPI measured from the actual upload.
    _check("cv", cv.filename, cv.size)
    return _upload(cv, CV_FOLDER)


def upload_supporting_document(document: UploadFile) -> dict[str, str]:
    _check("document", document.filename, document.size)
    return {
        "name": Path(document.filename or "document").name,   # original name, for display
        "url": _upload(document, DOCUMENT_FOLDER),
    }


# ── Direct upload from the browser ──


# Step 1: give the browser permission to upload ONE specific file.
def create_signed_upload(kind: UploadKind, filename: str, size: int) -> dict:
    """Sign a Cloudinary upload for one new file. The signature only allows this exact public id."""
    # Check the type and the size the browser CLAIMS (the real size is checked again in step 3).
    extension = _check(kind, filename, size)
    settings = _configure()
    # We choose the name: our folder + a random id + the extension, e.g. "hiredesk/cvs/3f9a...c1.pdf".
    public_id = f"{RULES[kind][0]}/{uuid.uuid4().hex}{extension}"
    # What we sign: this exact name and the current time (Cloudinary rejects old signatures).
    params = {"public_id": public_id, "timestamp": int(time.time())}
    # A SIGNATURE = a hash of the params combined with our API secret.
    # Cloudinary recomputes it; if it matches, it knows WE approved this exact upload.
    # The secret itself never leaves the server.
    signature = cloudinary.utils.api_sign_request(params, settings.cloudinary_api_secret)
    return {
        # Where the browser sends the file (Cloudinary's upload API for "raw" files).
        "upload_url": f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/raw/upload",
        "public_id": public_id,
        # Form fields the browser must send along with the file.
        "fields": {
            "api_key": settings.cloudinary_api_key,     # public: identifies our account
            "public_id": public_id,
            "timestamp": str(params["timestamp"]),
            "signature": signature,
        },
    }
    # Step 2 happens in the browser: POST the file + these fields to upload_url.


# Step 3: when the application arrives with a public id, check it before trusting it.
def confirm_upload(kind: UploadKind, public_id: str) -> str:
    """Check a browser upload with Cloudinary and return its URL.

    Only ids in our folder with the shape we sign are accepted, and the size comes from
    Cloudinary, not from the browser. A file that is too big is deleted.
    """
    folder, extensions, max_bytes, size_error, type_error = RULES[kind]
    # The id must look EXACTLY like the ones we create: "<folder>/<32 hex chars><.ext>".
    # re.escape makes "/" and "-" in the folder literal; rf"..." = raw f-string;
    # {{32}} is regex "exactly 32" (doubled braces because it's inside an f-string);
    # (\.[a-z]+) captures the extension as group 1.
    match = re.fullmatch(rf"{re.escape(folder)}/[0-9a-f]{{32}}(\.[a-z]+)", public_id)
    if match is None:
        # Someone sent an id from another folder, or made one up.
        raise HTTPException(422, "The uploaded file reference is not valid")
    if match.group(1) not in extensions:
        raise HTTPException(422, type_error)

    _configure()
    try:
        # Ask Cloudinary about the file: does it exist, how big is it, what's its URL?
        resource = cloudinary.api.resource(public_id, resource_type="raw")
    except cloudinary.exceptions.NotFound as error:
        # Signed but never uploaded (or the upload failed).
        raise HTTPException(422, "The uploaded file was not found, please upload it again") from error
    except Exception as error:
        logger.exception("Cloudinary lookup failed")
        raise HTTPException(502, "Could not check the uploaded file, please try again") from error

    # The REAL size, from Cloudinary, not the browser.
    if int(resource.get("bytes", 0)) > max_bytes:
        try:
            # Too big: delete it so it doesn't use storage.
            cloudinary.uploader.destroy(public_id, resource_type="raw")
        except Exception:
            # Even if deleting fails, still reject the application below; just log it.
            logger.exception("Could not delete the oversized upload %s", public_id)
        raise HTTPException(413, size_error)
    # All good: the permanent https URL to store on the application.
    return resource["secure_url"]
```

### The direct upload, step by step
```text
Browser                         HireDesk API                         Cloudinary
  │ POST /public/jobs/{id}/uploads  │                                    │
  │ {kind, filename, size} ───────► │ check type+size, invent id,        │
  │                                 │ sign {public_id, timestamp}        │
  │ ◄─────── {upload_url, fields}   │                                    │
  │ POST file + fields ─────────────────────────────────────────────────►│ checks signature, stores file
  │ POST /applications {cv_public_id, ...} ►│                            │
  │                                 │ check id pattern ─ resource() ───► │ real size?
  │                                 │ ◄──────────────── bytes, secure_url│
  │ ◄──── 201 receipt               │ (too big → destroy + 413)          │
```
