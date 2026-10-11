# Part 3: Security: passwords, tokens, roles, permissions (copyable)

1. **How are passwords stored safely?** `core/security.py`
2. **How does the server know who is calling?** `core/security.py` + `auth/dependencies.py`
3. **What is each person allowed to see and do?** `auth/dependencies.py` + `auth/permissions.py`

Plus the two **schema** files that define what the login and team endpoints accept and return.

## `backend/app/core/security.py`
```python
# ── security.py: password hashing and login tokens (JWT). ──

import uuid
# timedelta = a length of time ("480 minutes"); timezone.utc = universal time.
from datetime import datetime, timedelta, timezone

# PyJWT: creates and checks JSON Web Tokens.
import jwt
# pwdlib: a small library for password hashing.
from pwdlib import PasswordHash

from app.core.config import get_settings

# HS256 = HMAC with SHA-256: the token is signed with ONE secret key (JWT_SECRET).
# The same key both signs and checks, so it must never leave the server.
ALGORITHM = "HS256"

# Argon2 is the current recommended password hashing algorithm.
# A HASH is a one-way scramble: you can check a password against it but never turn it back.
# Argon2 is deliberately slow and memory-hungry, so someone who steals the database
# can't try billions of guesses quickly. It also adds a random "salt" to every hash,
# so two users with the same password get different hashes.
password_hash = PasswordHash.recommended()


# Turn a plain password into a hash to store, e.g. "$argon2id$v=19$m=65536,t=3,p=4$...".
def hash_password(password: str) -> str:
    return password_hash.hash(password)


# Check a typed password against the stored hash. Returns True or False; never reveals the password.
def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


# Make a login token for a user (called after a successful login or Google sign-in).
def create_access_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    # The token stops working after ACCESS_TOKEN_EXPIRE_MINUTES (480 = 8 hours).
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    # The PAYLOAD = what the token says.
    #   "sub" (subject) = who: the user's id as text.
    #   "exp" (expiry)  = until when. PyJWT checks it automatically when decoding.
    # Only the id goes in: anyone can READ a JWT's payload, so never put secrets in it.
    payload = {"sub": str(user_id), "exp": expires_at}
    # Sign it with the secret. Result: "header.payload.signature" (three base64 parts with dots).
    # If anyone changes the payload, the signature no longer matches and the token is rejected.
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


# Read a token sent by the browser and return the user id inside, or None if it's no good.
def decode_access_token(token: str) -> uuid.UUID | None:
    """Return the user id inside a valid token, or None if the token is invalid or expired."""
    try:
        # Checks the signature (made with OUR secret?) and the expiry (still valid?).
        # algorithms=[ALGORITHM] stops an attacker choosing a weaker algorithm.
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
        # Convert the "sub" text back into a UUID.
        return uuid.UUID(payload["sub"])
    # Any problem = not logged in:
    #   PyJWTError: bad signature, expired, malformed;  KeyError: no "sub";  ValueError: "sub" isn't a UUID.
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
```

## `backend/app/auth/dependencies.py`
```python
# ── dependencies.py: reusable "who is calling?" and "is their role allowed?" checks. ──
# Endpoints ask for these by TYPE (e.g. "manager: HiringManagerUser") and FastAPI runs them first.

from typing import Annotated

from fastapi import Depends, HTTPException
# OAuth2PasswordBearer reads the "Authorization: Bearer <token>" header from the request.
from fastapi.security import OAuth2PasswordBearer

from app.core.security import decode_access_token
from app.db.session import DbSession
from app.users.models import Role, User

# tokenUrl lets the Swagger "Authorize" button log in through /auth/login.
# (It only affects the /docs page. If the header is missing, this dependency itself returns 401.)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


# AUTHENTICATION: who is calling?
# FastAPI first runs oauth2_scheme (gives us the token text) and get_db (gives us a session).
def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> User:
    """Authentication: who is calling? The user is loaded from the database on every request."""
    # Check the token's signature and expiry; get the user id (or None).
    user_id = decode_access_token(token)
    # Load the user fresh from the database. This means a deleted user, or a changed role,
    # takes effect immediately, even if their token hasn't expired yet.
    # "x if condition else y" is Python's one-line if/else.
    user = db.get(User, user_id) if user_id else None
    if user is None:
        # 401 Unauthorized = "I don't know who you are". The frontend logs the user out on this.
        # The WWW-Authenticate header is the standard way to say "send a Bearer token".
        raise HTTPException(401, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    return user


# Shortcut type: writing "user: CurrentUser" in an endpoint = "must be logged in; give me the user".
CurrentUser = Annotated[User, Depends(get_current_user)]


# AUTHORIZATION BY ROLE. This is a FACTORY: a function that builds and returns another function.
# require_roles(Role.company_admin) returns a check that only lets admins through.
# *allowed_roles = accept any number of roles.
def require_roles(*allowed_roles: Role):
    """Authorization by role: only the listed roles may call the endpoint."""

    # The real check. It depends on CurrentUser, so logging in is checked FIRST (401), then the role (403).
    def check_role(user: CurrentUser) -> User:
        if user.role not in allowed_roles:
            # 403 Forbidden = "I know who you are, but your role can't do this".
            raise HTTPException(403, "You do not have permission to do this")
        return user

    return check_role


# Ready-made types used across all the routers:
AdminUser = Annotated[User, Depends(require_roles(Role.company_admin))]                        # admins only
ManagerUser = Annotated[User, Depends(require_roles(Role.company_admin, Role.hiring_manager))]  # admins OR hiring managers
HiringManagerUser = Annotated[User, Depends(require_roles(Role.hiring_manager))]               # hiring managers only
InterviewerUser = Annotated[User, Depends(require_roles(Role.interviewer))]                    # interviewers only
```

