"""The company-wide hiring progress report, shown on the admin dashboard and sent by email.

HireDesk is built for small companies, so the report loads the company's rows once
and counts in Python. That keeps every number easy to read and to change.
"""
import uuid
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
LIST_LIMIT = 15


def build_progress_report(db: Session, company_id: uuid.UUID, period_days: int = 7) -> ProgressReport:
    now = utcnow()
    period_start = now - timedelta(days=period_days)

    company = db.get(Company, company_id)
    users = {user.id: user for user in db.exec(select(User).where(User.company_id == company_id)).all()}
    jobs = {job.id: job for job in db.exec(select(Job).where(Job.company_id == company_id)).all()}
    applications = {
        app.id: app
        for app in db.exec(select(Application).where(col(Application.job_id).in_(list(jobs)))).all()
    } if jobs else {}
    interviews = db.exec(
        select(Interview).where(col(Interview.application_id).in_(list(applications)))
    ).all() if applications else []
    scorecards = {
        card.interview_id: card
        for card in db.exec(
            select(Scorecard).where(col(Scorecard.interview_id).in_([item.id for item in interviews]))
        ).all()
    } if interviews else {}
    history = db.exec(
        select(StageHistory)
        .where(col(StageHistory.application_id).in_(list(applications)), StageHistory.changed_at >= period_start)
        .order_by(col(StageHistory.changed_at).desc())
    ).all() if applications else []

    def user_name(user_id: uuid.UUID | None) -> str | None:
        return users[user_id].full_name if user_id in users else None

    def is_active(application: Application) -> bool:
        return application.stage not in FINAL_STAGES

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
    pipeline = {stage: 0 for stage in Stage}
    pipeline.update(Counter(app.stage for app in applications.values()))
    interviews_by_status = {status: 0 for status in InterviewStatus}
    interviews_by_status.update(Counter(item.status for item in interviews))

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

    decisions = [row for row in history if row.to_stage in FINAL_STAGES]
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
    for user in sorted(users.values(), key=lambda item: (item.role != Role.hiring_manager, item.full_name)):
        if user.role == Role.company_admin:
            continue
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
                    if (card := scorecards.get(item.id)) is not None
                    and card.submitted_at is not None
                    and card.submitted_at >= period_start
                ),
            )
        )

    # ---- What happened in the period ----
    def candidate(application_id: uuid.UUID) -> tuple[Application, Job]:
        application = applications[application_id]
        return application, jobs[application.job_id]

    recent_activity = []
    for row in history[:LIST_LIMIT]:
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
    ratings: dict[uuid.UUID, list[int]] = {}
    if submitted:
        for rating in db.exec(
            select(ScorecardRating).where(col(ScorecardRating.scorecard_id).in_([card.id for card, _ in submitted]))
        ).all():
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


def render_report_text(report: ProgressReport) -> str:
    """The progress report as a plain-text email."""
    t = report.totals
    date = lambda value: value.strftime("%d %b %Y, %H:%M UTC")  # noqa: E731
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
        "  " + " | ".join(f"{label(stage.value).title()}: {count}" for stage, count in report.pipeline.items()),
        "",
        "JOBS",
    ]
    if not report.jobs:
        lines.append("  No jobs yet.")
    for job in report.jobs:
        manager = job.hiring_manager_name or "no hiring manager"
        active = ", ".join(
            f"{label(stage.value)} {count}" for stage, count in job.pipeline.items() if count and stage not in FINAL_STAGES
        )
        lines.append(
            f"  - {job.title} ({job.status.value}, {manager}): {job.applicants} applicants"
            f"{'; ' + active if active else ''}; hired {job.pipeline[Stage.hired]}"
        )

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
