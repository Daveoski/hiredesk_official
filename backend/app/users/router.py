import hashlib
import secrets
import uuid
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
from app.users.schemas import PendingInvitationRead, UserInviteCreate, UserInvitationRead, UserRead

router = APIRouter(prefix="/users", tags=["Users"])


INVITATION_DAYS = 7


@router.post("", response_model=UserInvitationRead, status_code=201)
def create_user(body: UserInviteCreate, admin: AdminUser, db: DbSession):
    """The company admin invites a hiring manager or interviewer to join the team."""
    if db.exec(select(User.id).where(User.email == body.email)).first() is not None:
        raise HTTPException(409, "This email is already registered")
    active = db.exec(
        select(Invitation.id).where(
            Invitation.email == body.email, Invitation.accepted_at.is_(None), Invitation.expires_at > utcnow()
        )
    ).first()
    if active is not None:
        raise HTTPException(409, "This person already has an open invitation. Resend it from the Team page.")

    # Re-inviting someone whose invitation expired reuses that row, so the list shows them once.
    invitation = db.exec(
        select(Invitation).where(
            Invitation.company_id == admin.company_id,
            Invitation.email == body.email,
            Invitation.accepted_at.is_(None),
        )
    ).first() or Invitation(company_id=admin.company_id, email=body.email, token_hash="", expires_at=utcnow())
    invitation.invited_by_id = admin.id
    invitation.full_name = body.full_name
    invitation.role = Role(body.role)
    return _issue_and_send(db, invitation, admin)


@router.get("/invitations", response_model=list[PendingInvitationRead])
def list_pending_invitations(admin: AdminUser, db: DbSession):
    """Invitations that have not been accepted yet, newest first, including expired ones."""
    return db.exec(
        select(Invitation)
        .where(Invitation.company_id == admin.company_id, Invitation.accepted_at.is_(None))
        .order_by(Invitation.created_at.desc())
    ).all()


@router.post("/invitations/{invitation_id}/resend", response_model=UserInvitationRead)
def resend_invitation(invitation_id: uuid.UUID, admin: AdminUser, db: DbSession):
    """Email a fresh link: the old link stops working and the invitation gets 7 more days."""
    invitation = _get_pending_invitation(db, admin, invitation_id)
    if db.exec(select(User.id).where(User.email == invitation.email)).first() is not None:
        raise HTTPException(409, "This email is already registered")
    return _issue_and_send(db, invitation, admin)


@router.delete("/invitations/{invitation_id}", status_code=204)
def revoke_invitation(invitation_id: uuid.UUID, admin: AdminUser, db: DbSession):
    """Withdraw an invitation; its link stops working."""
    db.delete(_get_pending_invitation(db, admin, invitation_id))
    db.commit()


def _get_pending_invitation(db: DbSession, admin: User, invitation_id: uuid.UUID) -> Invitation:
    invitation = db.get(Invitation, invitation_id)
    if invitation is None or invitation.company_id != admin.company_id or invitation.accepted_at is not None:
        raise HTTPException(404, "Invitation not found")
    return invitation


def _issue_and_send(db: DbSession, invitation: Invitation, admin: User) -> UserInvitationRead:
    """Give the invitation a new one-time token and expiry, save it, and email the link.

    Only the token's hash is stored, so a new token is the only way to share the link again.
    """
    token = secrets.token_urlsafe(32)
    invitation.token_hash = hashlib.sha256(token.encode()).hexdigest()
    invitation.expires_at = utcnow() + timedelta(days=INVITATION_DAYS)
    db.add(invitation)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "An invitation already exists for this email") from error

    invite_url = f"{get_settings().frontend_base_url.rstrip('/')}/accept-invite?token={token}"
    company = db.get(Company, admin.company_id)
    subject, text, html = invitation_email(
        invitation.full_name, admin.full_name, company.name, invitation.role.value, invite_url
    )
    # Sent now, not in the background, so the admin learns whether it went out
    # and can share the link another way if it did not.
    email_sent = send_email(to=invitation.email, subject=subject, text=text, html=html)
    return UserInvitationRead(
        id=invitation.id,
        email=invitation.email,
        full_name=invitation.full_name,
        role=invitation.role,
        expires_at=invitation.expires_at,
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
