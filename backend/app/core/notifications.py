"""Emails that keep the company admins informed about hiring progress.

Every email is sent as a background task after the response, so a slow or failing
email provider never slows down or fails the request that caused it.
"""
import uuid

from fastapi import BackgroundTasks
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.email import send_email
from app.users.models import Role, User


def admin_emails(db: Session, company_id: uuid.UUID) -> list[str]:
    return list(
        db.exec(select(User.email).where(User.company_id == company_id, User.role == Role.company_admin)).all()
    )


def notify_company_admins(
    db: Session,
    background_tasks: BackgroundTasks,
    company_id: uuid.UUID,
    subject: str,
    text: str,
) -> None:
    dashboard_url = f"{get_settings().frontend_base_url.rstrip('/')}/overview"
    body = f"{text.rstrip()}\n\nSee the full progress on your dashboard: {dashboard_url}\n"
    for email in admin_emails(db, company_id):
        background_tasks.add_task(send_email, to=email, subject=f"[HireDesk] {subject}", text=body)


def label(value: str) -> str:
    """'not_recommend' -> 'not recommend'."""
    return value.replace("_", " ")
