# Part 11: Database migrations and tests (copyable)

## Migrations: changing the database safely

A **migration** is a versioned script that changes the database's *structure* (tables, columns, rules). Each one has:
- `upgrade()`: apply the change.
- `downgrade()`: undo it.
- `down_revision`: which migration comes before it, forming a chain `0001 → 0002 → 0003 → 0004 → 0005`.

`alembic upgrade head` runs every migration not yet applied. Alembic records the current version in a table called `alembic_version`, so it knows where each database is.

### `backend/alembic.ini` (the important lines)
```ini
[alembic]
# Where the migration scripts live (the alembic/ folder).
script_location = alembic
# Add the backend folder to Python's import path, so "import app..." works inside env.py.
prepend_sys_path = .
# (the rest of the file only configures logging)
```

### `backend/alembic/env.py`
```python
# ── env.py: Alembic runs this file to connect to the database and apply migrations. ──

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine
from sqlmodel import SQLModel

# Same settings as the app, so migrations use the same DATABASE_URL (with the psycopg fix).
from app.core.config import get_settings

# Importing the models registers their tables in SQLModel.metadata.
# ("noqa: F401" = "yes, imported but not used directly; that's intended".)
# Alembic needs the full list of tables to compare models with the database (`alembic check`).
import app.candidates.models  # noqa: F401
import app.companies.models  # noqa: F401
import app.interviews.models  # noqa: F401
import app.jobs.models  # noqa: F401
import app.scorecards.models  # noqa: F401
import app.users.models  # noqa: F401

# The settings from alembic.ini.
config = context.config
# Set up logging as alembic.ini describes.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# "What the database SHOULD look like" according to the models.
target_metadata = SQLModel.metadata


def run_migrations() -> None:
    engine = create_engine(get_settings().database_url)
    with engine.connect() as connection:
        # compare_type=True: also notice when a column's TYPE changed (used by `alembic check`).
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        # All migrations in ONE transaction: if one fails, nothing is half-applied.
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()       # close all connections


run_migrations()
```

