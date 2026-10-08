"use client";

import { Briefcase, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JobFormDialog } from "@/components/features/job-form-dialog";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications, useJobs } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { isManager, useAuthStore } from "@/stores/auth-store";

const statusStyle = {
  open: "bg-stage-hired/15 text-stage-hired",
  draft: "bg-muted text-muted-foreground",
  closed: "bg-stage-rejected/10 text-stage-rejected",
} as const;

export default function JobsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [creating, setCreating] = useState(false);
  const jobs = useJobs(isManager(user));
  const applications = useApplications();

  // Interviewers cannot list jobs.
  useEffect(() => {
    if (user && !isManager(user)) router.replace("/overview");
  }, [user, router]);

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Each job has its own public apply page and pipeline."
        actions={
          user?.role === "hiring_manager" && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New job
            </Button>
          )
        }
      />
      {jobs.isError && <ErrorState message={jobs.error.message} />}
      {jobs.isLoading && <Skeleton className="h-48" />}
      {jobs.data && jobs.data.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title="No jobs yet"
          description="Create a job, open it, and share the public apply link."
          action={user?.role === "hiring_manager" && <Button onClick={() => setCreating(true)}>Create a job</Button>}
        />
      )}
      {jobs.data && jobs.data.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {jobs.data.map((job) => (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-semibold">{job.title}</p>
                    <p className="text-sm text-muted-foreground">Created {formatDate(job.created_at)}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {applications.data?.filter((a) => a.job_id === job.id).length ?? 0} applicants
                  </span>
                  <Badge className={`capitalize ${statusStyle[job.status]}`}>{job.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <JobFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