## `backend/app/auth/permissions.py`
```python
# ── permissions.py: WHICH ROWS each person may see. Roles decide actions; this decides data. ──

"""Who can see what. Every router uses these functions, so the rules live in one place.

- Company admin:  everything in their company.
- Hiring manager: only the jobs where they are the hiring manager, and those jobs'
                  applications and interviews.
- Interviewer:    only applications and interviews they are assigned to (and not cancelled).

Anything outside a user's scope is answered with 404, so its existence is not revealed.
"""
# (One correction to the docstring above: admins see all company JOBS, but NOT individual
#  applications or interviews. See the "false()" lines below.)
import uuid

from fastapi import HTTPException
# false() = a SQL condition that is never true, so the query returns nothing.
from sqlalchemy import false
# select() builds a SQL SELECT query in Python.
from sqlmodel import Session, select

from app.candidates.models import Application
from app.interviews.models import Interview, InterviewStatus
from app.jobs.models import Job
from app.users.models import Role, User


# The core rule, shared by everything below. Takes ANY query that involves the Job table and narrows it.
# The leading underscore means "private helper, for use inside this file".
def _limit_to_visible_jobs(query, user: User):
    """Company admins see all company jobs, hiring managers only the jobs they manage."""
    # Rule 1, for everyone: never another company's jobs.  SQL: WHERE jobs.company_id = <your company>
    query = query.where(Job.company_id == user.company_id)
    # Rule 2, hiring managers: only the jobs they own.  SQL: AND jobs.hiring_manager_id = <your id>
    if user.role == Role.hiring_manager:
        query = query.where(Job.hiring_manager_id == user.id)
    return query


# "All jobs this user may see" as a query (not yet run). Routers add more filters, then run it.
def visible_jobs(user: User):
    return _limit_to_visible_jobs(select(Job), user)


# Load ONE job, but only if it's visible to this user.
def get_visible_job(db: Session, user: User, job_id: uuid.UUID) -> Job:
    # Run the visible-jobs query, narrowed to this id. .first() = the first row or None.
    job = db.exec(visible_jobs(user).where(Job.id == job_id)).first()
    if job is None:
        # 404, not 403: whether it doesn't exist or isn't yours, the answer is the same,
        # so nobody can probe for other companies' job ids.
        raise HTTPException(404, "Job not found")
    return job


# "All applications this user may see", returned together with their job.
def visible_applications(user: User):
    """A query returning (Application, Job) rows that this user may see."""
    # SELECT applications, jobs FROM applications JOIN jobs ON jobs.id = applications.job_id
    # The JOIN is needed because the company lives on the JOB, not the application.
    query = select(Application, Job).join(Job, Job.id == Application.job_id)
    # Apply the company + hiring-manager rules through the joined job.
    query = _limit_to_visible_jobs(query, user)
    if user.role == Role.company_admin:
        # Admins do NOT browse candidates' CVs and details: privacy by design.
        query = query.where(false())
    elif user.role == Role.interviewer:
        # A SUBQUERY: the ids of applications this interviewer is assigned to (not cancelled).
        assigned_application_ids = select(Interview.application_id).where(
            Interview.interviewer_id == user.id,
            Interview.status != InterviewStatus.cancelled,
        )
        # SQL: AND applications.id IN (that subquery)
        query = query.where(Application.id.in_(assigned_application_ids))
    return query


# Load ONE application (+ its job) if visible, else 404.
# "-> tuple[Application, Job]" = returns a pair.
def get_visible_application(db: Session, user: User, application_id: uuid.UUID) -> tuple[Application, Job]:
    row = db.exec(visible_applications(user).where(Application.id == application_id)).first()
    if row is None:
        raise HTTPException(404, "Application not found")
    # "Unpack" the pair into two variables.
    application, job = row
    return application, job


# "All interviews this user may see."
def visible_interviews(user: User):
    """A query returning the Interview rows that this user may see."""
    # interviews -> applications -> jobs, so we can reach the company and the hiring manager.
    query = (
        select(Interview)
        .join(Application, Application.id == Interview.application_id)
        .join(Job, Job.id == Application.job_id)
    )
    query = _limit_to_visible_jobs(query, user)
    if user.role == Role.company_admin:
        query = query.where(false())            # admins see progress through reports instead
    elif user.role == Role.interviewer:
        # Only their own interviews, and not cancelled ones.
        query = query.where(
            Interview.interviewer_id == user.id,
            Interview.status != InterviewStatus.cancelled,
        )
    return query


# Load ONE interview if visible, else 404.
def get_visible_interview(db: Session, user: User, interview_id: uuid.UUID) -> Interview:
    interview = db.exec(visible_interviews(user).where(Interview.id == interview_id)).first()
    if interview is None:
        raise HTTPException(404, "Interview not found")
    return interview
```

