# Part 10: Email, admin notifications and progress reports (copyable)

- `core/email.py`: sends one email through Gmail (SMTP) or Resend, and **never crashes the request**.
- `core/notifications.py`: emails every admin of a company.
- `reports/`: builds the company-wide progress report (the admin dashboard) and emails it.

## `backend/app/core/email.py`

```python
# ── email.py: send one email. Returns True/False instead of raising. ──

# logging = write messages to the server log.
import logging
# smtplib = Python's built-in email sender (SMTP protocol). Used for Gmail.
import smtplib
# EmailMessage = builds a proper email (headers, text part, HTML part).
from email.message import EmailMessage
# parseaddr("HireDesk <a@b.com>") -> ("HireDesk", "a@b.com")
from email.utils import parseaddr

# The Resend SDK (an email-sending service with an API).
import resend

from app.core.config import get_settings

logger = logging.getLogger(__name__)


# to/subject/text are required; html is optional (a nicer version for mail apps that show HTML).
def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Send an email and return whether the provider accepted it.

    SMTP (for example Gmail with an app password) is used when SMTP_HOST is set,
    otherwise Resend. A failure is logged instead of raised: an email problem must
    not fail the request. Callers that need to know (invitations) check the result.
    """
    settings = get_settings()
    try:
        # Option 1: Gmail (or any SMTP server) if configured.
        if settings.smtp_host:
            _send_smtp(to, subject, text, html)
        # Option 2: Resend if it has a key.
        elif settings.resend_api_key:
            resend.api_key = settings.resend_api_key
            # Resend's API takes a dict ("payload").
            payload = {"from": settings.email_from, "to": [to], "subject": subject, "text": text}
            if html:
                payload["html"] = html
            resend.Emails.send(payload)
        # Option 3: nothing configured (e.g. local development or tests): skip and say so.
        else:
            logger.warning("No email provider is configured, so the email to %s was not sent", to)
            return False
    # ANY error (wrong password, network down, Resend refusing...) is caught here.
    except Exception:
        # logger.exception logs the message AND the full error details for debugging.
        logger.exception("Could not send the email to %s", to)
        return False
    return True


# The Gmail/SMTP path. The leading "_" marks it private to this file.
def _send_smtp(to: str, subject: str, text: str, html: str | None) -> None:
    settings = get_settings()
    message = EmailMessage()
    # Gmail only sends as the signed-in account, so its address must be the From address.
    # Keep the display NAME from EMAIL_FROM ("HireDesk") but use the Gmail address.
    name, address = parseaddr(settings.email_from)
    message["From"] = f"{name} <{settings.smtp_username or address}>" if name else (settings.smtp_username or address)
    message["To"] = to
    message["Subject"] = subject
    # The plain-text body...
    message.set_content(text)
    # ...and, if given, an HTML alternative. Mail apps show the best one they support.
    if html:
        message.add_alternative(html, subtype="html")

    # Port 465 = encrypted from the start (SMTP_SSL).
    # Port 587 = connect, then upgrade to encryption with STARTTLS.
    if settings.smtp_port == 465:
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
        server.starttls()
    # "with server:" closes the connection afterwards, even if something fails.
    with server:
        if settings.smtp_username:
            # For Gmail: the address + a 16-letter APP password (not your normal password).
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)
```

## `backend/app/core/notifications.py`

```python
# ── notifications.py: emails that keep the company admins informed. ──

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


# The email addresses of every admin in a company.
def admin_emails(db: Session, company_id: uuid.UUID) -> list[str]:
    return list(
        # select(User.email) loads only the email column (lighter than whole users).
        db.exec(select(User.email).where(User.company_id == company_id, User.role == Role.company_admin)).all()
    )


# Queue one email per admin. Called from candidates, interviews, scorecards and auth.
def notify_company_admins(
    db: Session,
    background_tasks: BackgroundTasks,
    company_id: uuid.UUID,
    subject: str,
    text: str,
) -> None:
    # A link to the dashboard is added to every notification.
    dashboard_url = f"{get_settings().frontend_base_url.rstrip('/')}/overview"
    # rstrip() removes trailing blank lines from the text before adding the link.
    body = f"{text.rstrip()}\n\nSee the full progress on your dashboard: {dashboard_url}\n"
    for email in admin_emails(db, company_id):
        # add_task(function, **arguments): FastAPI calls send_email(...) AFTER sending the response,
        # so the user never waits for the email server.
        # The "[HireDesk]" prefix makes these easy to filter in an inbox.
        background_tasks.add_task(send_email, to=email, subject=f"[HireDesk] {subject}", text=body)


# "hiring_manager" -> "hiring manager", "not_recommend" -> "not recommend".
def label(value: str) -> str:
    """'not_recommend' -> 'not recommend'."""
    return value.replace("_", " ")
```

