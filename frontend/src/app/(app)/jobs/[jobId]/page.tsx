"use client";

import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CandidateCard } from "@/components/features/candidate-card";
import { JobFormDialog } from "@/components/features/job-form-dialog";
import { ErrorState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApplications, useJob } from "@/lib/queries";
import { PIPELINE, STAGE_COLOR, STAGE_LABEL } from "@/lib/stages";
import { useAuthStore } from "@/stores/auth-store";

export default function JobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const user = useAuthStore((state) => state.user);
  const job = useJob(jobId);
  const applications = useApplications(jobId);
  const [editing, setEditing] = useState(false);

  if (job.isError) return <ErrorState message={job.error.message} />;
  if (!job.data) return <Skeleton className="h-64" />;

  return (
    <>
      <Link href="/jobs" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
        All jobs
      </Link>
      <div className="mt-2" />
      <PageHeader
        title={job.data.title}
        description={`${applications.data?.length ?? 0} applicants`}
        actions={
          <>
            <Badge className="capitalize">{job.data.status}</Badge>
            {job.data.status === "open" && (
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(`${window.location.origin}/apply/${job.data.id}`)
                    .then(() => toast.success("Apply link copied"))
                }
              >
                <ExternalLink /> Copy apply link
              </Button>
            )}
            {user?.role === "hiring_manager" && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            )}
          </>
        }
      />

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          {applications.isLoading && <Skeleton className="h-64" />}
          {applications.data && (
            <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
              <div className="flex min-w-max gap-4">
                {PIPELINE.map((stage) => {
                  const items = applications.data.filter((item) => item.stage === stage);
                  return (
                    <section key={stage} aria-label={STAGE_LABEL[stage]} className="w-64 shrink-0 rounded-lg bg-muted/60 p-3">
                      <header className="mb-3 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 font-sans text-sm font-bold tracking-normal">
                          <span className="size-2.5 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
                          {STAGE_LABEL[stage]}
                        </h2>
                        <span className="text-xs font-semibold text-muted-foreground">{items.length}</span>
                      </header>
                      <div className="flex flex-col gap-2">
                        {items.map((item) => (
                          <CandidateCard key={item.id} application={item} />
                        ))}
                        {items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No candidates</p>}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="details">
          <div className="max-w-prose rounded-lg border bg-card p-6">
            <p className="whitespace-pre-line leading-relaxed">{job.data.description}</p>
            <h2 className="mb-2 mt-6 font-display text-xl font-semibold">Required qualifications</h2>
            <p className="whitespace-pre-line leading-relaxed">{job.data.qualification_requirements || "No qualifications listed."}</p>
            <h2 className="mb-2 mt-6 font-display text-xl font-semibold">Salary range</h2>
            <p className="leading-relaxed">
              {job.data.salary_min?.toLocaleString() ?? "Not stated"} – {job.data.salary_max?.toLocaleString() ?? "Not stated"}
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <JobFormDialog open={editing} onOpenChange={setEditing} job={job.data} />
    </>
  );
}
