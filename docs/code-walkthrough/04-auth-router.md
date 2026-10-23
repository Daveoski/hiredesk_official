# Part 4: Sign-up, login, Google sign-in and invitations (copyable)

`backend/app/auth/router.py`, everything about **getting into** HirePlume:

| Endpoint | Who | What it does |
|---|---|---|
| `POST /auth/register` | A new company owner | Creates a company and its first admin |
| `POST /auth/login` | Anyone with a password | Email + password → login token |
| `POST /auth/google` | Anyone with Google | Google token → login token (or joins/creates a company) |
| `PUT /auth/password` | Signed-in users | Change or set your password |
| `POST /auth/accept-invite` | Invited teammates | Join a team with the invite link + a new password |
| `GET /auth/me` | Signed-in users | "Who am I?" |

```python
# ── auth/router.py: registering, logging in, Google sign-in, password change, accepting invites. ──

from typing import Annotated
# (timedelta is imported but not used in this file: leftover from an earlier version; harmless.)
from datetime import timedelta
# hashlib = built-in hashing (SHA-256), used to hash invitation tokens.
import hashlib
# secrets = built-in, cryptographically secure randomness (for unguessable passwords/tokens).
import secrets

# APIRouter = a group of endpoints. BackgroundTasks = run work (emails) after the response is sent.
# Depends = declare a dependency. HTTPException = stop and return an error status to the caller.
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
# The standard OAuth2 login form: fields "username" and "password" (sent as form data, not JSON).
from fastapi.security import OAuth2PasswordRequestForm
# Google's library: an error type, an HTTP transport, and the ID-token verifier.
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
# IntegrityError = the database refused a write because a rule (unique, foreign key...) was broken.
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.auth.dependencies import CurrentUser
from app.auth.schemas import ChangePasswordRequest, GoogleAuthRequest, RegisterRequest, Token
from app.companies.models import Company
from app.core.config import get_settings
from app.core.email import send_email
from app.core.notifications import label, notify_company_admins
from app.core.security import create_access_token, hash_password, verify_password
from app.db.common import utcnow
from app.db.session import DbSession
from app.users.models import Invitation, Role, User
from app.users.schemas import AcceptInvitation, UserRead

# Every endpoint in this file starts with /auth, and is grouped under "Auth" on the /docs page.
router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Helper: find an invitation that can still be used. ──
# The "*" means every argument after it must be given BY NAME, e.g. _find_open_invitation(db, email="x").
def _find_open_invitation(db: DbSession, *, token_hash: str | None = None, email: str | None = None) -> Invitation | None:
    """The newest invitation matching the token or email that is not accepted and not expired."""
    # Start with: not accepted yet (accepted_at IS NULL) AND not expired (expires_at > now).
    query = select(Invitation).where(Invitation.accepted_at.is_(None), Invitation.expires_at > utcnow())
    if token_hash is not None:
        query = query.where(Invitation.token_hash == token_hash)
    if email is not None:
        query = query.where(Invitation.email == email)
    # Newest first, then take the first row, or None if there's none.
    return db.exec(query.order_by(Invitation.created_at.desc())).first()


# ── POST /auth/register: create a company and its first admin. ──
# response_model=UserRead: what we return is filtered through UserRead (so no hashed_password).
# status_code=201: "Created".
@router.post("/register", response_model=UserRead, status_code=201)
def register(body: RegisterRequest, db: DbSession):
    company = Company(name=body.company_name)
    db.add(company)
    db.flush()  # insert the company first, because the user row points to it
    # (flush = send the INSERT now but don't commit yet: still one transaction, so an error
    #  later rolls BOTH back. Without it, company.id wouldn't be in the database for the user's FK.)

    # The company's admin, with the password HASHED (never stored as typed).
    user = User(
        company_id=company.id,
        email=body.email,                                 # already lower-cased by LowerEmail
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=Role.company_admin,
    )
    db.add(user)
    try:
        db.commit()                                       # save both rows together
    except IntegrityError as error:  # the unique index on users.email
        db.rollback()                                     # undo everything (the company too)
        raise HTTPException(409, "This email is already registered") from error
    return user


# ── POST /auth/login: email + password -> login token. ──
@router.post("/login", response_model=Token)
# Read the request as the standard OAuth2 login FORM (also makes the /docs "Authorize" button work).
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession):
    # OAuth2PasswordRequestForm names the email field "username".
    user = db.exec(select(User).where(User.email == form.username.lower())).first()
    # The SAME message for "no such user" and "wrong password", so attackers can't learn which emails exist.
    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    # Google-only accounts have a random unknown password, so the check above already fails for them;
    # this is an extra guard with a clearer message.
    if not user.password_login_enabled:
        raise HTTPException(401, "This account needs a password before email sign-in can be used")
    return Token(access_token=create_access_token(user.id))


# ── POST /auth/google: sign in (or join, or register) with a Google ID token. ──
@router.post("/google", response_model=Token)
def google_auth(body: GoogleAuthRequest, db: DbSession, background_tasks: BackgroundTasks):
    settings = get_settings()
    if not settings.google_auth_enabled or not settings.google_client_id:
        raise HTTPException(503, "Google sign-in is not configured")

    # NEVER trust the browser. Verify Google's token on the server:
    try:
        claims = google_id_token.verify_oauth2_token(
            body.id_token,               # the token the browser got from Google
            google_requests.Request(),   # how to download Google's public signing keys
            settings.google_client_id,   # the token must have been issued FOR our app (its "audience")
        )
    except (GoogleAuthError, ValueError) as error:
        raise HTTPException(401, "Google sign-in token is invalid") from error

    # Only accept emails Google has verified. "is not True" is deliberately strict.
    if claims.get("email_verified") is not True or not claims.get("email"):
        raise HTTPException(401, "Google email is not verified")

    email = str(claims["email"]).lower()

    # CASE 1: came from the ACCEPT-INVITE page: check the invite and that the Google email matches.
    if body.invite_token is not None:
        invitation = _find_open_invitation(db, token_hash=hashlib.sha256(body.invite_token.encode()).hexdigest())
        if invitation is None:
            raise HTTPException(410, "This invitation is invalid or expired")
        if invitation.email != email:
            raise HTTPException(403, f"This invitation was sent to {invitation.email}. Sign in with that Google account.")

    # CASE 2: any existing team member (admin, hiring manager or interviewer) signs straight in.
    user = db.exec(select(User).where(User.email == email)).first()
    if user is not None:
        return Token(access_token=create_access_token(user.id))

    # CASE 3: an invited teammate joins the company that invited them, with the invited role.
    invitation = _find_open_invitation(db, email=email)
    if invitation is not None:
        user = User(
            company_id=invitation.company_id,
            email=email,
            full_name=invitation.full_name,
            # They use Google, so a long random password nobody knows (the column can't be empty).
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            password_login_enabled=False,        # until they set one on the Account page
            role=invitation.role,
        )
        invitation.accepted_at = utcnow()        # the link can't be used again
        db.add_all([user, invitation])
        try:
            db.commit()
        except IntegrityError as error:
            db.rollback()
            raise HTTPException(409, "This invitation has already been used") from error
        notify_teammate_joined(db, background_tasks, user, "with Google")
        return Token(access_token=create_access_token(user.id))

    # CASE 4: no account, no invitation, and not from the Register page: an error, so a hiring
    # manager who clicked the wrong page doesn't accidentally create a new company.
    if not body.create_company:
        raise HTTPException(
            404,
            "No HirePlume account uses this Google email. Create a company, or ask your company admin for an invitation.",
        )

    # CASE 5: register a new company with Google.
    # Google's name, or the part of the email before "@".
    full_name = str(claims.get("name") or email.split("@", 1)[0])
    # The typed company name, or "<First name>'s Company".
    company_name = body.company_name or full_name.split()[0] + "'s Company"
    company = Company(name=company_name)
    db.add(company)
    db.flush()

    user = User(
        company_id=company.id,
        email=email,
        full_name=full_name,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        password_login_enabled=False,
        role=Role.company_admin,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "This email is already registered") from error

    return Token(access_token=create_access_token(user.id))


# ── PUT /auth/password: change (or set for the first time) YOUR OWN password. ──
@router.put("/password", response_model=UserRead)
def change_password(body: ChangePasswordRequest, user: CurrentUser, db: DbSession, background_tasks: BackgroundTasks):
    """Any signed-in user changes their own password.

    A Google-only account has no password it knows, so it sets its first one without
    the current password. That also turns on email/password sign-in for it.
    """
    if user.password_login_enabled:
        # 400, not 401: a wrong current password must not look like an expired session.
        if not body.current_password or not verify_password(body.current_password, user.hashed_password):
            raise HTTPException(400, "Your current password is incorrect")
        if body.current_password == body.password:
            raise HTTPException(400, "Choose a new password that is different from the current one")

    user.hashed_password = hash_password(body.password)
    user.password_login_enabled = True
    db.add(user)
    db.commit()
    db.refresh(user)                    # reload what was saved
    # A security notice to the owner, sent after the response.
    background_tasks.add_task(
        send_email,
        to=user.email,
        subject="Your HirePlume password was changed",
        text=(
            f"Hi {user.full_name},\n\n"
            "The password for your HirePlume account was just changed.\n"
            "If this was not you, contact your company admin straight away.\n"
        ),
    )
    return user


# ── Helper: email the company's admins that someone joined. ──
def notify_teammate_joined(db: DbSession, background_tasks: BackgroundTasks, user: User, how: str) -> None:
    notify_company_admins(
        db,
        background_tasks,
        user.company_id,
        subject=f"{user.full_name} joined your team",
        text=f"{user.full_name} ({user.email}) accepted the invitation {how} and joined as a {label(user.role.value)}.\n",
    )


# ── POST /auth/accept-invite: join a team with the link + a new password. ──
@router.post("/accept-invite", response_model=UserRead, status_code=201)
def accept_invitation(body: AcceptInvitation, db: DbSession, background_tasks: BackgroundTasks):
    # Only HASHES are stored, so hash what we received and compare.
    invitation = _find_open_invitation(db, token_hash=hashlib.sha256(body.token.encode()).hexdigest())
    if invitation is None:
        raise HTTPException(410, "This invitation is invalid or expired")
    if db.exec(select(User.id).where(User.email == invitation.email)).first() is not None:
        raise HTTPException(409, "This email is already registered")

    # The company and role come from the INVITATION; the browser can't choose them.
    user = User(
        company_id=invitation.company_id,
        email=invitation.email,
        full_name=invitation.full_name,
        hashed_password=hash_password(body.password),
        role=invitation.role,
    )
    invitation.accepted_at = utcnow()        # the link is now dead
    db.add_all([user, invitation])
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()                        # two clicks at once: only one succeeds
        raise HTTPException(409, "This invitation has already been used") from error
    db.refresh(user)
    notify_teammate_joined(db, background_tasks, user, "with a password")
    return user


# ── GET /auth/me: "who am I?" (called right after login to learn the name and role). ──
@router.get("/me", response_model=UserRead)
def read_current_user(user: CurrentUser):
    return user
```

```text
POST /auth/google
 ├─ Google sign-in not configured? ──────────────────────► 503
 ├─ Google token invalid / not for our app? ─────────────► 401
 ├─ Email not verified by Google? ───────────────────────► 401
 ├─ From the invite page?  expired/used/fake → 410 ; wrong Google account → 403
 ├─ Already a HirePlume user? ────────────────────────────► sign in
 ├─ Has an open invitation? ─────────────────────────────► join that company + role, sign in
 ├─ Not from the Register page? ─────────────────────────► 404 "no account"
 └─ From the Register page ──────────────────────────────► create company + admin, sign in
```
