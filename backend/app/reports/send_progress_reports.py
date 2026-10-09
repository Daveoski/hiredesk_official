"""Email every company's admins their progress report.

Run it on a schedule from the backend folder, for example every Monday at 8:00:

    python -m app.reports.send_progress_reports            # the last 7 days
    python -m app.reports.send_progress_reports --days 1   # a daily report

Linux/macOS cron:   0 8 * * 1  cd /path/to/backend && python -m app.reports.send_progress_reports
Windows:            schtasks /Create /SC WEEKLY /D MON /ST 08:00 /TN "HireDesk report" ^
                      /TR "cmd /c cd /d C:\\path\\to\\backend && python -m app.reports.send_progress_reports"
"""
import argparse
import logging

from sqlmodel import Session, select

from app.companies.models import Company
from app.core.email import send_email
from app.core.notifications import admin_emails
from app.db.session import engine
from app.reports.service import build_progress_report, render_report_text, report_subject


def send_progress_reports(period_days: int = 7) -> int:
    """Returns how many emails were handed to the email provider."""
    sent = 0
    with Session(engine) as db:
        for company in db.exec(select(Company)).all():
            recipients = admin_emails(db, company.id)
            if not recipients:
                continue
            report = build_progress_report(db, company.id, period_days)
            subject, text = report_subject(report), render_report_text(report)
            for email in recipients:
                send_email(to=email, subject=subject, text=text)
                sent += 1
    return sent


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=7, help="the report period in days (default 7)")
    args = parser.parse_args()
    print(f"Sent {send_progress_reports(args.days)} progress report email(s).")
