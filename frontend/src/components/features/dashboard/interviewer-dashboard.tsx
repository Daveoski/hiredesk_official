"use client";

import { ArrowRight, CalendarCheck2, CalendarClock, CalendarPlus, ClipboardCheck, ClipboardPen } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications, useInterviews } from "@/lib/queries";
import type { Interview, User } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { AllClear, Agenda, DashboardHero, QuietEmpty, Section, StatTile, TaskRow } from "./parts";

export function InterviewerDashboard({ user }: { user: User }) {
  const interviews = useInterviews();
  const applications = useApplications();

  const now = Date.now();
  const list = interviews.data ?? [];
  const candidate = (interview: Interview) => applications.data?.find((item) => item.id === interview.application_id);
  const hasEnded = (interview: Interview) => interview.ends_at !== null && new Date(interview.ends_at).getTime() <= now;

  const toSchedule = list.filter((item) => item.status === "assigned");
  const scorecardsDue = list.filter((item) => item.status === "scheduled" && hasEnded(item));
  const upcoming = list
    .filter((item) => item.status === "scheduled" && !hasEnded(item) && item.starts_at)
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  const completed = list.filter((item) => item.status === "completed");
  const loading = interviews.isLoading;
  const tasks = toSchedule.length + scorecardsDue.length;

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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Waiting for a date" value={toSchedule.length} icon={CalendarPlus} loading={loading} status="warning" hint={toSchedule.length ? "Pick a time" : "None waiting"} delay={60} />
        <StatTile label="Scorecards to submit" value={scorecardsDue.length} icon={ClipboardPen} loading={loading} status="warning" hint={scorecardsDue.length ? "Interview finished" : "All submitted"} delay={120} />
        <StatTile label="Upcoming interviews" value={upcoming.length} icon={CalendarClock} loading={loading} delay={180} />
        <StatTile label="Completed" value={completed.length} icon={CalendarCheck2} loading={loading} hint="Scorecards submitted" delay={240} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Section title="Your to-do list" description="Do these first. Each opens the interview." className="lg:col-span-3" delay={300}>
          {loading ? (
            <Skeleton className="h-40" />
          ) : tasks === 0 ? (
            <AllClear title="Nothing waiting on you" description="When you're assigned an interview, it will show up here." />
          ) : (
            <ul className="divide-y">
              {scorecardsDue.map((interview) => (
                <TaskRow
                  key={interview.id}
                  urgent
                  icon={ClipboardCheck}
                  title={candidate(interview)?.full_name ?? "Candidate"}
                  detail={`${candidate(interview)?.job_title ?? "Interview"} · interviewed ${interview.starts_at ? formatDateTime(interview.starts_at) : ""}`}
                  href="/interviews"
                  action="Submit scorecard"
                />
              ))}
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
            <Agenda
              items={upcoming.slice(0, 6).map((interview) => ({
                id: interview.id,
                starts_at: interview.starts_at!,
                title: candidate(interview)?.full_name ?? "Candidate",
                detail: [
                  candidate(interview)?.job_title,
                  interview.duration_minutes && `${interview.duration_minutes} min`,
                  interview.meeting_type === "in_person" ? interview.location : "Video call",
                ]
                  .filter(Boolean)
                  .join(" · "),
                joinUrl: interview.meeting_type === "virtual" ? interview.meeting_url : null,
              }))}
            />
          )}
        </Section>
      </div>
    </>
  );
}
