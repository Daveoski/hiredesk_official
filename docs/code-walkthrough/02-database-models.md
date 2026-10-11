# Part 2: The database models (copyable)

A **model** is a Python class that describes one database table. `SQLModel` lets one class be both the table *and* a validated data object. The pattern on every line is `column_name: python_type = Field(rules...)`.

## `backend/app/companies/models.py`
```python
# ── The companies table: every business row belongs to a company (directly or through a job). ──

# uuid = random 128-bit identifiers like "9f1c2b7e-...". Hard to guess, safe to put in URLs.
import uuid

# SQLModel = base class for tables. Field = column rules.
from sqlmodel import Field, SQLModel


# table=True makes this a real database table (without it, it's only a data shape).
class Company(SQLModel, table=True):
    # The table's name in PostgreSQL.
    __tablename__ = "companies"

    # Primary key (PK): uniquely identifies each row.
    # default_factory=uuid.uuid4 = generate a NEW random UUID for every new company.
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # A required text column. No default = must be given.
    name: str
```

## `backend/app/users/models.py`
```python
# ── Users (team members) and Invitations. ──

import uuid
from datetime import datetime
# StrEnum = an enum whose values are plain strings, so they turn into JSON naturally.
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.db.common import TIMESTAMPTZ, enum_column, utcnow


# The three roles. The left side is the Python name, the right side is what's stored in the database.
class Role(StrEnum):
    company_admin = "company_admin"     # creates the company, invites the team, sees progress
    hiring_manager = "hiring_manager"   # owns jobs, moves candidates, decides
    interviewer = "interviewer"         # schedules interviews, submits scorecards


class User(SQLModel, table=True):
    __tablename__ = "users"

    # Primary key: a new random UUID per user.
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Foreign key (FK): must point to an existing row in companies. A user belongs to ONE company.
    company_id: uuid.UUID = Field(foreign_key="companies.id")
    # The unique index on email is also what makes the login lookup fast.
    # unique=True: no two users may share an email. index=True: a lookup structure for fast searching.
    email: str = Field(unique=True, index=True)
    full_name: str
    # Never the real password: an Argon2 hash (one-way scramble). See core/security.py.
    hashed_password: str
    # False for accounts created with Google until they set a password (added in migration 0004).
    password_login_enabled: bool = Field(default=True, nullable=False)
    # The role, stored as plain text using the helper from db/common.py.
    role: Role = Field(sa_type=enum_column(Role))


class Invitation(SQLModel, table=True):
    __tablename__ = "invitations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Which company the person will join. index=True because we often list invitations by company.
    company_id: uuid.UUID = Field(foreign_key="companies.id", index=True)
    # Which admin sent it (FK to users).
    invited_by_id: uuid.UUID = Field(foreign_key="users.id")
    # Who is invited. Indexed because we look invitations up by email (e.g. Google sign-in).
    email: str = Field(index=True)
    full_name: str
    # The role they will get when they accept.
    role: Role = Field(sa_type=enum_column(Role))
    # The SHA-256 HASH of the secret token in the invite link (never the token itself).
    # unique: two invitations can never have the same token.
    token_hash: str = Field(unique=True, index=True)
    # When the link stops working (7 days after sending). Time-zone aware.
    expires_at: datetime = Field(sa_type=TIMESTAMPTZ)
    # Empty until accepted. "datetime | None" = a date OR nothing. Once set, the link can't be reused.
    accepted_at: datetime | None = Field(default=None, sa_type=TIMESTAMPTZ)
    # Filled automatically with "now" when the row is created.
    created_at: datetime = Field(default_factory=utcnow, sa_type=TIMESTAMPTZ)
```