### `0001_initial_schema.py`: the first tables
```python
"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-05
"""
from typing import Sequence, Union

# op = "operations": create_table, add_column, create_index...
from alembic import op
import sqlalchemy as sa

revision: str = "0001"                      # this migration's id
down_revision: Union[str, None] = None      # None = the first in the chain
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Needed so the interview exclusion constraint can compare a uuid with "=".
    # An EXTENSION adds features to PostgreSQL. btree_gist lets a GiST index use "=" on normal values.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.create_table(
        "companies",
        sa.Column("id", sa.Uuid(), nullable=False),          # nullable=False = required
        sa.Column("name", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        # native_enum=False: stored as VARCHAR(20) text (see db/common.py).
        sa.Column(
            "role",
            sa.Enum("company_admin", "hiring_manager", "interviewer", name="role", native_enum=False, length=20),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),   # users.company_id -> companies.id
        sa.PrimaryKeyConstraint("id"),
    )
    # Unique index on email: no duplicates + fast login lookups.
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("hiring_manager_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "open", "closed", name="jobstatus", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),   # timestamptz
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["hiring_manager_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jobs_company_id", "jobs", ["company_id"])

    op.create_table(
        "applications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("cv_url", sa.String(), nullable=False),
        sa.Column("cover_letter", sa.String(), nullable=True),
        sa.Column(
            "stage",
            sa.Enum(
                "applied", "screen", "interview", "offer", "hired", "rejected",
                name="stage", native_enum=False, length=20,
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
        # One application per email per job, enforced by the database.
        sa.UniqueConstraint("job_id", "email", name="uq_applications_job_id_email"),
    )

    op.create_table(
        "stage_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column("from_stage", sa.Enum(..., name="stage", native_enum=False, length=20), nullable=True),
        sa.Column("to_stage", sa.Enum(..., name="stage", native_enum=False, length=20), nullable=False),
        # (the "..." stands for the same six stage names as above)
        sa.Column("changed_by_id", sa.Uuid(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"]),
        sa.ForeignKeyConstraint(["changed_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stage_history_application_id", "stage_history", ["application_id"])

    op.create_table(
        "interviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column("interviewer_id", sa.Uuid(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),   # 0002 makes these optional
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum("scheduled", "completed", "cancelled", name="interviewstatus", native_enum=False, length=20),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"]),
        sa.ForeignKeyConstraint(["interviewer_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_interviews_application_id", "interviews", ["application_id"])
    # An interviewer cannot have two overlapping interviews (cancelled ones do not count).
    # The time range is [start, end), so back-to-back interviews are allowed.
    # The database enforces this, so two simultaneous requests cannot both succeed.
    op.execute(
        """
        ALTER TABLE interviews
        ADD CONSTRAINT no_overlapping_interviews
        EXCLUDE USING gist (
            interviewer_id WITH =,                    -- same interviewer, AND
            tstzrange(starts_at, ends_at) WITH &&     -- && = the time ranges overlap  ->  refused
        )
        WHERE (status <> 'cancelled')
        """
    )

    op.create_table(
        "scorecards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.Enum("pending", "submitted", name="scorecardstatus", native_enum=False, length=20), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    # unique=True: one scorecard per interview.
    op.create_index("ix_scorecards_interview_id", "scorecards", ["interview_id"], unique=True)

    op.create_table(
        "scorecard_ratings",
        sa.Column("scorecard_id", sa.Uuid(), nullable=False),
        sa.Column("criterion", sa.String(length=100), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(), nullable=True),
        # The database refuses any rating outside 1-5.
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_scorecard_ratings_rating"),
        sa.ForeignKeyConstraint(["scorecard_id"], ["scorecards.id"]),
        # Composite primary key: a scorecard can't rate the same criterion twice.
        sa.PrimaryKeyConstraint("scorecard_id", "criterion"),
    )


def downgrade() -> None:
    # Drop in REVERSE order: children before parents (foreign keys would block otherwise).
    op.drop_table("scorecard_ratings")
    op.drop_table("scorecards")
    op.drop_table("interviews")
    op.drop_table("stage_history")
    op.drop_table("applications")
    op.drop_table("jobs")
    op.drop_table("users")
    op.drop_table("companies")
```

### `0002_hiring_workflows.py`: the richer hiring workflow
```python
"""hiring workflows

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"      # runs after 0001


def upgrade() -> None:
    # New job columns. server_default="" fills EXISTING rows so the NOT NULL rule can be added safely.
    op.add_column("jobs", sa.Column("qualification_requirements", sa.String(length=5000), nullable=False, server_default=""))
    op.add_column("jobs", sa.Column("salary_min", sa.Integer(), nullable=True))
    op.add_column("jobs", sa.Column("salary_max", sa.Integer(), nullable=True))

    # New application columns (assessment, salary, recommendation summary, documents).
    op.add_column("applications", sa.Column("candidate_qualifications", sa.String(length=5000), nullable=False, server_default=""))
    op.add_column("applications", sa.Column("expected_salary", sa.Integer(), nullable=True))
    op.add_column("applications", sa.Column("match_score", sa.Integer(), nullable=True))
    op.add_column("applications", sa.Column("manager_notes", sa.String(length=5000), nullable=True))
    op.add_column("applications", sa.Column("interviewer_recommendation", sa.String(length=20), nullable=True))
    # A JSON list; existing rows get an empty list '[]'.
    op.add_column(
        "applications",
        sa.Column("supporting_documents", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )

    # Interviews become TWO-STEP (assigned without a time, then scheduled):
    # 1) drop the old no-overlap rule (it can't handle empty times),
    op.execute("ALTER TABLE interviews DROP CONSTRAINT IF EXISTS no_overlapping_interviews")
    # 2) allow starts_at/ends_at to be empty,
    op.alter_column("interviews", "starts_at", existing_type=sa.DateTime(timezone=True), nullable=True)
    op.alter_column("interviews", "ends_at", existing_type=sa.DateTime(timezone=True), nullable=True)
    # 3) add the meeting details,
    op.add_column("interviews", sa.Column("meeting_type", sa.String(length=20), nullable=True))
    op.add_column("interviews", sa.Column("meeting_url", sa.String(), nullable=True))
    op.add_column("interviews", sa.Column("location", sa.String(), nullable=True))
    # 4) status becomes plain text with a CHECK listing the four allowed values (including "assigned"),
    op.alter_column(
        "interviews",
        "status",
        existing_type=sa.Enum("scheduled", "completed", "cancelled", name="interviewstatus", native_enum=False, length=20),
        type_=sa.String(length=20),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "ck_interviews_status",
        "interviews",
        "status IN ('assigned', 'scheduled', 'completed', 'cancelled')",
    )
    # 5) re-create the no-overlap rule, but ONLY for scheduled interviews
    #    (assigned ones have no time; completed/cancelled don't block the calendar).
    op.execute(
        """
        CREATE EXTENSION IF NOT EXISTS btree_gist;
        ALTER TABLE interviews
        ADD CONSTRAINT no_overlapping_interviews
        EXCLUDE USING gist (interviewer_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
        WHERE (status = 'scheduled');
        """
    )

    # Scorecards get an optional recommendation, restricted to three values.
    op.add_column("scorecards", sa.Column("recommendation", sa.String(length=20), nullable=True))
    op.create_check_constraint(
        "ck_scorecards_recommendation",
        "scorecards",
        "recommendation IS NULL OR recommendation IN ('recommend', 'maybe', 'not_recommend')",
    )


def downgrade() -> None:
    # Exactly the reverse of upgrade(), in reverse order (see the file for every line).
    ...
```

