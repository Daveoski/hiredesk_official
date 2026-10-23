# Part 1: Backend foundation (copyable)

`main.py` (where the app starts), `core/config.py` (settings), `db/session.py` (database connection) and `db/common.py` (shared column helpers).

## `backend/app/main.py`
```python
# ── main.py: the entry point. Creates the web app and plugs every feature into it. ──

# FastAPI is the web framework. Creating a FastAPI() object gives us an app that answers HTTP requests.
from fastapi import FastAPI
# CORS = Cross-Origin Resource Sharing. Browsers block a page on one website (hiredesk-app.vercel.app)
# from calling an API on another (hiredesk-api.vercel.app) unless the API says that website is allowed.
from fastapi.middleware.cors import CORSMiddleware
# text() lets us send a raw SQL string to the database (used once, in the health check).
from sqlalchemy import text

# Each feature folder has a router.py file holding a variable called "router" (a group of endpoints).
# They all share the name "router", so we rename each one on import to avoid a clash.
from app.auth.router import router as auth_router               # /auth  : register, login, Google, invites
from app.candidates.public_router import router as public_router  # /public/jobs : apply without an account
from app.candidates.router import router as candidates_router   # /applications : the hiring pipeline
from app.companies.router import router as companies_router     # /companies/me
from app.core.config import get_settings                        # reads settings (see config.py)
from app.db.session import DbSession                            # "give me a database session" (see session.py)
from app.interviews.router import router as interviews_router   # /interviews
from app.jobs.router import router as jobs_router               # /jobs
from app.reports.router import router as reports_router         # /reports : admin progress report
from app.scorecards.router import router as scorecards_router   # scorecards
from app.users.router import router as users_router             # /users : team and invitations

# Create THE application. Vercel looks for a variable named exactly "app" in app/main.py.
# title/description/version only appear on the automatic docs page at /docs.
app = FastAPI(
    title="HirePlume API",
    description="Applicant tracking for small companies. Interactive docs: /docs",
    version="0.1.0",
)

# Middleware = code that wraps EVERY request. Here: the CORS rules.
app.add_middleware(
    CORSMiddleware,
    # Allowed websites. cors_origins is one string like "https://a.com,https://b.com".
    # split(",") makes a list, strip() removes spaces, "if origin.strip()" skips empty pieces.
    allow_origins=[origin.strip() for origin in get_settings().cors_origins.split(",") if origin.strip()],
    # A pattern for extra allowed sites, e.g. Vercel preview addresses that change on every deploy.
    allow_origin_regex=get_settings().cors_origin_regex,
    # Allow the browser to send credentials such as the Authorization header.
    allow_credentials=True,
    # Any HTTP method (GET, POST, PUT, PATCH, DELETE) and any header, but only from the allowed sites.
    allow_methods=["*"],
    allow_headers=["*"],
)

# Plug each group of endpoints into the app. Without these lines nobody could reach them.
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(companies_router)
app.include_router(jobs_router)
app.include_router(public_router)
app.include_router(candidates_router)
app.include_router(interviews_router)
app.include_router(scorecards_router)
app.include_router(reports_router)


# A decorator (@...) registers the function below as the handler for GET /health.
# tags=["Health"] only groups it on the /docs page.
@app.get("/health", tags=["Health"])
# "db: DbSession" = dependency injection: FastAPI opens a database session and passes it in.
def health(db: DbSession):
    """Returns 200 when the API is running and the database answers."""
    # The simplest SQL query. If the database is down, this raises an error and the endpoint fails.
    db.exec(text("SELECT 1"))
    # Returning a dict makes FastAPI send JSON {"status": "ok"} with status 200.
    return {"status": "ok"}
```