## `backend/app/reports/schemas.py`

```python
# ── reports/schemas.py: the SHAPE of the progress report (what the admin dashboard receives). ──

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.interviews.models import InterviewStatus
from app.jobs.models import JobStatus, Stage
from app.scorecards.models import Recommendation
from app.users.models import Role


# The headline numbers (the stat tiles on the admin dashboard).
class ReportTotals(BaseModel):
    open_jobs: int
    active_candidates: int  # not hired and not rejected
    new_applications: int  # in the report period
    hired: int  # in the report period
    rejected: int  # in the report period
    interviews_to_schedule: int     # assigned but no time chosen yet
    upcoming_interviews: int        # scheduled, in the future
    scorecards_due: int  # the interview time has passed but the scorecard is not submitted


# One row of the "Progress by job" table.
class JobProgress(BaseModel):
    id: uuid.UUID
    title: str
    status: JobStatus
    hiring_manager_name: str | None
    applicants: int
    pipeline: dict[Stage, int]          # e.g. {"applied": 4, "screen": 2, ...}


# One row of "Team progress". Hiring managers use the first two numbers; interviewers the rest.
class TeamMemberProgress(BaseModel):
    id: uuid.UUID
    full_name: str
    role: Role
    open_jobs: int  # hiring managers
    active_candidates: int  # hiring managers
    interviews_to_schedule: int  # interviewers
    upcoming_interviews: int  # interviewers
    scorecards_due: int  # interviewers
    scorecards_submitted: int  # interviewers, in the report period


# One line of "Recent activity".
class StageActivity(BaseModel):
    application_id: uuid.UUID
    candidate_name: str
    job_title: str
    from_stage: Stage | None
    to_stage: Stage
    changed_by_name: str | None  # empty when the candidate applied
    changed_at: datetime


# One hire or rejection in "Results".
class HiringResult(BaseModel):
    application_id: uuid.UUID
    candidate_name: str
    job_title: str
    outcome: Stage  # hired or rejected
    decided_by_name: str | None
    decided_at: datetime
    match_score: int | None
    interviewer_recommendation: str | None


# One submitted scorecard in "Interview scorecards".
class ScorecardResult(BaseModel):
    application_id: uuid.UUID
    candidate_name: str
    job_title: str
    interviewer_name: str
    recommendation: Recommendation | None
    average_score: float | None
    submitted_at: datetime


# The whole report: everything above, plus the period it covers.
class ProgressReport(BaseModel):
    company_name: str
    generated_at: datetime
    period_days: int
    period_start: datetime
    totals: ReportTotals
    pipeline: dict[Stage, int]
    interviews_by_status: dict[InterviewStatus, int]
    jobs: list[JobProgress]
    team: list[TeamMemberProgress]
    recent_activity: list[StageActivity]
    results: list[HiringResult]
    scorecards: list[ScorecardResult]


# What "Email me this report" returns: who it was sent to.
class ReportEmailed(BaseModel):
    sent_to: list[str]
```

## `backend/app/reports/service.py`

