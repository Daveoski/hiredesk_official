"use client";

import { CalendarClock, Gavel, Inbox, ListChecks, Plus, UserCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { StageBadge } from "@/components/shared/stage-badge";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RECOMMENDATION_LABEL } from "@/lib/constants";
import { useApplications, useInterviews, useJobs } from "@/lib/queries";
import { isFinal } from "@/lib/stages";
import type { Application } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { Stat, TaskRow } from "./parts";

export function ManagerDashboard() {
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

  // What is waiting on this hiring manager.
  const toScreen = apps.filter((item) => item.stage === "applied");
  const interviewsDone = apps.filter(
    (item) =>
      item.stage === "interview" &&
      item.interviewer_recommendation !== null &&
      !openInterviews.some((interview) => interview.application_id === item.id),
  );
  const awaitingDecision = apps.filter((item) => item.stage === "offer");
  const tasks = toScreen.length + interviewsDone.length + awaitingDecision.length;

  const task = (item: Application, icon: typeof Inbox, detail: string, action: string) => (
    <TaskRow key={item.id} icon={icon} title={item.full_name} detail={`${item.job_title} · ${detail}`} href={`/candidates/${item.id}`} action={action} />
  );

  return (
    <>
      {applications.isError && <ErrorState message={applications.error.message} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Your open jobs" value={openJobs.length} loading={jobs.isLoading} />
        <Stat label="Active candidates" value={apps.filter((a) => !isFinal(a.stage)).length} loading={applications.isLoading} />
        <Stat label="Waiting on you" value={tasks} loading={applications.isLoading} tone="attention" />
        <Stat label="Hired" value={apps.filter((a) => a.stage === "hired").length} loading={applications.isLoading} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your to-do list</CardTitle>
            <CardDescription>Candidates on your jobs that need your next step.</CardDescription>
          </CardHeader>
          <CardContent>
            {tasks === 0 ? (
              <EmptyState icon={ListChecks} title="You are all caught up" description="New applicants and finished interviews show up here." />
            ) : (
              <ul className="divide-y">
                {awaitingDecision.map((item) => task(item, Gavel, "at offer stage, make the final decision", "Decide"))}
                {interviewsDone.map((item) =>
                  task(
                    item,
                    UserCheck,
                    `interviews done, interviewers say "${RECOMMENDATION_LABEL[item.interviewer_recommendation!]}"`,
                    "Review",
                  ),
                )}
                {toScreen.slice(0, 10).map((item) => task(item, Inbox, "new applicant to screen", "Screen"))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.data && jobs.data.length === 0 ? (
              <EmptyState icon={Plus} title="No jobs yet" description="Create your first job to get a public apply page." />
            ) : (
              <ul className="divide-y">
                {jobs.data?.slice(0, 8).map((job) => {
                  const jobApps = apps.filter((a) => a.job_id === job.id);
                  return (
                    <li key={job.id}>
                      <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-primary">
                        <span className="truncate font-semibold">{job.title}</span>
                        <span className="shrink-0 text-sm capitalize text-muted-foreground">
                          {job.status} · {jobApps.filter((a) => !isFinal(a.stage)).length} active / {jobApps.length} applicants
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No interviews scheduled" />
            ) : (
              <ul className="divide-y">
                {upcoming.slice(0, 6).map((interview) => {
                  const person = byId(interview.application_id);
                  return (
                    <li key={interview.id}>
                      <Link href={`/candidates/${interview.application_id}`} className="flex items-center gap-3 py-3 hover:text-primary">
                        <Avatar name={person?.full_name ?? "?"} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{person?.full_name ?? "Candidate"}</p>
                          <p className="truncate text-sm text-muted-foreground">{person?.job_title}</p>
                        </div>
                        {interview.starts_at && <span className="text-sm text-muted-foreground">{formatDateTime(interview.starts_at)}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent applicants</CardTitle>
          </CardHeader>
          <CardContent>
            {apps.length === 0 ? (
              <EmptyState icon={Plus} title="No applicants yet" description="Open a job and share its apply page." />
            ) : (
              <ul className="divide-y">
                {apps.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <Link href={`/candidates/${item.id}`} className="flex items-center gap-3 py-3 hover:text-primary">
                      <Avatar name={item.full_name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{item.full_name}</p>
                        <p className="truncate text-sm text-muted-foreground">{item.job_title}</p>
                      </div>
                      <StageBadge stage={item.stage} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
