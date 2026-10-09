"use client";

import { CalendarClock, CalendarPlus, ClipboardCheck, Video } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApplications, useInterviews } from "@/lib/queries";
import type { Interview } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { Stat, TaskRow } from "./parts";

export function InterviewerDashboard() {
  const interviews = useInterviews();
  const applications = useApplications();

  const now = Date.now();
  const list = interviews.data ?? [];
  const candidate = (interview: Interview) => applications.data?.find((item) => item.id === interview.application_id);
  const hasEnded = (interview: Interview) => interview.ends_at !== null && new Date(interview.ends_at).getTime() <= now;

  const toSchedule = list.filter((item) => item.status === "assigned");
  const scorecardsDue = list.filter((item) => item.status === "scheduled" && hasEnded(item));
  const upcoming = list
    .filter((item) => item.status === "scheduled" && !hasEnded(item))
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  const completed = list.filter((item) => item.status === "completed");
  const loading = interviews.isLoading;
  const tasks = toSchedule.length + scorecardsDue.length;

  return (
    <>
      {interviews.isError && <ErrorState message={interviews.error.message} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting for a date" value={toSchedule.length} loading={loading} tone="attention" />
        <Stat label="Scorecards to submit" value={scorecardsDue.length} loading={loading} tone="attention" />
        <Stat label="Upcoming interviews" value={upcoming.length} loading={loading} />
        <Stat label="Completed" value={completed.length} loading={loading} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your to-do list</CardTitle>
            <CardDescription>
              {tasks === 0 ? "You are all caught up." : `${tasks} thing${tasks === 1 ? "" : "s"} need${tasks === 1 ? "s" : ""} you.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tasks === 0 ? (
              <EmptyState icon={ClipboardCheck} title="Nothing to do right now" description="New interview assignments will show up here." />
            ) : (
              <ul className="divide-y">
                {toSchedule.map((interview) => (
                  <TaskRow
                    key={interview.id}
                    icon={CalendarPlus}
                    title={candidate(interview)?.full_name ?? "Candidate"}
                    detail={`${candidate(interview)?.job_title ?? "Interview"} · pick a date and meeting format`}
                    href="/interviews"
                    action="Schedule"
                  />
                ))}
                {scorecardsDue.map((interview) => (
                  <TaskRow
                    key={interview.id}
                    icon={ClipboardCheck}
                    title={candidate(interview)?.full_name ?? "Candidate"}
                    detail={`Interviewed ${interview.starts_at ? formatDateTime(interview.starts_at) : ""} · scorecard due`}
                    href="/interviews"
                    action="Submit scorecard"
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your upcoming interviews</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No interviews scheduled" />
            ) : (
              <ul className="divide-y">
                {upcoming.slice(0, 8).map((interview) => {
                  const person = candidate(interview);
                  return (
                    <li key={interview.id} className="flex items-center gap-3 py-3">
                      <Avatar name={person?.full_name ?? "?"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{person?.full_name ?? "Candidate"}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {interview.starts_at && formatDateTime(interview.starts_at)}
                          {interview.duration_minutes ? ` · ${interview.duration_minutes} min` : ""}
                          {interview.meeting_type === "in_person" && interview.location ? ` · ${interview.location}` : ""}
                        </p>
                      </div>
                      {interview.meeting_type === "virtual" && interview.meeting_url && (
                        <a
                          href={interview.meeting_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                        >
                          <Video className="size-4" /> Join
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
