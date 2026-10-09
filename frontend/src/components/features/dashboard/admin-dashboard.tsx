"use client";

import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  Inbox,
  Mail,
  UserPlus,
  Users,
  Activity,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/shared/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RECOMMENDATION_LABEL } from "@/lib/constants";
import { useEmailProgressReport, useProgressReport } from "@/lib/queries";
import { MAIN_STAGES, ROLE_LABEL, STAGE_COLOR, STAGE_LABEL } from "@/lib/stages";
import type { ProgressReport, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DashboardHero, OutcomeTile, QuietEmpty, Section, StageBars, StageDot, StatTile, Timeline, relativeTime } from "./parts";

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function AdminDashboard({ user }: { user: User }) {
  const [days, setDays] = useState(7);
  const report = useProgressReport(days);
  const emailReport = useEmailProgressReport();
  const data = report.data;
  const totals = data?.totals;
  const loading = report.isLoading;
  const periodName = `the last ${days} days`;

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

          <Section title="Interview scorecards" description={`Submitted in ${periodName}.`} className="lg:col-span-3" delay={540}>
            {!data ? (
              <Skeleton className="h-32" />
            ) : data.scorecards.length === 0 ? (
              <QuietEmpty icon={ClipboardCheck} title="No scorecards yet" description="Interviewers' ratings appear here as they submit them." />
            ) : (
              <ul className="divide-y">
                {data.scorecards.map((card) => (
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

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-muted-foreground">
      <span className="font-semibold text-foreground">{value}</span> {label}
    </span>
  );
}

function JobsTable({ jobs }: { jobs: ProgressReport["jobs"] }) {
  if (jobs.length === 0) {
    return <QuietEmpty icon={Briefcase} title="No jobs yet" description="Hiring managers create jobs once you invite them." />;
  }
  const maxApplicants = Math.max(1, ...jobs.map((job) => job.applicants));
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-180 text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
            <th className="py-2.5 pr-4 font-semibold">Job</th>
            <th className="py-2.5 pr-4 font-semibold">Applicants</th>
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
        <span className="block h-full rounded-full bg-primary" style={{ width: `${(value / 5) * 100}%` }} />
      </span>
      <span className="text-sm font-semibold tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}

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