```python
# ── reports/service.py: build the report, and render it as plain text for email. ──

"""The company-wide hiring progress report, shown on the admin dashboard and sent by email.

HireDesk is built for small companies, so the report loads the company's rows once
and counts in Python. That keeps every number easy to read and to change.
"""
import uuid
# Counter counts things: Counter(["a", "b", "a"]) -> {"a": 2, "b": 1}
from collections import Counter
from datetime import timedelta

from sqlmodel import Session, col, select

from app.candidates.models import Application, StageHistory
from app.companies.models import Company
from app.core.config import get_settings
from app.core.notifications import label
from app.db.common import utcnow
from app.interviews.models import Interview, InterviewStatus
from app.jobs.models import Job, JobStatus, Stage
from app.reports.schemas import (
    HiringResult,
    JobProgress,
    ProgressReport,
    ReportTotals,
    ScorecardResult,
    StageActivity,
    TeamMemberProgress,
)
from app.scorecards.models import Scorecard, ScorecardRating, ScorecardStatus
from app.users.models import Role, User

FINAL_STAGES = (Stage.hired, Stage.rejected)
# The most items to show in each list (activity, results, scorecards).
LIST_LIMIT = 15


def build_progress_report(db: Session, company_id: uuid.UUID, period_days: int = 7) -> ProgressReport:
    now = utcnow()
    # "The last 7 days" starts here.
    period_start = now - timedelta(days=period_days)

    # ---- Load everything for this company (a few queries, not one per row) ----
    company = db.get(Company, company_id)
    # Dicts keyed by id, for quick lookups: users[user_id] -> User.
    users = {user.id: user for user in db.exec(select(User).where(User.company_id == company_id)).all()}
    jobs = {job.id: job for job in db.exec(select(Job).where(Job.company_id == company_id)).all()}
    # Applications to those jobs. "... if jobs else {}": skip the query when there are no jobs
    # (an empty "IN ()" list isn't useful). list(jobs) = the job ids (a dict's keys).
    applications = {
        app.id: app
        for app in db.exec(select(Application).where(col(Application.job_id).in_(list(jobs)))).all()
    } if jobs else {}
    interviews = db.exec(
        select(Interview).where(col(Interview.application_id).in_(list(applications)))
    ).all() if applications else []
    # Scorecards keyed by INTERVIEW id, so scorecards.get(interview.id) finds an interview's scorecard.
    scorecards = {
        card.interview_id: card
        for card in db.exec(
            select(Scorecard).where(col(Scorecard.interview_id).in_([item.id for item in interviews]))
        ).all()
    } if interviews else {}
    # Stage moves within the period, newest first.
    history = db.exec(
        select(StageHistory)
        .where(col(StageHistory.application_id).in_(list(applications)), StageHistory.changed_at >= period_start)
        .order_by(col(StageHistory.changed_at).desc())
    ).all() if applications else []

    # ---- Small helper functions defined INSIDE this function (they can use the dicts above) ----
    def user_name(user_id: uuid.UUID | None) -> str | None:
        return users[user_id].full_name if user_id in users else None

    def is_active(application: Application) -> bool:
        return application.stage not in FINAL_STAGES

    # "Overdue": scheduled, the end time has passed, and no submitted scorecard.
    def scorecard_due(interview: Interview) -> bool:
        card = scorecards.get(interview.id)
        return (
            interview.status == InterviewStatus.scheduled
            and interview.ends_at is not None
            and interview.ends_at <= now
            and (card is None or card.status == ScorecardStatus.pending)
        )

    def upcoming(interview: Interview) -> bool:
        return interview.status == InterviewStatus.scheduled and interview.starts_at is not None and interview.starts_at > now

    # ---- Pipeline, per job and totals ----
    # Start every stage at 0 (so empty stages still appear), then add the real counts.
    pipeline = {stage: 0 for stage in Stage}
    pipeline.update(Counter(app.stage for app in applications.values()))
    interviews_by_status = {status: 0 for status in InterviewStatus}
    interviews_by_status.update(Counter(item.status for item in interviews))

    # One JobProgress per job, newest job first.
    # sorted(..., key=..., reverse=True): sort by created_at, descending.
    job_rows = []
    for job in sorted(jobs.values(), key=lambda item: item.created_at, reverse=True):
        job_apps = [app for app in applications.values() if app.job_id == job.id]
        job_pipeline = {stage: 0 for stage in Stage}
        job_pipeline.update(Counter(app.stage for app in job_apps))
        job_rows.append(
            JobProgress(
                id=job.id,
                title=job.title,
                status=job.status,
                hiring_manager_name=user_name(job.hiring_manager_id),
                applicants=len(job_apps),
                pipeline=job_pipeline,
            )
        )

    # Hires and rejections in the period = history rows that ended in a final stage.
    decisions = [row for row in history if row.to_stage in FINAL_STAGES]
    # sum(1 for x in items if condition) = "count the items where condition is true".
    totals = ReportTotals(
        open_jobs=sum(1 for job in jobs.values() if job.status == JobStatus.open),
        active_candidates=sum(1 for app in applications.values() if is_active(app)),
        new_applications=sum(1 for app in applications.values() if app.created_at >= period_start),
        hired=sum(1 for row in decisions if row.to_stage == Stage.hired),
        rejected=sum(1 for row in decisions if row.to_stage == Stage.rejected),
        interviews_to_schedule=interviews_by_status[InterviewStatus.assigned],
        upcoming_interviews=sum(1 for item in interviews if upcoming(item)),
        scorecards_due=sum(1 for item in interviews if scorecard_due(item)),
    )

    # ---- Each team member's workload ----
    team = []
    # Sort: hiring managers first (False sorts before True), then by name.
    for user in sorted(users.values(), key=lambda item: (item.role != Role.hiring_manager, item.full_name)):
        if user.role == Role.company_admin:
            continue                      # admins aren't listed in "team progress"
        own_jobs = [job for job in jobs.values() if job.hiring_manager_id == user.id]
        own_job_ids = {job.id for job in own_jobs}
        own_interviews = [item for item in interviews if item.interviewer_id == user.id]
        team.append(
            TeamMemberProgress(
                id=user.id,
                full_name=user.full_name,
                role=user.role,
                open_jobs=sum(1 for job in own_jobs if job.status == JobStatus.open),
                active_candidates=sum(1 for app in applications.values() if app.job_id in own_job_ids and is_active(app)),
                interviews_to_schedule=sum(1 for item in own_interviews if item.status == InterviewStatus.assigned),
                upcoming_interviews=sum(1 for item in own_interviews if upcoming(item)),
                scorecards_due=sum(1 for item in own_interviews if scorecard_due(item)),
                scorecards_submitted=sum(
                    1
                    for item in own_interviews
                    # := is the "walrus" operator: assign AND test in one go.
                    # card = scorecards.get(item.id), then check it isn't None.
                    if (card := scorecards.get(item.id)) is not None
                    and card.submitted_at is not None
                    and card.submitted_at >= period_start
                ),
            )
        )

    # ---- What happened in the period ----
    # Look up a history row's application and job.
    def candidate(application_id: uuid.UUID) -> tuple[Application, Job]:
        application = applications[application_id]
        return application, jobs[application.job_id]

    # The newest LIST_LIMIT stage moves.
    recent_activity = []
    for row in history[:LIST_LIMIT]:            # [:15] = the first 15 items
        application, job = candidate(row.application_id)
        recent_activity.append(
            StageActivity(
                application_id=application.id,
                candidate_name=application.full_name,
                job_title=job.title,
                from_stage=row.from_stage,
                to_stage=row.to_stage,
                changed_by_name=user_name(row.changed_by_id),
                changed_at=row.changed_at,
            )
        )

    # The newest hires/rejections.
    results = []
    for row in decisions[:LIST_LIMIT]:
        application, job = candidate(row.application_id)
        results.append(
            HiringResult(
                application_id=application.id,
                candidate_name=application.full_name,
                job_title=job.title,
                outcome=row.to_stage,
                decided_by_name=user_name(row.changed_by_id),
                decided_at=row.changed_at,
                match_score=application.match_score,
                interviewer_recommendation=application.interviewer_recommendation,
            )
        )

    # Scorecards submitted in the period, newest first, at most 15.
    # The ( ... for ... ) inside sorted() is a generator expression of (card, interview) pairs.
    submitted = sorted(
        (
            (card, interview)
            for interview in interviews
            if (card := scorecards.get(interview.id)) is not None
            and card.submitted_at is not None
            and card.submitted_at >= period_start
        ),
        key=lambda pair: pair[0].submitted_at,
        reverse=True,
    )[:LIST_LIMIT]
    # Load just those scorecards' ratings in ONE query, grouped by scorecard id.
    ratings: dict[uuid.UUID, list[int]] = {}
    if submitted:
        for rating in db.exec(
            select(ScorecardRating).where(col(ScorecardRating.scorecard_id).in_([card.id for card, _ in submitted]))
        ).all():
            # setdefault: get the list for this id, creating an empty one first if needed; then append.
            ratings.setdefault(rating.scorecard_id, []).append(rating.rating)
    scorecard_rows = []
    for card, interview in submitted:
        application, job = candidate(interview.application_id)
        values = ratings.get(card.id, [])
        scorecard_rows.append(
            ScorecardResult(
                application_id=application.id,
                candidate_name=application.full_name,
                job_title=job.title,
                interviewer_name=user_name(interview.interviewer_id) or "Former team member",
                recommendation=card.recommendation,
                average_score=round(sum(values) / len(values), 2) if values else None,
                submitted_at=card.submitted_at,
            )
        )

    return ProgressReport(
        company_name=company.name,
        generated_at=now,
        period_days=period_days,
        period_start=period_start,
        totals=totals,
        pipeline=pipeline,
        interviews_by_status=interviews_by_status,
        jobs=job_rows,
        team=team,
        recent_activity=recent_activity,
        results=results,
        scorecards=scorecard_rows,
    )


# The same report as a plain-text email.
def render_report_text(report: ProgressReport) -> str:
    """The progress report as a plain-text email."""
    t = report.totals                         # short name
    # A tiny function stored in a variable: format a date like "12 Oct 2026, 08:00 UTC".
    # (# noqa: E731 tells the linter "yes, I meant to assign a lambda".)
    date = lambda value: value.strftime("%d %b %Y, %H:%M UTC")  # noqa: E731
    # Build the email line by line in a list, then join with newlines at the end.
    lines = [
        f"HireDesk progress report for {report.company_name}",
        f"The last {report.period_days} days, up to {date(report.generated_at)}",
        "",
        "AT A GLANCE",
        f"  Open jobs:               {t.open_jobs}",
        f"  Active candidates:       {t.active_candidates}",
        f"  New applications:        {t.new_applications}",
        f"  Hired:                   {t.hired}",
        f"  Rejected:                {t.rejected}",
        f"  Interviews to schedule:  {t.interviews_to_schedule}",
        f"  Upcoming interviews:     {t.upcoming_interviews}",
        f"  Scorecards overdue:      {t.scorecards_due}",
        "",
        "PIPELINE (all candidates)",
        # "Applied: 4 | Screen: 2 | ..." (.title() capitalises the first letter of each word)
        "  " + " | ".join(f"{label(stage.value).title()}: {count}" for stage, count in report.pipeline.items()),
        "",
        "JOBS",
    ]
    if not report.jobs:
        lines.append("  No jobs yet.")
    for job in report.jobs:
        manager = job.hiring_manager_name or "no hiring manager"
        # Only the non-zero active stages, e.g. "applied 4, screen 2".
        active = ", ".join(
            f"{label(stage.value)} {count}" for stage, count in job.pipeline.items() if count and stage not in FINAL_STAGES
        )
        lines.append(
            f"  - {job.title} ({job.status.value}, {manager}): {job.applicants} applicants"
            f"{'; ' + active if active else ''}; hired {job.pipeline[Stage.hired]}"
        )

    # "lines += [...]" adds several lines at once.
    lines += ["", "TEAM"]
    if not report.team:
        lines.append("  No hiring managers or interviewers yet.")
    for member in report.team:
        if member.role == Role.hiring_manager:
            lines.append(
                f"  - {member.full_name} (hiring manager): {member.open_jobs} open jobs, "
                f"{member.active_candidates} active candidates"
            )
        else:
            lines.append(
                f"  - {member.full_name} (interviewer): {member.interviews_to_schedule} to schedule, "
                f"{member.upcoming_interviews} upcoming, {member.scorecards_due} scorecards overdue, "
                f"{member.scorecards_submitted} submitted this period"
            )

    lines += ["", "RESULTS THIS PERIOD"]
    if not report.results:
        lines.append("  No hiring decisions this period.")
    for result in report.results:
        score = f"match {result.match_score}/100" if result.match_score is not None else "no match score"
        recommendation = label(result.interviewer_recommendation or "no interviewer recommendation")
        lines.append(
            f"  - {result.outcome.value.upper()}: {result.candidate_name} for {result.job_title} "
            f"by {result.decided_by_name or 'unknown'} ({score}, {recommendation})"
        )

    lines += ["", "SCORECARDS SUBMITTED THIS PERIOD"]
    if not report.scorecards:
        lines.append("  No scorecards submitted this period.")
    for card in report.scorecards:
        average = f"{card.average_score}/5" if card.average_score is not None else "no ratings"
        recommendation = label(card.recommendation.value) if card.recommendation else "no recommendation"
        lines.append(
            f"  - {card.candidate_name} ({card.job_title}) by {card.interviewer_name}: {average}, {recommendation}"
        )

    lines += ["", "RECENT ACTIVITY"]
    if not report.recent_activity:
        lines.append("  No candidate activity this period.")
    for item in report.recent_activity:
        if item.from_stage is None:
            what = "applied"
        else:
            what = f"{label(item.from_stage.value)} -> {label(item.to_stage.value)} by {item.changed_by_name or 'unknown'}"
        lines.append(f"  - {date(item.changed_at)}: {item.candidate_name} ({item.job_title}) {what}")

    dashboard_url = f"{get_settings().frontend_base_url.rstrip('/')}/overview"
    lines += ["", f"Open your dashboard: {dashboard_url}", ""]
    return "\n".join(lines)


def report_subject(report: ProgressReport) -> str:
    return f"[HireDesk] Progress report: {report.company_name}, last {report.period_days} days"
```

