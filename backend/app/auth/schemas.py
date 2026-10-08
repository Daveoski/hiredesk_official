from pydantic import BaseModel, Field

from app.users.schemas import LowerEmail


class RegisterRequest(BaseModel):
    """Creates a new company and its first user, who becomes the company admin."""

    company_name: str = Field(min_length=1, max_length=100)
    full_name: str = Field(min_length=1, max_length=100)
    email: LowerEmail
    password: str = Field(min_length=8, max_length=128)


class GoogleAuthRequest(BaseModel):
    """Authenticates a user with a Google-issued ID token."""

    id_token: str = Field(min_length=1)
    company_name: str | None = Field(default=None, min_length=1, max_length=100)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
