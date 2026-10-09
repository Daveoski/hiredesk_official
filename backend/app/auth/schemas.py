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
    # Only the register page sets this: a Google email with no account and no invitation
    # then gets a new company. From the login page it is an error instead.
    create_company: bool = False
    # Sent from the accept-invite page so a mismatched Google account gets a clear error.
    invite_token: str | None = Field(default=None, min_length=20, max_length=200)


class ChangePasswordRequest(BaseModel):
    """Required: the current password, unless the account has only ever signed in with Google."""

    current_password: str | None = Field(default=None, max_length=128)
    password: str = Field(min_length=8, max_length=128)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
