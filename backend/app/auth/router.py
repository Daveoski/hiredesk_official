from typing import Annotated
from datetime import timedelta
import hashlib
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
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

router = APIRouter(prefix="/auth", tags=["Auth"])


def _find_open_invitation(db: DbSession, *, token_hash: str | None = None, email: str | None = None) -> Invitation | None:
    """The newest invitation matching the token or email that is not accepted and not expired."""
    query = select(Invitation).where(Invitation.accepted_at.is_(None), Invitation.expires_at > utcnow())
    if token_hash is not None:
        query = query.where(Invitation.token_hash == token_hash)
    if email is not None:
        query = query.where(Invitation.email == email)
    return db.exec(query.order_by(Invitation.created_at.desc())).first()


@router.post("/register", response_model=UserRead, status_code=201)
def register(body: RegisterRequest, db: DbSession):
    company = Company(name=body.company_name)
    db.add(company)
    db.flush()  # insert the company first, because the user row points to it

    user = User(
        company_id=company.id,
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=Role.company_admin,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:  # the unique index on users.email
        db.rollback()
        raise HTTPException(409, "This email is already registered") from error
    return user


@router.post("/login", response_model=Token)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession):
    # OAuth2PasswordRequestForm names the email field "username".
    user = db.exec(select(User).where(User.email == form.username.lower())).first()
    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    if not user.password_login_enabled:
        raise HTTPException(401, "This account needs a password before email sign-in can be used")
    return Token(access_token=create_access_token(user.id))


@router.post("/google", response_model=Token)
def google_auth(body: GoogleAuthRequest, db: DbSession, background_tasks: BackgroundTasks):
    settings = get_settings()
    if not settings.google_auth_enabled or not settings.google_client_id:
        raise HTTPException(503, "Google sign-in is not configured")

    try:
        claims = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except (GoogleAuthError, ValueError) as error:
        raise HTTPException(401, "Google sign-in token is invalid") from error

    if claims.get("email_verified") is not True or not claims.get("email"):
        raise HTTPException(401, "Google email is not verified")

    email = str(claims["email"]).lower()

    if body.invite_token is not None:
        invitation = _find_open_invitation(db, token_hash=hashlib.sha256(body.invite_token.encode()).hexdigest())
        if invitation is None:
            raise HTTPException(410, "This invitation is invalid or expired")
        if invitation.email != email:
            raise HTTPException(403, f"This invitation was sent to {invitation.email}. Sign in with that Google account.")

    # Any existing team member (admin, hiring manager or interviewer) signs straight in.
    user = db.exec(select(User).where(User.email == email)).first()
    if user is not None:
        return Token(access_token=create_access_token(user.id))

    # An invited teammate joins the company that invited them, with the invited role.
    invitation = _find_open_invitation(db, email=email)
    if invitation is not None:
        user = User(
            company_id=invitation.company_id,
            email=email,
            full_name=invitation.full_name,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            password_login_enabled=False,
            role=invitation.role,
        )
        invitation.accepted_at = utcnow()
        db.add_all([user, invitation])
        try:
            db.commit()
        except IntegrityError as error:
            db.rollback()
            raise HTTPException(409, "This invitation has already been used") from error
        notify_teammate_joined(db, background_tasks, user, "with Google")
        return Token(access_token=create_access_token(user.id))

    if not body.create_company:
        raise HTTPException(
            404,
            "No HireDesk account uses this Google email. Create a company, or ask your company admin for an invitation.",
        )

    full_name = str(claims.get("name") or email.split("@", 1)[0])
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
    db.refresh(user)
    background_tasks.add_task(
        send_email,
        to=user.email,
        subject="Your HireDesk password was changed",
        text=(
            f"Hi {user.full_name},\n\n"
            "The password for your HireDesk account was just changed.\n"
            "If this was not you, contact your company admin straight away.\n"
        ),
    )
    return user


def notify_teammate_joined(db: DbSession, background_tasks: BackgroundTasks, user: User, how: str) -> None:
    notify_company_admins(
        db,
        background_tasks,
        user.company_id,
        subject=f"{user.full_name} joined your team",
        text=f"{user.full_name} ({user.email}) accepted the invitation {how} and joined as a {label(user.role.value)}.\n",
    )


@router.post("/accept-invite", response_model=UserRead, status_code=201)
def accept_invitation(body: AcceptInvitation, db: DbSession, background_tasks: BackgroundTasks):
    invitation = _find_open_invitation(db, token_hash=hashlib.sha256(body.token.encode()).hexdigest())
    if invitation is None:
        raise HTTPException(410, "This invitation is invalid or expired")
    if db.exec(select(User.id).where(User.email == invitation.email)).first() is not None:
        raise HTTPException(409, "This email is already registered")

    user = User(
        company_id=invitation.company_id,
        email=invitation.email,
        full_name=invitation.full_name,
        hashed_password=hash_password(body.password),
        role=invitation.role,
    )
    invitation.accepted_at = utcnow()
    db.add_all([user, invitation])
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "This invitation has already been used") from error
    db.refresh(user)
    notify_teammate_joined(db, background_tasks, user, "with a password")
    return user


@router.get("/me", response_model=UserRead)
def read_current_user(user: CurrentUser):
    return user
