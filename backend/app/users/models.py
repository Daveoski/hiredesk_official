import uuid
from datetime import datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel

from app.db.common import TIMESTAMPTZ, enum_column, utcnow


class Role(StrEnum):
    company_admin = "company_admin"
    hiring_manager = "hiring_manager"
    interviewer = "interviewer"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="companies.id")
    # The unique index on email is also what makes the login lookup fast.
    email: str = Field(unique=True, index=True)
    full_name: str
    hashed_password: str
    password_login_enabled: bool = Field(default=True, nullable=False)
    role: Role = Field(sa_type=enum_column(Role))


class Invitation(SQLModel, table=True):
    __tablename__ = "invitations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    company_id: uuid.UUID = Field(foreign_key="companies.id", index=True)
    invited_by_id: uuid.UUID = Field(foreign_key="users.id")
    email: str = Field(index=True)
    full_name: str
    role: Role = Field(sa_type=enum_column(Role))
    token_hash: str = Field(unique=True, index=True)
    expires_at: datetime = Field(sa_type=TIMESTAMPTZ)
    accepted_at: datetime | None = Field(default=None, sa_type=TIMESTAMPTZ)
    created_at: datetime = Field(default_factory=utcnow, sa_type=TIMESTAMPTZ)