### `0003_team_invitations.py`
```python
"""team invitations

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"


def upgrade() -> None:
    op.create_table(
        "invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("invited_by_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("role", sa.Enum("company_admin", "hiring_manager", "interviewer", name="role", native_enum=False, length=20), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["invited_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        # This made a unique CONSTRAINT on token_hash...
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_invitations_company_id", "invitations", ["company_id"])
    op.create_index("ix_invitations_email", "invitations", ["email"])
    # ...and this a unique INDEX on the same column: the same rule twice (removed in 0005).
    op.create_index("ix_invitations_token_hash", "invitations", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_invitations_token_hash", table_name="invitations")
    op.drop_index("ix_invitations_email", table_name="invitations")
    op.drop_index("ix_invitations_company_id", table_name="invitations")
    op.drop_table("invitations")
```

### `0004_password_login.py`
```python
"""Track whether email/password sign-in is enabled for a user."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"


def upgrade() -> None:
    # Add the column. server_default=true fills EVERY EXISTING user with true
    # (they all registered with a password before this feature existed).
    op.add_column(
        "users",
        sa.Column("password_login_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    # Then remove the database default: from now on the APP always sets the value explicitly.
    op.alter_column("users", "password_login_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "password_login_enabled")
```

### `0005_drop_duplicate_token_constraint.py`
```python
"""Drop the duplicate unique constraint on invitations.token_hash.

Migration 0003 created both a unique constraint and a unique index on the column.
The unique index (ix_invitations_token_hash) alone matches the model, so
`alembic check` reports no drift and the column is indexed once.
"""
from alembic import op

revision = "0005"
down_revision = "0004"


def upgrade() -> None:
    # PostgreSQL named the 0003 constraint "<table>_<column>_key".
    op.drop_constraint("invitations_token_hash_key", "invitations", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("invitations_token_hash_key", "invitations", ["token_hash"])
```

**Commands:**
```bash
alembic upgrade head        # apply all pending migrations
alembic downgrade -1        # undo the last one
alembic current             # which version is this database at?
alembic revision -m "msg"   # create a new, empty migration file to fill in
alembic check               # fail if the models changed without a migration (runs in CI)
```

---

## Tests

**pytest** finds functions named `test_...` and runs them; an `assert` that is false makes the test fail. A **fixture** is reusable setup that pytest passes to a test by parameter name (for example `world`, `client`, `outbox`). **monkeypatch** temporarily replaces something (a function or a setting) for one test, then puts it back.