| | Jobs | Applications | Interviews |
|---|---|---|---|
| **Admin** | all jobs in their company | none | none |
| **Hiring manager** | jobs they own | applications to their jobs | interviews for their jobs |
| **Interviewer** | none (blocked earlier by role) | candidates assigned to them | their own, not cancelled |

## `backend/app/users/schemas.py`
```python
# ── users/schemas.py: the SHAPE of data going in and out of the team/invitation endpoints. ──
# Models = what is STORED. Schemas = what travels over the network. Keeping them separate
# means secrets like hashed_password can never be sent to a browser by accident.

import uuid
from datetime import datetime
# Literal = only these exact values are allowed.
from typing import Annotated, Literal

# AfterValidator = run a function after normal validation. ConfigDict = schema settings.
# EmailStr = must look like a real email address.
from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

from app.users.models import Role

# Emails are stored in lowercase so "Ann@x.com" and "ann@x.com" are the same person.
# A reusable type: "a valid email, then lower-cased".
LowerEmail = Annotated[EmailStr, AfterValidator(lambda email: email.lower())]


# BODY of POST /users (invite someone).
class UserInviteCreate(BaseModel):
    email: LowerEmail
    full_name: str = Field(min_length=1, max_length=100)    # 1 to 100 characters
    # An admin can only invite these two roles; nobody can be invited as another admin.
    role: Literal["hiring_manager", "interviewer"]


# What GET /users/invitations returns for each pending invitation. Note: NO token.
class PendingInvitationRead(BaseModel):
    # from_attributes=True = can be built straight from an Invitation database object.
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: Role
    created_at: datetime
    expires_at: datetime


# What inviting (or resending) returns: includes the link so the admin can share it by hand.
class UserInvitationRead(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: Role
    expires_at: datetime
    invite_url: str
    # False when the invitation email could not be sent; the admin then shares invite_url another way.
    email_sent: bool


# BODY of POST /auth/accept-invite.
class AcceptInvitation(BaseModel):
    token: str = Field(min_length=20, max_length=200)      # the secret from the link
    password: str = Field(min_length=8, max_length=128)    # at least 8 characters


# What the API returns about a user. Deliberately has NO hashed_password field.
class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    email: str
    full_name: str
    role: Role
    password_login_enabled: bool     # the Account page uses this to show "Change" vs "Set" password
```

## `backend/app/auth/schemas.py`
```python
# ── auth/schemas.py: bodies for register, Google sign-in and password change. ──

from pydantic import BaseModel, Field

# Re-use the "valid + lower-cased email" type.
from app.users.schemas import LowerEmail


# BODY of POST /auth/register. If any rule fails, FastAPI answers 422 before our code runs.
class RegisterRequest(BaseModel):
    """Creates a new company and its first user, who becomes the company admin."""

    company_name: str = Field(min_length=1, max_length=100)
    full_name: str = Field(min_length=1, max_length=100)
    email: LowerEmail
    # max_length stops someone sending a gigantic "password" to waste server time hashing it.
    password: str = Field(min_length=8, max_length=128)


# BODY of POST /auth/google.
class GoogleAuthRequest(BaseModel):
    """Authenticates a user with a Google-issued ID token."""

    # The signed token Google gave the browser. The server verifies it (Part 4).
    id_token: str = Field(min_length=1)
    # Optional company name, used only when creating a new company.
    company_name: str | None = Field(default=None, min_length=1, max_length=100)
    # Only the register page sets this: a Google email with no account and no invitation
    # then gets a new company. From the login page it is an error instead.
    create_company: bool = False
    # Sent from the accept-invite page so a mismatched Google account gets a clear error.
    invite_token: str | None = Field(default=None, min_length=20, max_length=200)


# BODY of PUT /auth/password.
class ChangePasswordRequest(BaseModel):
    """Required: the current password, unless the account has only ever signed in with Google."""

    # Optional here; the endpoint decides whether it's needed (Google-only accounts don't have one).
    current_password: str | None = Field(default=None, max_length=128)
    password: str = Field(min_length=8, max_length=128)    # the new password


# What login returns: {"access_token": "eyJ...", "token_type": "bearer"}.
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"     # standard OAuth2 wording: send it as "Authorization: Bearer <token>"
```

**Remember:**
- **Passwords:** stored as Argon2 hashes and checked with `verify_password`.
- **Login tokens (JWT):** hold only the user id and an expiry, signed with `JWT_SECRET`, and are sent as `Authorization: Bearer …`.
- **`get_current_user`:** checks the token and loads the user on every request (**401** if not).
- **`require_roles`:** checks the role (**403** if not allowed).
- **`permissions.py`:** narrows every query to visible rows (**404** for anything outside them).
- **Schemas:** control exactly what comes in (validated) and what goes out (no secrets).
