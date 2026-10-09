import hashlib
import secrets
from datetime import timedelta
from html import escape

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.auth.dependencies import AdminUser, ManagerUser
from app.companies.models import Company
from app.core.config import get_settings
from app.db.common import utcnow
from app.core.email import send_email
from app.db.session import DbSession
from app.users.models import Invitation, Role, User
from app.users.schemas import UserInviteCreate, UserInvitationRead, UserRead

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("", response_model=UserInvitationRead, status_code=201)
def create_user(body: UserInviteCreate, admin: AdminUser, db: DbSession):
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
    company = db.get(Company, admin.company_id)
    subject, text, html = invitation_email(body.full_name, admin.full_name, company.name, body.role, invite_url)
    # Sent now, not in the background, so the admin learns whether it went out
    # and can share the link another way if it did not.
    email_sent = send_email(to=body.email, subject=subject, text=text, html=html)
    return UserInvitationRead(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        expires_at=expires_at,
        invite_url=invite_url,
        email_sent=email_sent,
    )


def invitation_email(name: str, inviter: str, company: str, role: str, invite_url: str) -> tuple[str, str, str]:
    """The invitation as (subject, plain text, HTML). The HTML uses inline styles, which every mail app supports."""
    role_label = role.replace("_", " ")
    subject = f"{inviter} invited you to join {company} on HireDesk"
    text = (
        f"Hi {name},\n\n"
        f"{inviter} has invited you to join {company} on HireDesk as a {role_label}.\n\n"
        f"Accept your invitation (the link works once and expires in 7 days):\n{invite_url}\n\n"
        "You can set a password or continue with the Google account this email was sent to.\n"
    )
    safe = {key: escape(value) for key, value in
            {"name": name, "inviter": inviter, "company": company, "role": role_label, "url": invite_url}.items()}
    html = f"""\
<div style="background:#f5f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#14162b">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e0e3f0;border-radius:12px;padding:32px">
    <p style="margin:0 0 24px;font-size:20px;font-weight:bold;color:#3a36e0">HireDesk</p>
    <p style="margin:0 0 12px;font-size:16px">Hi {safe['name']},</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:24px">
      <strong>{safe['inviter']}</strong> has invited you to join <strong>{safe['company']}</strong>
      on HireDesk as a <strong>{safe['role']}</strong>.
    </p>
    <p style="margin:0 0 28px">
      <a href="{safe['url']}" style="display:inline-block;background:#3a36e0;color:#ffffff;text-decoration:none;
         font-weight:bold;font-size:16px;padding:12px 24px;border-radius:8px">Join the team</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#5d6180">Or open this link:</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="{safe['url']}" style="color:#3a36e0">{safe['url']}</a></p>
    <p style="margin:0;font-size:13px;line-height:20px;color:#5d6180">
      The link works once and expires in 7 days. You can set a password or continue with the
      Google account this email was sent to.
    </p>
  </div>
</div>"""
    return subject, text, html


@router.get("", response_model=list[UserRead])
def list_users(manager: ManagerUser, db: DbSession, role: Role | None = None):
    """Admins and hiring managers list company users, for example to pick an interviewer."""
    query = select(User).where(User.company_id == manager.company_id)
    if role is not None:
        query = query.where(User.role == role)
    return db.exec(query.order_by(User.full_name)).all()
