"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { InterviewScheduleDialog } from "@/components/features/interview-schedule-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApplications, useInterviews, useUsers } from "@/lib/queries";
import type { Interview, InterviewStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { isManager, useAuthStore } from "@/stores/auth-store";

const TABS: { value: InterviewStatus; label: string }[] = [
  { value: "assigned", label: "Awaiting schedule" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function InterviewsPage() {
  const user = useAuthStore((state) => state.user);
  const interviews = useInterviews();
  const applications = useApplications();
  const users = useUsers(isManager(user));
  const [scheduling, setScheduling] = useState<string | null>(null);

  const interviewerName = (id: string) =>
    id === user?.id ? "You" : (users.data?.find((item) => item.id === id)?.full_name ?? "Interviewer");

  function renderList(status: InterviewStatus) {
    const rows: Interview[] = (interviews.data ?? [])
      .filter((item) => item.status === status)
      .sort((a, b) => (status === "scheduled" ? (a.starts_at ?? "").localeCompare(b.starts_at ?? "") : (b.starts_at ?? "").localeCompare(a.starts_at ?? "")));

    if (rows.length === 0) return <EmptyState icon={CalendarClock} title={`No ${status} interviews`} />;
    return (
      <Card className="overflow-hidden">
        <ul className="divide-y">
          {rows.map((item) => {
            const candidate = applications.data?.find((entry) => entry.id === item.application_id);
            return (
              <li key={item.id} className="flex items-center gap-3 px-5 py-4">
                <Link href={`/candidates/${item.application_id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary">
                  <Avatar name={candidate?.full_name ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{candidate?.full_name ?? "Candidate"}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {candidate?.job_title} · with {interviewerName(item.interviewer_id)}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">{item.starts_at ? formatDateTime(item.starts_at) : "Choose a date and time"}</p>
                    {item.duration_minutes && <p className="text-muted-foreground">{item.duration_minutes} min</p>}
                  </div>
                </Link>
                {user?.role === "interviewer" && item.status === "assigned" && candidate && (
                  <Button size="sm" onClick={() => setScheduling(item.id)}>Schedule</Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Interviews"
        description={isManager(user) ? "Review assigned interviews and their outcomes." : "Schedule interviews assigned to you and submit feedback."}
      />
      {interviews.isError && <ErrorState message={interviews.error.message} />}
      {interviews.isLoading && <Skeleton className="h-48" />}
      {interviews.data && (
        <Tabs defaultValue={user?.role === "interviewer" ? "assigned" : "scheduled"}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label} ({interviews.data.filter((item) => item.status === tab.value).length})
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              {renderList(tab.value)}
            </TabsContent>
          ))}
        </Tabs>
      )}
      {scheduling && (
        <InterviewScheduleDialog
          interviewId={scheduling}
          candidateName={applications.data?.find((item) => interviews.data?.find((row) => row.id === scheduling)?.application_id === item.id)?.full_name ?? "candidate"}
          open
          onOpenChange={(open) => !open && setScheduling(null)}
        />
      )}
    </>
  );
}