## `backend/app/core/config.py`
```python
# ── config.py: every setting comes from environment variables (or the .env file). No secrets in code. ──

# lru_cache remembers a function's result so it only runs once.
from functools import lru_cache
# Path handles file paths the same way on Windows, Mac and Linux.
from pathlib import Path

# Field adds rules to a setting (e.g. minimum length). field_validator runs custom code on a value.
from pydantic import Field, field_validator
# BaseSettings fills its fields automatically from environment variables.
from pydantic_settings import BaseSettings, SettingsConfigDict

# Find backend/.env no matter which folder the server is started from:
# __file__ = .../backend/app/core/config.py ; parents[0]=core, [1]=app, [2]=backend ; then add ".env".
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    """All configuration comes from environment variables (or a .env file)."""

    # Also read the .env file. extra="ignore" = skip unknown variables instead of raising an error.
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    # Each line is: name: type = default. The name matches the env variable (DATABASE_URL -> database_url).
    # No default = REQUIRED: the app refuses to start without it (fail early, with a clear error).
    database_url: str
    # Required and at least 32 characters. It signs login tokens; a short secret could be guessed.
    jwt_secret: str = Field(min_length=32)
    # "480" text from the environment is converted to the number 480. Session length in minutes.
    access_token_expire_minutes: int = 480  # one working day
    # The website address, used to build links inside emails (invites, dashboard).
    frontend_base_url: str = "http://localhost:3000"
    # Websites allowed to call the API (used by CORS in main.py). Default = local development.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    # Optional. Also allow origins matching this regex, e.g. Vercel preview deployments:
    #   https://hireplume-frontend-.*\.vercel\.app
    # "str | None" = text or nothing; default nothing.
    cors_origin_regex: str | None = None

    # Google sign-in is OFF unless switched on. "true"/"false" text becomes True/False.
    google_auth_enabled: bool = False
    google_client_id: str = ""

    # File storage (CVs). Empty string = not configured; the upload code checks and returns 503.
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # Email through Resend. Empty key = emails are skipped with a warning.
    resend_api_key: str = ""
    email_from: str = "HirePlume <onboarding@resend.dev>"

    # Optional SMTP sending, used instead of Resend when SMTP_HOST is set.
    # Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USERNAME=you@gmail.com,
    # SMTP_PASSWORD=<16-character app password>.
    smtp_host: str = ""
    smtp_port: int = 587          # 587 = standard port for sending mail with encryption (STARTTLS)
    smtp_username: str = ""
    smtp_password: str = ""

    # Run this function on database_url while the settings load.
    @field_validator("database_url")
    # Pydantic validators must be class methods (they belong to the class, not one object).
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        """Hosted Postgres (Neon on Vercel) hands out postgres:// URLs; SQLAlchemy needs the psycopg 3 driver."""
        # Neon gives "postgres://user:pw@host/db". SQLAlchemy must be told the driver: "postgresql+psycopg://".
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                # Swap the start: postgres://x -> postgresql+psycopg://x
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        # Already in the right format (local development): keep it.
        return url


# Read and validate the settings ONCE, then reuse the same object everywhere.
# A function (not a global) so tests can change values, and nothing is read until first needed.
@lru_cache
def get_settings() -> Settings:
    return Settings()
```

## `backend/app/db/session.py`
```python
# ── session.py: how every request gets its own database connection. ──

# Iterator = type hint for a function that "yield"s values.
from collections.abc import Iterator
# Annotated attaches extra info to a type; here: "how FastAPI should create it".
from typing import Annotated

# Depends marks something as a dependency for FastAPI to provide.
from fastapi import Depends
# create_engine connects to the database. A Session is one unit of work (read, change, commit).
from sqlmodel import Session, create_engine

from app.core.config import get_settings

# The ENGINE is created once when this file is imported. It knows the database address and keeps
# a POOL of open connections to reuse (opening a new connection per request is slow).
# pool_pre_ping=True: test a pooled connection before reusing it (hosted databases close idle ones).
# prepare_threshold=None turns off server-side prepared statements, which a connection
# pooler in transaction mode (Neon's pooled DATABASE_URL on Vercel) cannot share.
engine = create_engine(get_settings().database_url, pool_pre_ping=True, connect_args={"prepare_threshold": None})


# A generator function (uses yield). FastAPI calls it once per request.
def get_db() -> Iterator[Session]:
    # One session per request. expire_on_commit=False keeps objects readable after commit()
    # (e.g. you can still read user.email after saving, without another query).
    # "with" guarantees the session is closed afterwards, even if an error happens.
    with Session(engine, expire_on_commit=False) as session:
        # Hand the session to the endpoint and PAUSE. When the endpoint finishes, code resumes here,
        # the "with" block ends and the session closes.
        yield session


# A reusable type: "a Session that FastAPI gets by calling get_db".
# Writing "db: DbSession" in any endpoint is all you need to receive a database session.
DbSession = Annotated[Session, Depends(get_db)]
```

## `backend/app/db/common.py`
```python
# ── common.py: small helpers shared by every model. ──

from datetime import datetime, timezone
# Python's own Enum, renamed because SQLAlchemy's Enum (below) has the same name.
from enum import Enum as PythonEnum

# DateTime and Enum are SQLAlchemy column types.
from sqlalchemy import DateTime, Enum

# Every datetime column stores a timezone-aware timestamp (timestamptz).
# "10:00" is then never ambiguous between Lagos and London. Models use: sa_type=TIMESTAMPTZ.
TIMESTAMPTZ = DateTime(timezone=True)


# "Now" in UTC, always with a time zone attached. A plain datetime.now() has no time zone and
# comparing it with database times would fail. One helper everywhere prevents that mistake.
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Takes an enum class (e.g. Role) and returns a database column type for it.
def enum_column(enum_class: type[PythonEnum]) -> Enum:
    """Store a Python enum as a plain VARCHAR(20) holding the enum values.

    Plain text avoids PostgreSQL ENUM types, which are awkward to change in migrations.
    """
    return Enum(
        enum_class,
        # Store as ordinary text, not a PostgreSQL ENUM type (those are painful to change later).
        native_enum=False,
        # The text column holds at most 20 characters.
        length=20,
        # Store the enum's VALUE ("hiring_manager"), not its Python name.
        # lambda = a tiny unnamed function: given the members, return their values.
        values_callable=lambda members: [member.value for member in members],
    )
```

**Remember:**
- `main.py` builds the app, allows the frontend through CORS, plugs in all the routers, and adds `/health`.
- `config.py` turns environment variables into a typed, validated `Settings` object, read once.
- `session.py` creates one shared engine (with a connection pool) and gives every request its own session through `DbSession`.
- `common.py` makes every timestamp time-zone aware and stores enums as plain text.
