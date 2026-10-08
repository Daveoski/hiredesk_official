import uuid
from datetime import datetime, timezone

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.interviews.models import InterviewStatus, MeetingType


class InterviewCreate(BaseModel):
    application_id: uuid.UUID
    interviewer_id: uuid.UUID


class InterviewSchedule(BaseModel):
    starts_at: AwareDatetime
    duration_minutes: int = Field(ge=15, le=240)
    meeting_type: MeetingType
    meeting_url: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=500)

    @field_validator("starts_at")
    @classmethod
    def must_be_in_the_future(cls, starts_at: datetime) -> datetime:
        if starts_at <= datetime.now(timezone.utc):
            raise ValueError("starts_at must be in the future")
        return starts_at

    @model_validator(mode="after")
    def meeting_details_match_type(self):
        if self.meeting_type == MeetingType.virtual and not self.meeting_url:
            raise ValueError("A meeting link is required for a virtual interview")
        if self.meeting_type == MeetingType.in_person and not self.location:
            raise ValueError("A location is required for an in-person interview")
        return self


class InterviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    interviewer_id: uuid.UUID
    starts_at: datetime | None
    ends_at: datetime | None
    status: InterviewStatus
    meeting_type: MeetingType | None
    meeting_url: str | None
    location: str | None

    @computed_field
    @property
    def duration_minutes(self) -> int | None:
        if self.starts_at is None or self.ends_at is None:
            return None
        return int((self.ends_at - self.starts_at).total_seconds() // 60)
