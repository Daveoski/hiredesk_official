import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint
from sqlmodel import Field, SQLModel

from app.db.common import TIMESTAMPTZ, enum_column


class ScorecardStatus(StrEnum):
    pending = "pending"  # created when the interview is scheduled
    submitted = "submitted"  # filled in by the interviewer, cannot be changed


class Recommendation(StrEnum):
    recommend = "recommend"
    maybe = "maybe"
    not_recommend = "not_recommend"


class Scorecard(SQLModel, table=True):
    """One scorecard per interview. The interviewer is the interview's interviewer."""

    __tablename__ = "scorecards"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    interview_id: uuid.UUID = Field(foreign_key="interviews.id", unique=True, index=True)
    status: ScorecardStatus = Field(default=ScorecardStatus.pending, sa_type=enum_column(ScorecardStatus))
    recommendation: Recommendation | None = Field(default=None, sa_type=enum_column(Recommendation))
    submitted_at: datetime | None = Field(default=None, sa_type=TIMESTAMPTZ)


class ScorecardRating(SQLModel, table=True):
    """One criterion on a scorecard, rated 1 to 5, with an optional comment."""

    __tablename__ = "scorecard_ratings"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="ck_scorecard_ratings_rating"),)

    scorecard_id: uuid.UUID = Field(foreign_key="scorecards.id", primary_key=True)
    criterion: str = Field(primary_key=True, max_length=100)
    rating: int
    comment: str | None = None
