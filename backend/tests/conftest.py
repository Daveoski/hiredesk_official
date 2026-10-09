import os

# These must be set BEFORE the app is imported, because the app reads them at import time.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5433/hiredesk_test"
)
assert TEST_DATABASE_URL.endswith("_test"), "The tests empty every table, so the database name must end with _test"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-characters-long"
os.environ["RESEND_API_KEY"] = ""  # emails are skipped during tests
os.environ["CLOUDINARY_CLOUD_NAME"] = "test-cloud"
os.environ["CLOUDINARY_API_KEY"] = "test-key"
os.environ["CLOUDINARY_API_SECRET"] = "test-secret"

import threading  # noqa: E402
from concurrent.futures import ThreadPoolExecutor  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from pathlib import Path  # noqa: E402
from urllib.parse import parse_qs, urlparse  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PASSWORD = "password123"


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    """Build the test database with the real Alembic migration, so the migration is tested too."""
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
def empty_database():
    with engine.begin() as connection:
        # CASCADE also empties every table that points to companies.
        connection.execute(text("TRUNCATE TABLE companies CASCADE"))


@pytest.fixture(autouse=True)
def fake_cloudinary(monkeypatch):
    """Never call the real Cloudinary in tests. The CV checks in upload_cv still run."""
    monkeypatch.setattr(
        "cloudinary.uploader.upload",
        lambda *args, **kwargs: {"secure_url": "https://res.cloudinary.com/test-cloud/raw/upload/cv.pdf"},
    )


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


@pytest.fixture
def outbox(monkeypatch):
    """Every email the app sends during the test, as dicts with to, subject and text."""
    sent = []
    for module in EMAIL_SENDERS:
        monkeypatch.setattr(f"{module}.send_email", lambda **message: sent.append(message) or True)
    return sent


@pytest.fixture
def client():
    return TestClient(app)


class World:
    """One company: an admin, a hiring manager, two interviewers and one open job."""

    def __init__(self, client: TestClient):
        self.client = client
        response = client.post(
            "/auth/register",
            json={"company_name": "Acme", "full_name": "Ada Admin", "email": "admin@acme.com", "password": PASSWORD},
        )
        assert response.status_code == 201, response.text
        self.admin = self.login("admin@acme.com")
        self.manager_headers = {}
        self.interviewer_headers = {}

        self.manager_id, self.manager = self.add_user("manager@acme.com", "hiring_manager")
        self.ann_id, self.ann = self.add_user("ann@acme.com", "interviewer")
        self.bob_id, self.bob = self.add_user("bob@acme.com", "interviewer")
        self.job_id = self.add_job(hiring_manager_id=self.manager_id)

    def login(self, email: str) -> dict:
        response = self.client.post("/auth/login", data={"username": email, "password": PASSWORD})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def add_user(self, email: str, role: str) -> tuple[str, dict]:
        response = self.client.post(
            "/users",
            headers=self.admin,
            json={"email": email, "full_name": email.split("@")[0].title(), "role": role},
        )
        assert response.status_code == 201, response.text
        token = parse_qs(urlparse(response.json()["invite_url"]).query)["token"][0]
        accepted = self.client.post("/auth/accept-invite", json={"token": token, "password": PASSWORD})
        assert accepted.status_code == 201, accepted.text
        headers = self.login(email)
        if role == "hiring_manager":
            self.manager_headers[accepted.json()["id"]] = headers
        else:
            self.interviewer_headers[accepted.json()["id"]] = headers
        return accepted.json()["id"], headers

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

    def apply(self, email: str = "cathy@gmail.com", job_id: str | None = None) -> str:
        """A candidate applies through the public endpoint. Returns the application id."""
        response = self.client.post(
            f"/public/jobs/{job_id or self.job_id}/applications",
            data={"full_name": "Cathy Candidate", "email": email, "phone": "+2348012345678"},
            files={"cv": ("cv.pdf", b"%PDF-1.4 fake cv", "application/pdf")},
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    @staticmethod
    def slot(hour: int, minute: int = 0) -> datetime:
        """A time in the future: the day after tomorrow, at the given hour (UTC)."""
        day = datetime.now(timezone.utc) + timedelta(days=2)
        return day.replace(hour=hour, minute=minute, second=0, microsecond=0)

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

    def parallel(self, *calls):
        """Send requests at the same moment, each from its own thread. A call is (method, url, kwargs)."""
        barrier = threading.Barrier(len(calls))

        def send(call):
            method, url, kwargs = call
            thread_client = TestClient(app)
            barrier.wait()
            return thread_client.request(method, url, **kwargs)

        with ThreadPoolExecutor(max_workers=len(calls)) as pool:
            return list(pool.map(send, calls))


@pytest.fixture
def world(client):
    return World(client)