## `backend/app/jobs/models.py`
```python
# ── Jobs, plus the two enums shared across the app: the pipeline Stage and JobStatus. ──

import uuid
from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.db.common import TIMESTAMPTZ, enum_column, utcnow


# The six pipeline stages. The ORDER and the allowed moves live in candidates/service.py.
class Stage(StrEnum):
    """The hiring pipeline: applied -> screen -> interview -> offer -> hired / rejected."""

    applied = "applied"
    screen = "screen"
    interview = "interview"
    offer = "offer"
    hired = "hired"         # final
    rejected = "rejected"   # final


class JobStatus(StrEnum):
    draft = "draft"  # not visible to candidates
    open = "open"  # the public application page accepts applications
    closed = "closed"  # no longer accepts applications


class Job(SQLModel, table=True):
    __tablename__ = "jobs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # The company that owns the job. Indexed: almost every job query filters by company.
    company_id: uuid.UUID = Field(foreign_key="companies.id", index=True)
    # The hiring manager who owns it. "| None" = allowed to be empty in the database,
    # but the API always sets it to the creator (jobs/router.py).
    hiring_manager_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    title: str
    description: str
    # Optional text, default empty, at most 5000 characters.
    qualification_requirements: str = Field(default="", max_length=5000)
    # Optional numbers. ge=0 = "greater than or equal to 0" (no negative salaries).
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)
    # New jobs start as drafts.
    status: JobStatus = Field(default=JobStatus.draft, sa_type=enum_column(JobStatus))
    # Set automatically to "now" when created.
    created_at: datetime = Field(default_factory=utcnow, sa_type=TIMESTAMPTZ)
```

## `backend/app/candidates/models.py`
```python
# ── Applications (a candidate applying to one job) and StageHistory (the audit trail). ──

import uuid
from datetime import datetime

# JSON = a column type that stores lists/dicts. UniqueConstraint = "this combination must be unique".
from sqlalchemy import JSON, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.db.common import TIMESTAMPTZ, enum_column, utcnow
# Re-use the Stage enum defined with jobs.
from app.jobs.models import Stage


class Application(SQLModel, table=True):
    """A candidate's application to one job. Candidates have no account."""

    __tablename__ = "applications"
    # The same email cannot apply twice to the same job. This also indexes job_id lookups.
    # The database enforces it, so even two simultaneous submissions can't both succeed.
    __table_args__ = (UniqueConstraint("job_id", "email", name="uq_applications_job_id_email"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Which job. The company is reached THROUGH the job (applications have no company_id).
    job_id: uuid.UUID = Field(foreign_key="jobs.id")
    # There is no separate "candidate" table: the candidate's details live on the application.
    full_name: str
    email: str
    phone: str
    # Link to the CV file on Cloudinary (the file itself is not in the database).
    cv_url: str
    candidate_qualifications: str = Field(default="", max_length=5000)
    expected_salary: int | None = Field(default=None, ge=0)
    # The hiring manager's assessment: 0 to 100 (ge = >=, le = <=).
    match_score: int | None = Field(default=None, ge=0, le=100)
    manager_notes: str | None = Field(default=None, max_length=5000)
    # A SUMMARY computed from all submitted scorecards (recommend / maybe / not_recommend).
    interviewer_recommendation: str | None = None
    # A list like [{"name": "cert.pdf", "url": "https://..."}], stored as JSON.
    # default_factory=list = a NEW empty list per row (never share one list object between rows).
    supporting_documents: list[dict[str, str]] = Field(default_factory=list, sa_type=JSON)
    cover_letter: str | None = None
    # Where the candidate is in the pipeline. Everyone starts at "applied".
    stage: Stage = Field(default=Stage.applied, sa_type=enum_column(Stage))
    created_at: datetime = Field(default_factory=utcnow, sa_type=TIMESTAMPTZ)


class StageHistory(SQLModel, table=True):
    """One row for every stage change. The first row (from_stage empty) is the application itself."""

    __tablename__ = "stage_history"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Which application moved. Indexed: we list history per application.
    application_id: uuid.UUID = Field(foreign_key="applications.id", index=True)
    # Where it came from. Empty (None) for the very first row, when the candidate applied.
    from_stage: Stage | None = Field(default=None, sa_type=enum_column(Stage))
    # Where it went.
    to_stage: Stage = Field(sa_type=enum_column(Stage))
    # Empty for the first row, because the candidate applied without an account.
    # Otherwise: the hiring manager who made the move.
    changed_by_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    # When it happened.
    changed_at: datetime = Field(default_factory=utcnow, sa_type=TIMESTAMPTZ)
```