## `backend/app/reports/router.py`

```python
# ── reports/router.py: the admin dashboard data, and "Email me this report". ──

from fastapi import APIRouter, BackgroundTasks, Query

from app.auth.dependencies import AdminUser
from app.core.email import send_email
from app.db.session import DbSession
from app.reports.schemas import ProgressReport, ReportEmailed
from app.reports.service import build_progress_report, render_report_text, report_subject

router = APIRouter(prefix="/reports", tags=["Reports"])

# A reusable query-parameter definition: ?days=7 by default, allowed 1 to 90.
PeriodDays = Query(7, ge=1, le=90, description="How many days back the 'this period' numbers cover")


# GET /reports/progress?days=30. Admins only. The admin dashboard calls this.
@router.get("/progress", response_model=ProgressReport)
def read_progress_report(admin: AdminUser, db: DbSession, days: int = PeriodDays):
    """The company admin's view of hiring progress across every job and team member."""
    # Always the ADMIN'S OWN company.
    return build_progress_report(db, admin.company_id, days)


# POST /reports/progress/email?days=7: email the report to the admin who clicked.
@router.post("/progress/email", response_model=ReportEmailed)
def email_progress_report(admin: AdminUser, db: DbSession, background_tasks: BackgroundTasks, days: int = PeriodDays):
    """Email the progress report to the admin who asked for it."""
    report = build_progress_report(db, admin.company_id, days)
    background_tasks.add_task(send_email, to=admin.email, subject=report_subject(report), text=render_report_text(report))
    return ReportEmailed(sent_to=[admin.email])
```

