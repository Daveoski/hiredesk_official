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
import { MAIN_STAGES, isFinal } from "@/lib/stages";
import type { Application, Stage, User } from "@/lib/types";
import { AllClear, Agenda, DashboardHero, OutcomeTile, QuietEmpty, Section, StageBars, StatTile, TaskRow, relativeTime } from "./parts";

export function ManagerDashboard({ user, onCreateJob }: { user: User; onCreateJob: () => void }) {
  // The backend already limits these lists to the jobs this hiring manager owns.
  const jobs = useJobs();
  const applications = useApplications();
  const interviews = useInterviews();

  const apps = applications.data ?? [];
  const byId = (id: string) => apps.find((item) => item.id === id);
  const now = Date.now();
  const openInterviews = (interviews.data ?? []).filter((item) => item.status === "assigned" || item.status === "scheduled");
  const upcoming = (interviews.data ?? [])
    .filter((item) => item.status === "scheduled" && item.starts_at !== null && new Date(item.starts_at).getTime() > now)
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  const openJobs = (jobs.data ?? []).filter((job) => job.status === "open");
  const active = apps.filter((a) => !isFinal(a.stage));

  // What is waiting on this hiring manager, most decisive first.
  const awaitingDecision = apps.filter((item) => item.stage === "offer");
  const interviewsDone = apps.filter(
    (item) =>
      item.stage === "interview" &&
      item.interviewer_recommendation !== null &&
      !openInterviews.some((interview) => interview.application_id === item.id),
  );
  const toScreen = apps.filter((item) => item.stage === "applied");
  const tasks = awaitingDecision.length + interviewsDone.length + toScreen.length;
  const loading = applications.isLoading;

  const pipeline = Object.fromEntries(MAIN_STAGES.map((stage) => [stage, apps.filter((a) => a.stage === stage).length])) as Record<Stage, number>;

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
              {awaitingDecision.map((item) => task(item, Gavel, "at offer stage, make the final decision", "Decide", true))}
              {interviewsDone.map((item) =>
                task(item, UserCheck, `interviewers say "${RECOMMENDATION_LABEL[item.interviewer_recommendation!]}"`, "Review"),
              )}
              {toScreen.slice(0, 8).map((item) => task(item, Inbox, `applied ${relativeTime(item.created_at)}`, "Screen"))}
            </ul>
          )}
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
                const maxApplicants = Math.max(1, ...(jobs.data ?? []).map((j) => apps.filter((a) => a.job_id === j.id).length));
                return (
                  <li key={job.id}>
                    <Link href={`/jobs/${job.id}`} className="group -mx-2 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 rounded-lg px-2 py-3 hover:bg-muted/60">
                      <span className="truncate font-semibold group-hover:text-primary">{job.title}</span>
                      <span className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{jobActive}</span> active · {jobApps.length} total
                      </span>
                      <span className="col-span-2 flex items-center gap-3">
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
