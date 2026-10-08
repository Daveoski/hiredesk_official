from typing import Annotated
from datetime import timedelta
import hashlib

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.auth.dependencies import CurrentUser
from app.auth.schemas import RegisterRequest, Token
from app.companies.models import Company
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
