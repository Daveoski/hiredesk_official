from pydantic import BaseModel, Field

from app.users.schemas import LowerEmail


class RegisterRequest(BaseModel):
    """Creates a new company and its first user, who becomes the company admin."""

    company_name: str = Field(min_length=1, max_length=100)
    full_name: str = Field(min_length=1, max_length=100)
    email: LowerEmail
    password: str = Field(min_length=8, max_length=128)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
