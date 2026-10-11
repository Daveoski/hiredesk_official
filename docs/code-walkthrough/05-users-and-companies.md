# Part 5: Team, invitations and the company (copyable)

`backend/app/users/router.py` lets the **company admin** build the team: invite people, see pending invitations, resend or revoke them, and list members. `backend/app/companies/router.py` returns the signed-in user's company.

| Endpoint | Who | What it does |
|---|---|---|
| `POST /users` | Admin | Invite a hiring manager or interviewer (sends the email) |
| `GET /users/invitations` | Admin | Invitations not yet accepted |
| `POST /users/invitations/{id}/resend` | Admin | New link, 7 more days, email again |
| `DELETE /users/invitations/{id}` | Admin | Revoke an invitation |
| `GET /users` | Admin, hiring manager | List team members (optionally by role) |
| `GET /companies/me` | Anyone signed in | The user's company name |

## `backend/app/users/router.py`

```python
# ── users/router.py: inviting teammates and managing invitations. ──

# hashlib: SHA-256 hashing of invite tokens. secrets: unguessable random tokens.
import hashlib
import secrets
import uuid
# timedelta: "7 days" as a length of time.
from datetime import timedelta
# escape(): turns < > & " into safe HTML codes (&lt; ...) so names can't inject HTML into the email.
from html import escape

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

# AdminUser = must be a company admin. ManagerUser = admin OR hiring manager. (Part 3)
from app.auth.dependencies import AdminUser, ManagerUser
from app.companies.models import Company
from app.core.config import get_settings
from app.db.common import utcnow
from app.core.email import send_email
from app.db.session import DbSession
from app.users.models import Invitation, Role, User
from app.users.schemas import PendingInvitationRead, UserInviteCreate, UserInvitationRead, UserRead

# All endpoints here start with /users.
router = APIRouter(prefix="/users", tags=["Users"])


# A named constant instead of a "magic number" 7 scattered around the code.
INVITATION_DAYS = 7


# ── POST /users: invite someone. ──
# "" = the path is just the prefix, so this is POST /users.
@router.post("", response_model=UserInvitationRead, status_code=201)
# "admin: AdminUser" = only admins get past this line (403 otherwise).
def create_user(body: UserInviteCreate, admin: AdminUser, db: DbSession):
    """The company admin invites a hiring manager or interviewer to join the team."""
    # Is this email already a HireDesk user (in any company)? Emails are unique platform-wide.
    if db.exec(select(User.id).where(User.email == body.email)).first() is not None:
        raise HTTPException(409, "This email is already registered")
    # Is there already an invitation that is still usable (not accepted, not expired)?
    active = db.exec(
        select(Invitation.id).where(
            Invitation.email == body.email, Invitation.accepted_at.is_(None), Invitation.expires_at > utcnow()
        )
    ).first()
    if active is not None:
        # Don't create a second one; point the admin to the Resend button instead.
        raise HTTPException(409, "This person already has an open invitation. Resend it from the Team page.")

    # Re-inviting someone whose invitation expired reuses that row, so the list shows them once.
    # "A or B" in Python: if A is a row, use it; if A is None, use B (a brand new Invitation).
    invitation = db.exec(
        select(Invitation).where(
            Invitation.company_id == admin.company_id,
            Invitation.email == body.email,
            Invitation.accepted_at.is_(None),
        )
    ).first() or Invitation(company_id=admin.company_id, email=body.email, token_hash="", expires_at=utcnow())
    # (token_hash and expires_at are placeholders; _issue_and_send sets the real values before saving.)
    # Fill in or overwrite the details from this invite.
    invitation.invited_by_id = admin.id
    invitation.full_name = body.full_name
    # body.role is the text "hiring_manager"/"interviewer"; Role(...) turns it into the enum.
    invitation.role = Role(body.role)
    # Make a token, save, email, and return the result (below).
    return _issue_and_send(db, invitation, admin)


# ── GET /users/invitations: who hasn't joined yet. ──
# response_model=list[...] = returns a JSON array of PendingInvitationRead (no tokens).
@router.get("/invitations", response_model=list[PendingInvitationRead])
def list_pending_invitations(admin: AdminUser, db: DbSession):
    """Invitations that have not been accepted yet, newest first, including expired ones."""
    return db.exec(
        select(Invitation)
        # Only this admin's company, and only those not accepted.
        .where(Invitation.company_id == admin.company_id, Invitation.accepted_at.is_(None))
        .order_by(Invitation.created_at.desc())
    ).all()     # .all() = every matching row as a list


# ── POST /users/invitations/{invitation_id}/resend ──
# {invitation_id} in the path is read into the parameter of the same name.
# Typing it as uuid.UUID means a malformed id gets a 422 automatically.
@router.post("/invitations/{invitation_id}/resend", response_model=UserInvitationRead)
def resend_invitation(invitation_id: uuid.UUID, admin: AdminUser, db: DbSession):
    """Email a fresh link: the old link stops working and the invitation gets 7 more days."""
    # Load it, but only if it's pending and belongs to this admin's company (404 otherwise).
    invitation = _get_pending_invitation(db, admin, invitation_id)
    # They may have registered in the meantime.
    if db.exec(select(User.id).where(User.email == invitation.email)).first() is not None:
        raise HTTPException(409, "This email is already registered")
    # A NEW token replaces the old hash, so the old link stops working.
    return _issue_and_send(db, invitation, admin)


# ── DELETE /users/invitations/{invitation_id}: revoke. ──
# 204 No Content = success with no body. The function returns nothing.
@router.delete("/invitations/{invitation_id}", status_code=204)
def revoke_invitation(invitation_id: uuid.UUID, admin: AdminUser, db: DbSession):
    """Withdraw an invitation; its link stops working."""
    # Delete the row. With no row, no token hash matches, so the link is dead.
    db.delete(_get_pending_invitation(db, admin, invitation_id))
    db.commit()


# ── Helper: load an invitation the admin is allowed to manage. ──
def _get_pending_invitation(db: DbSession, admin: User, invitation_id: uuid.UUID) -> Invitation:
    # db.get(Model, id) = fetch a row by primary key, or None.
    invitation = db.get(Invitation, invitation_id)
    # Not found, OR another company's invitation, OR already accepted: all answered with 404.
    if invitation is None or invitation.company_id != admin.company_id or invitation.accepted_at is not None:
        raise HTTPException(404, "Invitation not found")
    return invitation


# ── Helper: give the invitation a fresh token + expiry, save, and email it. ──
def _issue_and_send(db: DbSession, invitation: Invitation, admin: User) -> UserInvitationRead:
    """Give the invitation a new one-time token and expiry, save it, and email the link.

    Only the token's hash is stored, so a new token is the only way to share the link again.
    """
    # 32 random bytes as URL-safe text (~43 characters). Impossible to guess.
    token = secrets.token_urlsafe(32)
    # Store only the SHA-256 hash. The real token goes in the email link and nowhere else.
    invitation.token_hash = hashlib.sha256(token.encode()).hexdigest()
    # Valid for 7 days from now.
    invitation.expires_at = utcnow() + timedelta(days=INVITATION_DAYS)
    db.add(invitation)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "An invitation already exists for this email") from error

    # Build the link. rstrip('/') removes a trailing slash so we never get "//accept-invite".
    invite_url = f"{get_settings().frontend_base_url.rstrip('/')}/accept-invite?token={token}"
    company = db.get(Company, admin.company_id)
    # Render the email in three forms: subject, plain text, HTML. "a, b, c = ..." unpacks a tuple.
    subject, text, html = invitation_email(
        invitation.full_name, admin.full_name, company.name, invitation.role.value, invite_url
    )
    # Sent now, not in the background, so the admin learns whether it went out
    # and can share the link another way if it did not.
    # send_email returns True/False and never raises (Part 10).
    email_sent = send_email(to=invitation.email, subject=subject, text=text, html=html)
    # Return everything the Team page needs, including the link to copy if the email failed.
    return UserInvitationRead(
        id=invitation.id,
        email=invitation.email,
        full_name=invitation.full_name,
        role=invitation.role,
        expires_at=invitation.expires_at,
        invite_url=invite_url,
        email_sent=email_sent,
    )


# ── The invitation email. Returns three strings: (subject, text, html). ──
def invitation_email(name: str, inviter: str, company: str, role: str, invite_url: str) -> tuple[str, str, str]:
    """The invitation as (subject, plain text, HTML). The HTML uses inline styles, which every mail app supports."""
    # "hiring_manager" -> "hiring manager"
    role_label = role.replace("_", " ")
    subject = f"{inviter} invited you to join {company} on HireDesk"
    # Plain-text version, for mail apps that don't show HTML.
    text = (
        f"Hi {name},\n\n"
        f"{inviter} has invited you to join {company} on HireDesk as a {role_label}.\n\n"
        f"Accept your invitation (the link works once and expires in 7 days):\n{invite_url}\n\n"
        "You can set a password or continue with the Google account this email was sent to.\n"
    )
    # A DICT COMPREHENSION: build {"name": escaped_name, "inviter": escaped_inviter, ...}.
    # Every value that goes into the HTML is escaped, so a name like "<script>" shows as text.
    safe = {key: escape(value) for key, value in
            {"name": name, "inviter": inviter, "company": company, "role": role_label, "url": invite_url}.items()}
    # A triple-quoted f-string spanning many lines. The backslash after """ avoids a leading blank line.
    # Inline style="..." is used because many mail apps (e.g. Gmail) ignore <style> blocks.
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


# ── GET /users: list the team (used e.g. to pick an interviewer). ──
# "role: Role | None = None" is a QUERY PARAMETER: GET /users?role=interviewer
@router.get("", response_model=list[UserRead])
def list_users(manager: ManagerUser, db: DbSession, role: Role | None = None):
    """Admins and hiring managers list company users, for example to pick an interviewer."""
    # Only people in the caller's company.
    query = select(User).where(User.company_id == manager.company_id)
    # Optional filter by role.
    if role is not None:
        query = query.where(User.role == role)
    # Alphabetical by name.
    return db.exec(query.order_by(User.full_name)).all()
```

## `backend/app/companies/router.py`

```python
# ── companies/router.py: one endpoint returning the signed-in user's company. ──

import uuid

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.auth.dependencies import CurrentUser
from app.companies.models import Company
from app.db.session import DbSession

router = APIRouter(prefix="/companies", tags=["Companies"])


# The response shape: just id and name. Defined here because it's only used here.
class CompanyRead(BaseModel):
    # Can be built straight from a Company database object.
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


# GET /companies/me. The sidebar shows this company name under the logo.
@router.get("/me", response_model=CompanyRead)
def read_my_company(user: CurrentUser, db: DbSession):
    # "me" = the caller's own company. You can never ask for another company's id.
    return db.get(Company, user.company_id)
```

**What to remember:**
- **Invitations:** only admins manage them, and only within their own company.
- **Tokens:** every (re)send makes a **new** token and stores only its **hash**, so old links stop working.
- **Emails:** invitations are sent **immediately** and the result (`email_sent`) is returned, so the admin always has the link even if the email fails.
- **HTML emails:** names are passed through `escape()` before going into the HTML.
