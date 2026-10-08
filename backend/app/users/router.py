import hashlib
import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.auth.dependencies import AdminUser, ManagerUser
from app.core.config import get_settings
from app.db.common import utcnow
from app.core.email import send_email
from app.db.session import DbSession
from app.users.models import Invitation, Role, User
from app.users.schemas import UserInviteCreate, UserInvitationRead, UserRead

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("", response_model=UserInvitationRead, status_code=201)
def create_user(body: UserInviteCreate, admin: AdminUser, db: DbSession, background_tasks: BackgroundTasks):
    """The company admin invites a hiring manager or interviewer to join the team."""
    if db.exec(select(User.id).where(User.email == body.email)).first() is not None:
        raise HTTPException(409, "This email is already registered")
    pending = db.exec(
        select(Invitation).where(Invitation.email == body.email, Invitation.accepted_at.is_(None))
    ).first()
    if pending is not None and pending.expires_at > utcnow():
        raise HTTPException(409, "An active invitation already exists for this email")

    token = secrets.token_urlsafe(32)
    expires_at = utcnow() + timedelta(days=7)
    invitation = Invitation(
        company_id=admin.company_id,
        invited_by_id=admin.id,
        email=body.email,
        full_name=body.full_name,
        role=Role(body.role),
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=expires_at,
    )
    db.add(invitation)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "An invitation already exists for this email") from error

    invite_url = f"{get_settings().frontend_base_url.rstrip('/')}/accept-invite?token={token}"
    background_tasks.add_task(
        send_email,
        to=body.email,
        subject="You have been invited to HireDesk",
        text=(
            f"Hi {body.full_name},\n\n"
            f"You have been invited to join a HireDesk team as a {body.role.replace('_', ' ')}.\n"
            f"Accept your invitation within 7 days: {invite_url}\n"
        ),
    )
    return UserInvitationRead(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        expires_at=expires_at,
        invite_url=invite_url,
    )


@router.get("", response_model=list[UserRead])
def list_users(manager: ManagerUser, db: DbSession, role: Role | None = None):
    """Admins and hiring managers list company users, for example to pick an interviewer."""
    query = select(User).where(User.company_id == manager.company_id)
    if role is not None:
        query = query.where(User.role == role)
    return db.exec(query.order_by(User.full_name)).all()
