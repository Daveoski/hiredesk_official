# Part 17: The three role dashboards (copyable)

Each dashboard fetches only the data its user may see (the backend enforces this), works out "what needs doing", and arranges the building blocks from Part 16.

## `interviewer-dashboard.tsx`

```tsx
"use client";

import { ArrowRight, CalendarCheck2, CalendarClock, CalendarPlus, ClipboardCheck, ClipboardPen } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications, useInterviews } from "@/lib/queries";
import type { Interview, User } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
// "./parts" = the file next to this one.
import { AllClear, Agenda, DashboardHero, QuietEmpty, Section, StatTile, TaskRow } from "./parts";

export function InterviewerDashboard({ user }: { user: User }) {
  // For an interviewer, the API returns only THEIR interviews and assigned candidates.
  const interviews = useInterviews();
  const applications = useApplications();

  const now = Date.now();
  // "?? []" = an empty list while loading, so .filter() below never crashes.
  const list = interviews.data ?? [];
  // Find the candidate (application) for an interview.
  const candidate = (interview: Interview) => applications.data?.find((item) => item.id === interview.application_id);
  // Has the interview's end time passed?
  const hasEnded = (interview: Interview) => interview.ends_at !== null && new Date(interview.ends_at).getTime() <= now;

  // Sort the interviews into buckets:
  const toSchedule = list.filter((item) => item.status === "assigned");                        // needs a date
  const scorecardsDue = list.filter((item) => item.status === "scheduled" && hasEnded(item));  // over, no scorecard
  const upcoming = list
    .filter((item) => item.status === "scheduled" && !hasEnded(item) && item.starts_at)
    // ISO date strings sort correctly as text, so localeCompare puts the earliest first.
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  const completed = list.filter((item) => item.status === "completed");
  const loading = interviews.isLoading;
  const tasks = toSchedule.length + scorecardsDue.length;

  // The one-sentence summary in the greeting banner (chained ternaries: first true condition wins).
  // `task${tasks === 1 ? "" : "s"}` handles singular/plural.
  // "!" after starts_at = "definitely not null here" (upcoming only contains items with a start).
  const summary = loading
    ? "Loading your interviews..."
    : tasks > 0
      ? `You have ${tasks} interview task${tasks === 1 ? "" : "s"} waiting. Clearing them keeps candidates moving.`
      : upcoming.length > 0
        ? `You're all caught up. Your next interview is ${formatDateTime(upcoming[0].starts_at!)}.`
        : "You're all caught up. New interview assignments will appear here.";

  return (
    <>
      <DashboardHero
        name={user.full_name}
        summary={summary}
        figure={tasks}
        figureLabel={tasks === 1 ? "task waiting on you" : "tasks waiting on you"}
        loading={loading}
        action={
          <Button asChild>
            <Link href="/interviews">
              Open my interviews <ArrowRight />
            </Link>
          </Button>
        }
      />

      {interviews.isError && <ErrorState message={interviews.error.message} />}

      {/* Four tiles: 2 per row on phones, 4 on large screens. delay staggers the fade-in. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Waiting for a date" value={toSchedule.length} icon={CalendarPlus} loading={loading} status="warning" hint={toSchedule.length ? "Pick a time" : "None waiting"} delay={60} />
        <StatTile label="Scorecards to submit" value={scorecardsDue.length} icon={ClipboardPen} loading={loading} status="warning" hint={scorecardsDue.length ? "Interview finished" : "All submitted"} delay={120} />
        <StatTile label="Upcoming interviews" value={upcoming.length} icon={CalendarClock} loading={loading} delay={180} />
        <StatTile label="Completed" value={completed.length} icon={CalendarCheck2} loading={loading} hint="Scorecards submitted" delay={240} />
      </div>

      {/* A 5-column grid on large screens: the to-do list takes 3, the schedule 2. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Section title="Your to-do list" description="Do these first. Each opens the interview." className="lg:col-span-3" delay={300}>
          {loading ? (
            <Skeleton className="h-40" />
          ) : tasks === 0 ? (
            <AllClear title="Nothing waiting on you" description="When you're assigned an interview, it will show up here." />
          ) : (
            // divide-y = a thin line between rows.
            <ul className="divide-y">
              {/* Overdue scorecards first (urgent), linking to the candidate page where the scorecard lives. */}
              {scorecardsDue.map((interview) => (
                <TaskRow
                  key={interview.id}
                  urgent
                  icon={ClipboardCheck}
                  title={candidate(interview)?.full_name ?? "Candidate"}
                  detail={`${candidate(interview)?.job_title ?? "Interview"} · interviewed ${interview.starts_at ? formatDateTime(interview.starts_at) : ""}`}
                  href={`/candidates/${interview.application_id}`}
                  action="Submit scorecard"
                />
              ))}
              {/* Then interviews that need a date (scheduled from the Interviews page). */}
              {toSchedule.map((interview) => (
                <TaskRow
                  key={interview.id}
                  icon={CalendarPlus}
                  title={candidate(interview)?.full_name ?? "Candidate"}
                  detail={`${candidate(interview)?.job_title ?? "Interview"} · choose a date and meeting format`}
                  href="/interviews"
                  action="Schedule"
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Your schedule" description="Upcoming interviews." className="lg:col-span-2" href="/interviews" linkLabel="All interviews" delay={360}>
          {loading ? (
            <Skeleton className="h-40" />
          ) : upcoming.length === 0 ? (
            <QuietEmpty icon={CalendarClock} title="No interviews scheduled" />
          ) : (
            // Turn each interview into an AgendaItem. slice(0, 6) = at most six.
            <Agenda
              items={upcoming.slice(0, 6).map((interview) => ({
                id: interview.id,
                starts_at: interview.starts_at!,
                title: candidate(interview)?.full_name ?? "Candidate",
                // Build "Designer · 45 min · Video call": filter(Boolean) drops empty parts, join adds " · ".
                detail: [
                  candidate(interview)?.job_title,
                  interview.duration_minutes && `${interview.duration_minutes} min`,
                  interview.meeting_type === "in_person" ? interview.location : "Video call",
                ]
                  .filter(Boolean)
                  .join(" · "),
                // A Join button only for video calls.
                joinUrl: interview.meeting_type === "virtual" ? interview.meeting_url : null,
              }))}
            />
          )}
        </Section>
      </div>
    </>
  );
}
```

## `manager-dashboard.tsx`

```tsx
"use client";

import { Briefcase, CalendarClock, Gavel, Inbox, Plus, UserCheck, Users, Hourglass } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/shared/empty-state";
import { StageBadge } from "@/components/shared/stage-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RECOMMENDATION_LABEL } from "@/lib/constants";
import { useApplications, useInterviews, useJobs } from "@/lib/queries";
import { MAIN_STAGES, isFinal } from "@/lib/constants";
import type { Application, Stage, User } from "@/lib/types";
import { AllClear, Agenda, DashboardHero, OutcomeTile, QuietEmpty, Section, StageBars, StatTile, TaskRow, relativeTime } from "./parts";

// onCreateJob is passed in by the overview page; it opens the "New job" dialog.
export function ManagerDashboard({ user, onCreateJob }: { user: User; onCreateJob: () => void }) {
  // The backend already limits these lists to the jobs this hiring manager owns.
  const jobs = useJobs();
  const applications = useApplications();
  const interviews = useInterviews();

  const apps = applications.data ?? [];
  const byId = (id: string) => apps.find((item) => item.id === id);
  const now = Date.now();
  // Interviews still in progress (assigned or scheduled).
  const openInterviews = (interviews.data ?? []).filter((item) => item.status === "assigned" || item.status === "scheduled");
  // Future scheduled interviews, earliest first.
  const upcoming = (interviews.data ?? [])
    .filter((item) => item.status === "scheduled" && item.starts_at !== null && new Date(item.starts_at).getTime() > now)
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  const openJobs = (jobs.data ?? []).filter((job) => job.status === "open");
  const active = apps.filter((a) => !isFinal(a.stage));

  // What is waiting on this hiring manager, most decisive first.
  // 1) Candidates at Offer: make the final decision.
  const awaitingDecision = apps.filter((item) => item.stage === "offer");
  // 2) In the Interview stage, with a recommendation, and no interview still open: ready to review.
  // .some() = true if ANY open interview belongs to this candidate.
  const interviewsDone = apps.filter(
    (item) =>
      item.stage === "interview" &&
      item.interviewer_recommendation !== null &&
      !openInterviews.some((interview) => interview.application_id === item.id),
  );
  // 3) New applicants to screen.
  const toScreen = apps.filter((item) => item.stage === "applied");
  const tasks = awaitingDecision.length + interviewsDone.length + toScreen.length;
  const loading = applications.isLoading;

  // Count candidates per main stage, e.g. {applied: 3, screen: 1, interview: 2, offer: 1}.
  // Object.fromEntries turns [[key, value], ...] into an object.
  const pipeline = Object.fromEntries(MAIN_STAGES.map((stage) => [stage, apps.filter((a) => a.stage === stage).length])) as Record<Stage, number>;

  // A small helper that builds one TaskRow for a candidate. "typeof Inbox" = "an icon component like Inbox".
  const task = (item: Application, icon: typeof Inbox, detail: string, action: string, urgent = false) => (
    <TaskRow key={item.id} urgent={urgent} icon={icon} title={item.full_name} detail={`${item.job_title} · ${detail}`} href={`/candidates/${item.id}`} action={action} />
  );

  const summary = loading
    ? "Loading your hiring pipeline..."
    : tasks > 0
      ? `${tasks} candidate${tasks === 1 ? " is" : "s are"} waiting for your next step across ${openJobs.length} open job${openJobs.length === 1 ? "" : "s"}.`
      : openJobs.length > 0
        ? "Every candidate has a next step. Nice work."
        : "Create a job to get a public apply page and start receiving applicants.";

  return (
    <>
      <DashboardHero
        name={user.full_name}
        summary={summary}
        figure={tasks}
        figureLabel={tasks === 1 ? "candidate needs you" : "candidates need you"}
        loading={loading}
        action={
          <>
            <Button onClick={onCreateJob}>
              <Plus /> New job
            </Button>
            <Button asChild variant="outline">
              <Link href="/candidates">Review candidates</Link>
            </Button>
          </>
        }
      />

      {applications.isError && <ErrorState message={applications.error.message} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Open jobs" value={openJobs.length} icon={Briefcase} loading={jobs.isLoading} hint={`${jobs.data?.length ?? 0} jobs in total`} delay={60} />
        <StatTile label="Active candidates" value={active.length} icon={Users} loading={loading} hint={`${apps.length} applicants in total`} delay={120} />
        <StatTile label="Upcoming interviews" value={upcoming.length} icon={CalendarClock} loading={interviews.isLoading} delay={180} />
        <StatTile label="Offers awaiting decision" value={awaitingDecision.length} icon={Hourglass} loading={loading} status="warning" hint={awaitingDecision.length ? "Hire or reject" : "None pending"} delay={240} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Section title="Your to-do list" description="Candidates on your jobs that need your next step." className="lg:col-span-3" delay={300}>
          {loading ? (
            <Skeleton className="h-48" />
          ) : tasks === 0 ? (
            <AllClear title="You're all caught up" description="New applicants and finished interviews will show up here." />
          ) : (
            <ul className="divide-y">
              {/* Decisions first (urgent), then reviews, then at most 8 new applicants. */}
              {awaitingDecision.map((item) => task(item, Gavel, "at offer stage, make the final decision", "Decide", true))}
              {interviewsDone.map((item) =>
                task(item, UserCheck, `interviewers say "${RECOMMENDATION_LABEL[item.interviewer_recommendation!]}"`, "Review"),
              )}
              {toScreen.slice(0, 8).map((item) => task(item, Inbox, `applied ${relativeTime(item.created_at)}`, "Screen"))}
            </ul>
          )}
          {/* If there are more than 8 new applicants, link to the rest. */}
          {toScreen.length > 8 && (
            <Link href="/candidates" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
              + {toScreen.length - 8} more new applicants
            </Link>
          )}
        </Section>

        <Section title="Your pipeline" description="Active candidates on your jobs, by stage." className="lg:col-span-2" delay={360}>
          {loading ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <StageBars pipeline={pipeline} stages={MAIN_STAGES} />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <OutcomeTile outcome="hired" value={apps.filter((a) => a.stage === "hired").length} hint="all time" />
                <OutcomeTile outcome="rejected" value={apps.filter((a) => a.stage === "rejected").length} hint="all time" />
              </div>
            </>
          )}
        </Section>

        <Section title="Your jobs" href="/jobs" linkLabel="All jobs" className="lg:col-span-3" delay={420}>
          {jobs.data && jobs.data.length === 0 ? (
            <QuietEmpty icon={Briefcase} title="No jobs yet" description="Create your first job to get a public apply page." />
          ) : (
            <ul className="divide-y">
              {jobs.data?.slice(0, 6).map((job) => {
                const jobApps = apps.filter((a) => a.job_id === job.id);
                const jobActive = jobApps.filter((a) => !isFinal(a.stage)).length;
                // The busiest job's applicant count, so each bar is a fraction of it.
                const maxApplicants = Math.max(1, ...(jobs.data ?? []).map((j) => apps.filter((a) => a.job_id === j.id).length));
                return (
                  <li key={job.id}>
                    {/* A 2-column grid: title | counts, then a full-width bar row (col-span-2). */}
                    <Link href={`/jobs/${job.id}`} className="group -mx-2 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 rounded-lg px-2 py-3 hover:bg-muted/60">
                      <span className="truncate font-semibold group-hover:text-primary">{job.title}</span>
                      <span className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{jobActive}</span> active · {jobApps.length} total
                      </span>
                      <span className="col-span-2 flex items-center gap-3">
                        {/* The track (grey) and the fill (purple) of a small progress bar. */}
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${(jobApps.length / maxApplicants) * 100}%` }} />
                        </span>
                        <span className="w-14 text-right text-xs capitalize text-muted-foreground">{job.status}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Coming up" description="Interviews on your jobs." href="/interviews" linkLabel="All interviews" className="lg:col-span-2" delay={480}>
          {interviews.isLoading ? (
            <Skeleton className="h-40" />
          ) : upcoming.length === 0 ? (
            <QuietEmpty icon={CalendarClock} title="No interviews scheduled" />
          ) : (
            <Agenda
              items={upcoming.slice(0, 5).map((interview) => ({
                id: interview.id,
                starts_at: interview.starts_at!,
                title: byId(interview.application_id)?.full_name ?? "Candidate",
                detail: byId(interview.application_id)?.job_title ?? "Interview",
                href: `/candidates/${interview.application_id}`,
              }))}
            />
          )}
        </Section>

        <Section title="Newest applicants" href="/candidates" linkLabel="All candidates" className="lg:col-span-5" delay={540}>
          {apps.length === 0 ? (
            <QuietEmpty icon={Users} title="No applicants yet" description="Open a job and share its apply page." />
          ) : (
            // Two columns of applicants from small screens up.
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {apps.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <Link href={`/candidates/${item.id}`} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/60">
                    <Avatar name={item.full_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold group-hover:text-primary">{item.full_name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.job_title} · {relativeTime(item.created_at)}
                      </p>
                    </div>
                    <StageBadge stage={item.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
```

## `admin-dashboard.tsx`

```tsx
"use client";

// Several icons, one per line (same as a one-line import).
import { AlertTriangle, Briefcase, CalendarClock, ClipboardCheck, Inbox, Mail, UserPlus, Users, Activity, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/shared/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RECOMMENDATION_LABEL } from "@/lib/constants";
import { useEmailProgressReport, useProgressReport } from "@/lib/queries";
import { MAIN_STAGES, ROLE_LABEL, STAGE_COLOR, STAGE_LABEL } from "@/lib/constants";
import type { ProgressReport, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DashboardHero, OutcomeTile, QuietEmpty, Section, StageBars, StageDot, StatTile, Timeline, relativeTime } from "./parts";

// The period switch options.
const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function AdminDashboard({ user }: { user: User }) {
  // The selected period. Changing it changes the query key, so a new report is fetched.
  const [days, setDays] = useState(7);
  // ONE request gives the whole page: GET /reports/progress?days=7 (built by reports/service.py).
  const report = useProgressReport(days);
  const emailReport = useEmailProgressReport();
  const data = report.data;
  const totals = data?.totals;
  const loading = report.isLoading;
  const periodName = `the last ${days} days`;

  // The summary sentence; the "+" joins text pieces. The overdue part is added only when > 0.
  const summary = !totals
    ? "Loading your company's hiring progress..."
    : `In ${periodName}: ${totals.new_applications} new application${totals.new_applications === 1 ? "" : "s"}, ` +
      `${totals.hired} hire${totals.hired === 1 ? "" : "s"} and ${totals.upcoming_interviews} interview${totals.upcoming_interviews === 1 ? "" : "s"} coming up.` +
      (totals.scorecards_due ? ` ${totals.scorecards_due} scorecard${totals.scorecards_due === 1 ? " is" : "s are"} overdue.` : "");

  return (
    <>
      <DashboardHero
        name={user.full_name}
        summary={summary}
        figure={totals?.active_candidates ?? 0}
        figureLabel="active candidates company-wide"
        loading={loading}
        action={
          <Button asChild variant="outline">
            <Link href="/team">
              <UserPlus /> Invite teammates
            </Link>
          </Button>
        }
      />

      {/* One filter row scopes everything below it. */}
      <div className="dash-rise mb-6 flex flex-wrap items-center justify-between gap-3">
        {/* A segmented control. role="radiogroup"/"radio" + aria-checked tell screen readers
            it's a pick-one choice. */}
        <div role="radiogroup" aria-label="Report period" className="inline-flex rounded-full border bg-card p-1 shadow-sm">
          {PERIODS.map((period) => (
            <button
              key={period.days}
              role="radio"
              aria-checked={days === period.days}
              onClick={() => setDays(period.days)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                days === period.days ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {period.label}
            </button>
          ))}
        </div>
        {/* Email the report: disabled while sending or before the data arrives. */}
        <Button
          variant="outline"
          disabled={emailReport.isPending || !data}
          onClick={() =>
            emailReport.mutate(days, {
              onSuccess: (result) => toast.success(`Progress report sent to ${result.sent_to.join(", ")}`),
              onError: (error) => toast.error(error.message),
            })
          }
        >
          <Mail /> {emailReport.isPending ? "Sending..." : "Email me this report"}
        </Button>
      </div>

      {report.isError && <ErrorState message={report.error.message} />}

      {/* While a NEW period loads, the old report stays visible but faded (isPlaceholderData). */}
      <div className={cn("transition-opacity", report.isPlaceholderData && "opacity-60")}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label="Open jobs" value={totals?.open_jobs ?? 0} icon={Briefcase} loading={loading} hint={`${data?.jobs.length ?? 0} jobs in total`} delay={60} />
          <StatTile label="New applications" value={totals?.new_applications ?? 0} icon={Inbox} loading={loading} hint={`In ${periodName}`} delay={120} />
          <StatTile
            label="Upcoming interviews"
            value={totals?.upcoming_interviews ?? 0}
            icon={CalendarClock}
            loading={loading}
            hint={totals?.interviews_to_schedule ? `${totals.interviews_to_schedule} still need a date` : "All have a date"}
            delay={180}
          />
          <StatTile
            label="Overdue scorecards"
            value={totals?.scorecards_due ?? 0}
            icon={ClipboardCheck}
            loading={loading}
            status="warning"
            hint={totals?.scorecards_due ? "Interview over, no scorecard yet" : "Everything submitted"}
            delay={240}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* The pipeline chart + period hire/reject tiles. */}
          <Section title="Hiring pipeline" description="Active candidates in every job, by stage." className="lg:col-span-2" delay={300}>
            {!data ? (
              <Skeleton className="h-44" />
            ) : (
              <>
                <StageBars pipeline={data.pipeline} stages={MAIN_STAGES} />
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <OutcomeTile outcome="hired" value={data.totals.hired} hint={`in ${days} days`} />
                  <OutcomeTile outcome="rejected" value={data.totals.rejected} hint={`in ${days} days`} />
                </div>
              </>
            )}
          </Section>

          <Section title="Team progress" description="What each teammate has on their plate." href="/team" linkLabel="Manage team" className="lg:col-span-3" delay={360}>
            {!data ? <Skeleton className="h-44" /> : <TeamList team={data.team} />}
          </Section>

          <Section title="Progress by job" description="Where every job's candidates are right now." className="lg:col-span-5" delay={420}>
            {!data ? <Skeleton className="h-32" /> : <JobsTable jobs={data.jobs} />}
          </Section>

          {/* Hires and rejections in the period. */}
          <Section title="Results" description={`Hiring decisions in ${periodName}.`} className="lg:col-span-2" delay={480}>
            {!data ? (
              <Skeleton className="h-32" />
            ) : data.results.length === 0 ? (
              <QuietEmpty icon={Trophy} title="No decisions yet" description="Hires and rejections will appear here." />
            ) : (
              <ul className="divide-y">
                {data.results.map((result) => (
                  <li key={result.application_id} className="flex items-center gap-3 py-3">
                    <Avatar name={result.candidate_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{result.candidate_name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {result.job_title}
                        {result.match_score !== null && ` · match ${result.match_score}/100`}
                      </p>
                    </div>
                    <OutcomeBadge outcome={result.outcome === "hired" ? "hired" : "rejected"} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Submitted scorecards: name, job, interviewer, rating meter, recommendation. */}
          <Section title="Interview scorecards" description={`Submitted in ${periodName}.`} className="lg:col-span-3" delay={540}>
            {!data ? (
              <Skeleton className="h-32" />
            ) : data.scorecards.length === 0 ? (
              <QuietEmpty icon={ClipboardCheck} title="No scorecards yet" description="Interviewers' ratings appear here as they submit them." />
            ) : (
              <ul className="divide-y">
                {data.scorecards.map((card) => (
                  // A key built from two values that together are unique.
                  // The grid has 2 columns on phones and 3 from small screens up.
                  <li key={`${card.application_id}-${card.submitted_at}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[1fr_9rem_7rem]">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{card.candidate_name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {card.job_title} · by {card.interviewer_name} · {relativeTime(card.submitted_at)}
                      </p>
                    </div>
                    <RatingMeter value={card.average_score} />
                    <p className="text-right text-sm font-semibold sm:text-left">
                      {card.recommendation ? RECOMMENDATION_LABEL[card.recommendation] : "No recommendation"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Recent activity as a timeline. */}
          <Section title="Recent activity" description={`Every candidate move in ${periodName}.`} className="lg:col-span-5" delay={600}>
            {!data ? (
              <Skeleton className="h-32" />
            ) : data.recent_activity.length === 0 ? (
              <QuietEmpty icon={Activity} title="No activity in this period" />
            ) : (
              <Timeline
                items={data.recent_activity.map((item) => ({
                  id: `${item.application_id}-${item.changed_at}`,
                  stage: item.to_stage,
                  at: item.changed_at,
                  // The title is JSX: "Name applied" or "Name moved to ● Offer".
                  title: (
                    <>
                      <span className="font-semibold">{item.candidate_name}</span>{" "}
                      {item.from_stage === null ? (
                        "applied"
                      ) : (
                        <>
                          moved to <StageDot stage={item.to_stage} />
                        </>
                      )}
                    </>
                  ),
                  detail:
                    item.from_stage === null
                      ? item.job_title
                      : `${item.job_title} · from ${STAGE_LABEL[item.from_stage]} · by ${item.changed_by_name ?? "unknown"}`,
                }))}
              />
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

// Each teammate's workload. ProgressReport["team"] = "the type of the team field of ProgressReport".
function TeamList({ team }: { team: ProgressReport["team"] }) {
  if (team.length === 0) {
    return <QuietEmpty icon={Users} title="No teammates yet" description="Invite hiring managers and interviewers from the Team page." />;
  }
  return (
    <ul className="divide-y">
      {team.map((member) => (
        <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
          <Avatar name={member.full_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{member.full_name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABEL[member.role]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {/* Different numbers for the two roles. */}
            {member.role === "hiring_manager" ? (
              <>
                <Metric value={member.open_jobs} label="open jobs" />
                <Metric value={member.active_candidates} label="active candidates" />
              </>
            ) : (
              <>
                <Metric value={member.upcoming_interviews} label="upcoming" />
                <Metric value={member.scorecards_submitted} label="submitted" />
                {member.interviews_to_schedule > 0 && <Metric value={member.interviews_to_schedule} label="to schedule" />}
                {/* Overdue scorecards get a red pill with a warning icon. */}
                {member.scorecards_due > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-status-critical-wash px-2.5 py-0.5 text-xs font-semibold text-status-critical">
                    <AlertTriangle className="size-3.5" /> {member.scorecards_due} overdue
                  </span>
                )}
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// "3 open jobs": bold number + grey label.
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-muted-foreground">
      <span className="font-semibold text-foreground">{value}</span> {label}
    </span>
  );
}

// "Progress by job" as a real <table> (better for accessibility than divs).
function JobsTable({ jobs }: { jobs: ProgressReport["jobs"] }) {
  if (jobs.length === 0) {
    return <QuietEmpty icon={Briefcase} title="No jobs yet" description="Hiring managers create jobs once you invite them." />;
  }
  const maxApplicants = Math.max(1, ...jobs.map((job) => job.applicants));
  return (
    // overflow-x-auto = on narrow screens the table scrolls sideways instead of overflowing the page.
    <div className="-mx-5 overflow-x-auto px-5">
      {/* min-w-180 = the table is at least 45rem wide, so the columns never get squashed. */}
      <table className="w-full min-w-180 text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
            <th className="py-2.5 pr-4 font-semibold">Job</th>
            <th className="py-2.5 pr-4 font-semibold">Applicants</th>
            {/* One column per main stage, with its colour dot. */}
            {MAIN_STAGES.map((stage) => (
              <th key={stage} className="py-2.5 pr-4 text-right font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
                  {STAGE_LABEL[stage]}
                </span>
              </th>
            ))}
            <th className="py-2.5 pr-1 text-right font-semibold">Hired</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {jobs.map((job) => (
            <tr key={job.id} className="transition-colors hover:bg-muted/40">
              <td className="py-3 pr-4">
                <p className="font-semibold">{job.title}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="capitalize">{job.status}</span> · {job.hiring_manager_name ?? "No hiring manager"}
                </p>
              </td>
              <td className="py-3 pr-4">
                <span className="flex items-center gap-2.5">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${(job.applicants / maxApplicants) * 100}%` }} />
                  </span>
                  <span className="font-semibold tabular-nums">{job.applicants}</span>
                </span>
              </td>
              {/* Zero counts are faded so the real numbers stand out. */}
              {MAIN_STAGES.map((stage) => (
                <td key={stage} className={cn("py-3 pr-4 text-right tabular-nums", job.pipeline[stage] === 0 && "text-muted-foreground/60")}>
                  {job.pipeline[stage]}
                </td>
              ))}
              <td className="py-3 pr-1 text-right font-semibold tabular-nums">{job.pipeline.hired}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A 1-5 average as a meter: the track is a lighter step of the same hue.
function RatingMeter({ value }: { value: number | null }) {
  if (value === null) return <span className="text-sm text-muted-foreground">No ratings</span>;
  return (
    <span className="flex items-center gap-2" aria-label={`Average rating ${value} out of 5`}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-accent">
        {/* 4.4 out of 5 -> 88% wide */}
        <span className="block h-full rounded-full bg-primary" style={{ width: `${(value / 5) * 100}%` }} />
      </span>
      {/* toFixed(1) = always one decimal: 4 -> "4.0" */}
      <span className="text-sm font-semibold tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}

// "🏆 Hired" (green) or "⚠ Rejected" (red): colour + icon + word.
function OutcomeBadge({ outcome }: { outcome: "hired" | "rejected" }) {
  const hired = outcome === "hired";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{
        background: hired ? "var(--status-good-wash)" : "var(--status-critical-wash)",
        color: hired ? "var(--status-good)" : "var(--status-critical)",
      }}
    >
      {hired ? <Trophy className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
      {hired ? "Hired" : "Rejected"}
    </span>
  );
}
```
