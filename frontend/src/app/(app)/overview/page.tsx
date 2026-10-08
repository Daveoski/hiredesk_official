"use client";

import { CalendarClock, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { JobFormDialog } from "@/components/features/job-form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StageBadge } from "@/components/shared/stage-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications, useInterviews, useJobs } from "@/lib/queries";
import { isFinal } from "@/lib/stages";
import { formatDateTime } from "@/lib/utils";
import { isManager, useAuthStore } from "@/stores/auth-store";

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-2 h-9 w-14" /> : <p className="mt-1 font-display text-4xl font-bold">{value}</p>}
    </Card>
  );
}

export default function OverviewPage() {
  const user = useAuthStore((state) => state.user);
  const manager = isManager(user);
  const [creating, setCreating] = useState(false);

  const jobs = useJobs(manager);
  const applications = useApplications();
  const interviews = useInterviews();

  const apps = applications.data ?? [];
  const nameOf = (id: string) => apps.find((item) => item.id === id);
  const upcoming = (interviews.data ?? [])
    .filter((item) => item.status === "scheduled" && item.starts_at !== null)
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))
    .slice(0, 5);
  const openJobs = (jobs.data ?? []).filter((job) => job.status === "open");

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.full_name.split(" ")[0] ?? ""}`}
        description={manager ? "Here is where your hiring stands today." : "Here are the candidates and interviews assigned to you."}
        actions={
          user?.role === "hiring_manager" && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New job
            </Button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {manager && <Stat label="Open jobs" value={openJobs.length} loading={jobs.isLoading} />}
        <Stat label="Active candidates" value={apps.filter((a) => !isFinal(a.stage)).length} loading={applications.isLoading} />
        <Stat label="Interviews scheduled" value={upcoming.length} loading={interviews.isLoading} />
        <Stat label="Hired" value={apps.filter((a) => a.stage === "hired").length} loading={applications.isLoading} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {manager && (
          <Card>
            <CardHeader>
              <CardTitle>Job openings</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.data && jobs.data.length === 0 ? (
                <EmptyState icon={Plus} title="No jobs yet" description="Create your first job to get a public apply page." />
              ) : (
                <ul className="divide-y">
                  {jobs.data?.slice(0, 6).map((job) => (
                    <li key={job.id}>
                      <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-primary">
                        <span className="truncate font-semibold">{job.title}</span>
                        <span className="text-sm capitalize text-muted-foreground">
                          {job.status} · {apps.filter((a) => a.job_id === job.id).length} applicants
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No interviews scheduled" />
            ) : (
              <ul className="divide-y">
                {upcoming.map((interview) => {
                  const candidate = nameOf(interview.application_id);
                  return (
                    <li key={interview.id} className="flex items-center gap-3 py-3">
                      <Avatar name={candidate?.full_name ?? "?"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{candidate?.full_name ?? "Candidate"}</p>
                        <p className="truncate text-sm text-muted-foreground">{candidate?.job_title}</p>
                      </div>
                      {interview.starts_at && <span className="text-sm text-muted-foreground">{formatDateTime(interview.starts_at)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className={manager ? "lg:col-span-2" : "lg:col-span-1"}>
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

      <JobFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
