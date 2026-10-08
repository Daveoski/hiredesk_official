import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.scorecards.models import Recommendation, ScorecardStatus


class RatingInput(BaseModel):
    criterion: str = Field(min_length=1, max_length=100)
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


class ScorecardSubmit(BaseModel):
    ratings: list[RatingInput] = Field(min_length=1, max_length=20)
    recommendation: Recommendation | None = None

    @model_validator(mode="after")
    def criteria_must_be_unique(self):
        criteria = [item.criterion.strip().lower() for item in self.ratings]
        if len(criteria) != len(set(criteria)):
            raise ValueError("Each criterion can only be rated once")
        return self


class RatingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    criterion: str
    rating: int
    comment: str | None


class ScorecardRead(BaseModel):
    id: uuid.UUID
    interview_id: uuid.UUID
    interviewer_id: uuid.UUID
    status: ScorecardStatus
    recommendation: Recommendation | None
    submitted_at: datetime | None
    ratings: list[RatingRead]

    @computed_field
    @property
    def average_score(self) -> float | None:
        """The average of this scorecard's ratings."""
        if not self.ratings:
            return None
        return round(sum(item.rating for item in self.ratings) / len(self.ratings), 2)


class ApplicationScorecards(BaseModel):
    # Only managers get the aggregate: the average of the submitted scorecards' averages.
    aggregate_score: float | None
    scorecards: list[ScorecardRead]