## `backend/app/reports/send_progress_reports.py`

```python
# ── send_progress_reports.py: a SCRIPT (not an endpoint) that emails every company's admins. ──
# GitHub Actions runs it every Monday: python -m app.reports.send_progress_reports

"""Email every company's admins their progress report.

Run it on a schedule from the backend folder, for example every Monday at 8:00:

    python -m app.reports.send_progress_reports            # the last 7 days
    python -m app.reports.send_progress_reports --days 1   # a daily report

Linux/macOS cron:   0 8 * * 1  cd /path/to/backend && python -m app.reports.send_progress_reports
Windows:            schtasks /Create /SC WEEKLY /D MON /ST 08:00 /TN "HireDesk report" ^
                      /TR "cmd /c cd /d C:\\path\\to\\backend && python -m app.reports.send_progress_reports"
"""
# argparse = read command-line options like "--days 1".
import argparse
import logging

from sqlmodel import Session, select

from app.companies.models import Company
from app.core.email import send_email
from app.core.notifications import admin_emails
# The engine directly (there's no web request here, so no DbSession dependency).
from app.db.session import engine
from app.reports.service import build_progress_report, render_report_text, report_subject


def send_progress_reports(period_days: int = 7) -> int:
    """Returns how many emails were handed to the email provider."""
    sent = 0
    # Open a session ourselves; "with" closes it at the end.
    with Session(engine) as db:
        for company in db.exec(select(Company)).all():
            recipients = admin_emails(db, company.id)
            if not recipients:
                continue                   # a company with no admins: skip
            report = build_progress_report(db, company.id, period_days)
            subject, text = report_subject(report), render_report_text(report)
            for email in recipients:
                # Sent directly (no BackgroundTasks outside a web request).
                send_email(to=email, subject=subject, text=text)
                sent += 1
    return sent


# This block runs only when the file is executed as a script, not when it's imported (e.g. by tests).
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)    # show log messages in the terminal
    # __doc__ = the docstring at the top; shown by --help.
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=7, help="the report period in days (default 7)")
    args = parser.parse_args()
    print(f"Sent {send_progress_reports(args.days)} progress report email(s).")
```
