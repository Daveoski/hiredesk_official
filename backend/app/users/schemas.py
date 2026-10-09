import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

from app.users.models import Role

# Emails are stored in lowercase so "Ann@x.com" and "ann@x.com" are the same person.
LowerEmail = Annotated[EmailStr, AfterValidator(lambda email: email.lower())]


class UserInviteCreate(BaseModel):
    email: LowerEmail
    full_name: str = Field(min_length=1, max_length=100)
    role: Literal["hiring_manager", "interviewer"]


class UserInvitationRead(BaseModel):
    email: str
    full_name: str
    role: Role
    expires_at: datetime
    invite_url: str
    # False when the invitation email could not be sent; the admin then shares invite_url another way.
    email_sent: bool


class AcceptInvitation(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    email: str
    full_name: str
    role: Role
    password_login_enabled: bool
