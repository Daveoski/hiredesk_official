from typing import Annotated
from datetime import timedelta
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.auth.dependencies import CurrentUser
from app.auth.schemas import GoogleAuthRequest, RegisterRequest, Token
from app.companies.models import Company
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.common import utcnow
from app.db.session import DbSession
from app.users.models import Invitation, Role, User
from app.users.schemas import AcceptInvitation, UserRead

router = APIRouter(prefix="/auth", tags=["Auth"])


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
    return Token(access_token=create_access_token(user.id))


@router.post("/google", response_model=Token)
def google_auth(body: GoogleAuthRequest, db: DbSession):
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
    user = db.exec(select(User).where(User.email == email)).first()

    if user is not None:
        return Token(access_token=create_access_token(user.id))

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
        role=Role.company_admin,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "This email is already registered") from error

    return Token(access_token=create_access_token(user.id))


@router.post("/accept-invite", response_model=UserRead, status_code=201)
def accept_invitation(body: AcceptInvitation, db: DbSession):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    invitation = db.exec(select(Invitation).where(Invitation.token_hash == token_hash)).first()
    if invitation is None or invitation.accepted_at is not None or invitation.expires_at <= utcnow():
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
    return user


@router.get("/me", response_model=UserRead)
def read_current_user(user: CurrentUser):
    return user