## `backend/app/interviews/models.py`
```python
# ── Interviews: one interviewer meeting one candidate. ──

import uuid
from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.db.common import TIMESTAMPTZ, enum_column


# The life of an interview: assigned (no time yet) -> scheduled (time chosen) -> completed,
# or cancelled at any point before completion.
class InterviewStatus(StrEnum):
    assigned = "assigned"     # the hiring manager picked the interviewer; no time yet
    scheduled = "scheduled"   # the interviewer chose the time and format
    completed = "completed"  # set when the interviewer submits the scorecard
    cancelled = "cancelled"   # frees the interviewer's time slot


class MeetingType(StrEnum):
    virtual = "virtual"       # needs a meeting link
    in_person = "in_person"   # needs a location


class Interview(SQLModel, table=True):
    """One interviewer, one time slot, one candidate application.

    Clash prevention lives in the database: the migration adds an exclusion
    constraint (no_overlapping_interviews) so one interviewer can never have two
    overlapping interviews unless one of them is cancelled.
    The start and end are stored; the duration is calculated from them.
    """

    __tablename__ = "interviews"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Which candidate (application). Indexed: we list interviews per candidate.
    application_id: uuid.UUID = Field(foreign_key="applications.id", index=True)
    # Which interviewer (a user with the interviewer role, checked in interviews/router.py).
    interviewer_id: uuid.UUID = Field(foreign_key="users.id")
    # Empty until the interviewer schedules it. Duration = ends_at - starts_at (computed in the schema).
    starts_at: datetime | None = Field(default=None, sa_type=TIMESTAMPTZ)
    ends_at: datetime | None = Field(default=None, sa_type=TIMESTAMPTZ)
    # Empty until scheduled.
    meeting_type: MeetingType | None = Field(default=None, sa_type=enum_column(MeetingType))
    meeting_url: str | None = None    # for virtual meetings
    location: str | None = None       # for in-person meetings
    # New interviews start as "assigned".
    status: InterviewStatus = Field(default=InterviewStatus.assigned, sa_type=enum_column(InterviewStatus))
```

## `backend/app/scorecards/models.py`
```python
# ── Scorecards (one per interview) and their ratings (one row per criterion). ──

import uuid
from datetime import datetime
from enum import StrEnum

# CheckConstraint = a rule the DATABASE enforces on every row (e.g. rating must be 1-5).
from sqlalchemy import CheckConstraint
from sqlmodel import Field, SQLModel

from app.db.common import TIMESTAMPTZ, enum_column


class ScorecardStatus(StrEnum):
    # (The original comment says "when scheduled", but the empty scorecard is actually
    #  created when the interviewer is ASSIGNED - see interviews/router.py.)
    pending = "pending"  # created when the interview is scheduled
    submitted = "submitted"  # filled in by the interviewer, cannot be changed


# The interviewer's overall opinion.
class Recommendation(StrEnum):
    recommend = "recommend"
    maybe = "maybe"
    not_recommend = "not_recommend"


class Scorecard(SQLModel, table=True):
    """One scorecard per interview. The interviewer is the interview's interviewer."""

    __tablename__ = "scorecards"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # unique=True: exactly ONE scorecard per interview (the "||--||" one-to-one in the ERD).
    interview_id: uuid.UUID = Field(foreign_key="interviews.id", unique=True, index=True)
    # Starts empty (pending); becomes submitted once and never changes back.
    status: ScorecardStatus = Field(default=ScorecardStatus.pending, sa_type=enum_column(ScorecardStatus))
    # Optional overall opinion.
    recommendation: Recommendation | None = Field(default=None, sa_type=enum_column(Recommendation))
    # When it was submitted (empty while pending).
    submitted_at: datetime | None = Field(default=None, sa_type=TIMESTAMPTZ)


class ScorecardRating(SQLModel, table=True):
    """One criterion on a scorecard, rated 1 to 5, with an optional comment."""

    __tablename__ = "scorecard_ratings"
    # The database itself refuses any rating outside 1-5, even if the code had a bug.
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="ck_scorecard_ratings_rating"),)

    # COMPOSITE primary key: scorecard_id + criterion together identify a row.
    # So the same scorecard can't rate "Communication" twice.
    scorecard_id: uuid.UUID = Field(foreign_key="scorecards.id", primary_key=True)
    criterion: str = Field(primary_key=True, max_length=100)   # e.g. "Problem solving"
    rating: int                                                # 1 to 5
    comment: str | None = None                                 # optional
```

**How the tables connect:**
```text
companies ─┬─< users ─────────────< interviews (interviewer_id) >──── applications
           ├─< invitations                │                               │
           └─< jobs ──< applications ──<──┘ stage_history                 │
                                          interviews ── scorecards ──< scorecard_ratings
( ─< means "one to many" ; ── means "one to one" )
```