### `backend/tests/conftest.py` (shared setup, loaded automatically by pytest)
```python
import os

# These must be set BEFORE the app is imported, because the app reads them at import time.
# (session.py creates the engine as soon as it's imported, using DATABASE_URL.)
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5433/hireplume_test"
)
# SAFETY: the tests empty every table. Refuse to run against anything not named "..._test".
assert TEST_DATABASE_URL.endswith("_test"), "The tests empty every table, so the database name must end with _test"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-characters-long"
os.environ["RESEND_API_KEY"] = ""  # emails are skipped during tests
# Fake Cloudinary credentials (the real service is never called; see fake_cloudinary).
os.environ["CLOUDINARY_CLOUD_NAME"] = "test-cloud"
os.environ["CLOUDINARY_API_KEY"] = "test-key"
os.environ["CLOUDINARY_API_SECRET"] = "test-secret"

# "noqa: E402" = "yes, these imports come after code on purpose" (the env vars had to be set first).
import threading  # noqa: E402
from concurrent.futures import ThreadPoolExecutor  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from pathlib import Path  # noqa: E402
from urllib.parse import parse_qs, urlparse  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
# TestClient = calls the FastAPI app in memory, like a browser would, without starting a server.
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[1]     # the backend folder
PASSWORD = "password123"                              # every test user's password


# scope="session" = run ONCE for the whole test run. autouse=True = always, without being asked for.
@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    """Build the test database with the real Alembic migration, so the migration is tested too."""
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    command.upgrade(config, "head")


# Runs before EVERY test: start each test with an empty database.
@pytest.fixture(autouse=True)
def empty_database():
    with engine.begin() as connection:
        # CASCADE also empties every table that points to companies.
        connection.execute(text("TRUNCATE TABLE companies CASCADE"))


# Runs before every test: replace Cloudinary's upload function with a fake that returns a fixed URL.
@pytest.fixture(autouse=True)
def fake_cloudinary(monkeypatch):
    """Never call the real Cloudinary in tests. The CV checks in upload_cv still run."""
    monkeypatch.setattr(
        "cloudinary.uploader.upload",
        # *args, **kwargs = accept any arguments.
        lambda *args, **kwargs: {"secure_url": "https://res.cloudinary.com/test-cloud/raw/upload/cv.pdf"},
    )


# Every module that imported send_email. Each has its OWN reference to the function,
# so each must be replaced separately.
EMAIL_SENDERS = [
    "app.auth.router",
    "app.candidates.router",
    "app.candidates.public_router",
    "app.core.notifications",
    "app.interviews.router",
    "app.reports.router",
    "app.reports.send_progress_reports",
    "app.users.router",
]


# Ask for "outbox" in a test to capture emails instead of sending them.
@pytest.fixture
def outbox(monkeypatch):
    """Every email the app sends during the test, as dicts with to, subject and text."""
    sent = []
    for module in EMAIL_SENDERS:
        # The fake appends the message to the list. "... or True": append() returns None,
        # so "None or True" = True, i.e. "sent successfully", like the real send_email.
        monkeypatch.setattr(f"{module}.send_email", lambda **message: sent.append(message) or True)
    return sent


@pytest.fixture
def client():
    return TestClient(app)


# A ready-made company with every role, built through the REAL API (so it tests the API too).
class World:
    """One company: an admin, a hiring manager, two interviewers and one open job."""

    def __init__(self, client: TestClient):
        self.client = client
        # Register the company + admin.
        response = client.post(
            "/auth/register",
            json={"company_name": "Acme", "full_name": "Ada Admin", "email": "admin@acme.com", "password": PASSWORD},
        )
        # The message after the comma is shown if the assert fails, which makes debugging easier.
        assert response.status_code == 201, response.text
        # self.admin = the admin's Authorization header, to pass as headers=world.admin.
        self.admin = self.login("admin@acme.com")
        self.manager_headers = {}
        self.interviewer_headers = {}

        # Invite and accept: one hiring manager and two interviewers (Ann and Bob).
        self.manager_id, self.manager = self.add_user("manager@acme.com", "hiring_manager")
        self.ann_id, self.ann = self.add_user("ann@acme.com", "interviewer")
        self.bob_id, self.bob = self.add_user("bob@acme.com", "interviewer")
        # One open job owned by the manager.
        self.job_id = self.add_job(hiring_manager_id=self.manager_id)

    # Log in and return {"Authorization": "Bearer ..."}.
    def login(self, email: str) -> dict:
        # data=... sends a FORM (what /auth/login expects), not JSON.
        response = self.client.post("/auth/login", data={"username": email, "password": PASSWORD})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    # Invite someone, accept the invite, log them in. Returns (user id, auth headers).
    def add_user(self, email: str, role: str) -> tuple[str, dict]:
        response = self.client.post(
            "/users",
            headers=self.admin,
            json={"email": email, "full_name": email.split("@")[0].title(), "role": role},
        )
        assert response.status_code == 201, response.text
        # Take the token out of the invite link: ".../accept-invite?token=XYZ" -> "XYZ".
        token = parse_qs(urlparse(response.json()["invite_url"]).query)["token"][0]
        accepted = self.client.post("/auth/accept-invite", json={"token": token, "password": PASSWORD})
        assert accepted.status_code == 201, accepted.text
        headers = self.login(email)
        if role == "hiring_manager":
            self.manager_headers[accepted.json()["id"]] = headers
        else:
            self.interviewer_headers[accepted.json()["id"]] = headers
        return accepted.json()["id"], headers

    # Create a job as its hiring manager, then set its status (open by default).
    def add_job(self, hiring_manager_id: str | None, status: str = "open") -> str:
        owner_id = hiring_manager_id or self.manager_id
        owner_headers = self.manager_headers[owner_id]
        response = self.client.post(
            "/jobs",
            headers=owner_headers,
            json={"title": "Backend Developer", "description": "Build APIs"},
        )
        assert response.status_code == 201, response.text
        job_id = response.json()["id"]
        response = self.client.patch(f"/jobs/{job_id}", headers=owner_headers, json={"status": status})
        assert response.status_code == 200, response.text
        return job_id

    # A candidate applies (old style: the CV file in the request). Returns the application id.
    def apply(self, email: str = "cathy@gmail.com", job_id: str | None = None) -> str:
        """A candidate applies through the public endpoint. Returns the application id."""
        response = self.client.post(
            f"/public/jobs/{job_id or self.job_id}/applications",
            data={"full_name": "Cathy Candidate", "email": email, "phone": "+2348012345678"},
            # files= sends a file: (filename, bytes, content type).
            files={"cv": ("cv.pdf", b"%PDF-1.4 fake cv", "application/pdf")},
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    # A fixed future time: the day after tomorrow at hour:minute UTC.
    # @staticmethod = doesn't need "self".
    @staticmethod
    def slot(hour: int, minute: int = 0) -> datetime:
        """A time in the future: the day after tomorrow, at the given hour (UTC)."""
        day = datetime.now(timezone.utc) + timedelta(days=2)
        return day.replace(hour=hour, minute=minute, second=0, microsecond=0)

    # Assign an interviewer AND have them schedule it. Returns the schedule response.
    # If custom headers are given (e.g. testing a forbidden role), only try the assignment.
    def schedule(self, application_id: str, interviewer_id: str, start: datetime, minutes: int = 60, headers=None):
        assignment = self.client.post(
            "/interviews",
            headers=headers or self.manager,
            json={"application_id": application_id, "interviewer_id": interviewer_id},
        )
        if headers is not None or assignment.status_code != 201:
            return assignment
        return self.client.patch(
            f"/interviews/{assignment.json()['id']}/schedule",
            headers=self.interviewer_headers[interviewer_id],
            json={
                "starts_at": start.isoformat(),
                "duration_minutes": minutes,
                "meeting_type": "virtual",
                "meeting_url": "https://meet.google.com/test-room",
            },
        )

    # "Time travel": move interviews 3 days into the past, so scorecards can be submitted.
    # (The API refuses past times, so we edit the database directly.)
    @staticmethod
    def hold(*interview_ids: str) -> None:
        """Let time pass: move scheduled interviews three days back, so they have already started."""
        with engine.begin() as connection:
            for interview_id in interview_ids:
                connection.execute(
                    text(
                        "UPDATE interviews SET starts_at = starts_at - interval '3 days',"
                        " ends_at = ends_at - interval '3 days' WHERE id = :id"
                    ),
                    {"id": interview_id},           # :id is a bound parameter (safe from SQL injection)
                )

    # Fire several requests at the SAME moment from different threads, to test race conditions.
    def parallel(self, *calls):
        """Send requests at the same moment, each from its own thread. A call is (method, url, kwargs)."""
        # A Barrier makes every thread wait until ALL have reached it, then releases them together.
        barrier = threading.Barrier(len(calls))

        def send(call):
            method, url, kwargs = call
            thread_client = TestClient(app)     # one client per thread
            barrier.wait()                      # wait for the others... then go!
            return thread_client.request(method, url, **kwargs)

        # Run send() for each call on its own thread and collect the responses.
        with ThreadPoolExecutor(max_workers=len(calls)) as pool:
            return list(pool.map(send, calls))


# Ask for "world" in a test to get the whole company set up.
@pytest.fixture
def world(client):
    return World(client)
```

