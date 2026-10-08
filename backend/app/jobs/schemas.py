import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.jobs.models import JobStatus, Stage


class JobCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    qualification_requirements: str = Field(default="", max_length=5000)
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def valid_salary_range(self):
        if self.salary_min is not None and self.salary_max is not None and self.salary_min > self.salary_max:
            raise ValueError("salary_min cannot exceed salary_max")
        return self


class JobUpdate(BaseModel):
    """Only fields owned by the hiring manager are editable."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=10000)
    qualification_requirements: str | None = Field(default=None, max_length=5000)
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)
    status: JobStatus | None = None
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


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
    stages: list[Stage] = list(Stage)
