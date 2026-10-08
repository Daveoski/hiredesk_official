from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.auth.router import router as auth_router
from app.candidates.public_router import router as public_router
from app.candidates.router import router as candidates_router
from app.companies.router import router as companies_router
from app.core.config import get_settings
from app.db.session import DbSession
from app.interviews.router import router as interviews_router
from app.jobs.router import router as jobs_router
from app.scorecards.router import router as scorecards_router
from app.users.router import router as users_router

app = FastAPI(
    title="HireDesk API",
    description="Applicant tracking for small companies. Interactive docs: /docs",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in get_settings().cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(companies_router)
app.include_router(jobs_router)
app.include_router(public_router)
app.include_router(candidates_router)
app.include_router(interviews_router)
app.include_router(scorecards_router)


@app.get("/health", tags=["Health"])
def health(db: DbSession):
    """Returns 200 when the API is running and the database answers."""
    db.exec(text("SELECT 1"))
    return {"status": "ok"}
