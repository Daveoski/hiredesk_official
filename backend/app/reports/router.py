from fastapi import APIRouter, BackgroundTasks, Query

from app.auth.dependencies import AdminUser
from app.core.email import send_email
from app.db.session import DbSession
from app.reports.schemas import ProgressReport, ReportEmailed
from app.reports.service import build_progress_report, render_report_text, report_subject

router = APIRouter(prefix="/reports", tags=["Reports"])

PeriodDays = Query(7, ge=1, le=90, description="How many days back the 'this period' numbers cover")


@router.get("/progress", response_model=ProgressReport)
def read_progress_report(admin: AdminUser, db: DbSession, days: int = PeriodDays):
    """The company admin's view of hiring progress across every job and team member."""
    return build_progress_report(db, admin.company_id, days)


@router.post("/progress/email", response_model=ReportEmailed)
def email_progress_report(admin: AdminUser, db: DbSession, background_tasks: BackgroundTasks, days: int = PeriodDays):
    """Email the progress report to the admin who asked for it."""
    report = build_progress_report(db, admin.company_id, days)
    background_tasks.add_task(send_email, to=admin.email, subject=report_subject(report), text=render_report_text(report))
    return ReportEmailed(sent_to=[admin.email])