### Two example tests, explained
```python
# From tests/test_candidates.py: proves the row lock works (Part 7).
def test_simultaneous_stage_changes_keep_the_history_consistent(world):
    application_id = world.apply()
    # The same "move to screen" request...
    call = ("PATCH", f"/applications/{application_id}/stage", {"headers": world.manager, "json": {"stage": "screen"}})

    # ...sent three times at exactly the same moment.
    responses = world.parallel(call, call, call)

    # Only one request wins. The others find the candidate already in "screen" and are refused.
    assert sorted(response.status_code for response in responses) == [200, 409, 409]
    # And the history has exactly ONE move, not three.
    history = world.client.get(f"/applications/{application_id}/history", headers=world.manager).json()
    assert [(row["from_stage"], row["to_stage"]) for row in history] == [(None, "applied"), ("applied", "screen")]


# From tests/test_interviews.py: proves the exclusion constraint works (Part 8).
def test_overlapping_interviews_for_the_same_interviewer_are_rejected(world):
    first_application = world.apply(email="one@gmail.com")
    second_application = world.apply(email="two@gmail.com")
    # Ann has 10:00-11:00.
    assert world.schedule(first_application, world.ann_id, world.slot(10), minutes=60).status_code == 200  # 10:00-11:00

    # Overlaps at the end, at the start, and fully inside the first interview: all refused with 409.
    assert world.schedule(second_application, world.ann_id, world.slot(10, 30), minutes=60).status_code == 409
    assert world.schedule(second_application, world.ann_id, world.slot(9, 30), minutes=60).status_code == 409
    assert world.schedule(second_application, world.ann_id, world.slot(10, 15), minutes=15).status_code == 409
```

**The test files and what they cover:**

| File | Covers |
|---|---|
| `test_auth.py` | Register, login, Google (faked), roles, invitations, company isolation |
| `test_candidates.py` | Applying, duplicates, stage rules, decisions, assessment emails, sorting, manager scope, simultaneous moves |
| `test_interviews.py` | Assigning, scheduling, overlaps, back-to-back slots, cancelling, permissions |
| `test_scorecards.py` | Submitting, validation, double submit, privacy rule, aggregate, timing |
| `test_uploads.py` | Signed uploads, real-size checks, invalid references |
| `test_invitation_email.py` | Invite emails, failure reporting, resend/revoke, SMTP |
| `test_progress.py` | Password change, admin notifications, progress reports |

Run them from `backend/` with `pytest -q`. All 73 should pass.
