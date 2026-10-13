# Part 18: Jobs pages (copyable)

- `/jobs`: the hiring manager's job list.
- `/jobs/[jobId]`: one job, shown as a **board** (one column per stage) plus a details tab.
- `JobFormDialog`: create or edit a job.
- `CandidateCard`: one candidate on the board.

## `src/app/(app)/jobs/page.tsx`

```tsx
"use client";

import { Briefcase, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JobFormDialog } from "@/components/features/jobs/job-form-dialog";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApplications, useJobs } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { isManager, useAuthStore } from "@/stores/auth-store";

// A colour per job status. "as const" makes the keys/values fixed, so TypeScript knows
// statusStyle[job.status] always exists.
const statusStyle = {
  open: "bg-stage-hired/15 text-stage-hired",          // green, 15% background
  draft: "bg-muted text-muted-foreground",              // grey
  closed: "bg-stage-rejected/10 text-stage-rejected",   // red, 10% background
} as const;

export default function JobsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [creating, setCreating] = useState(false);
  // Only fetch when the user is a hiring manager (enabled = isManager(user)).
  const jobs = useJobs(isManager(user));
  // Used to count applicants per job.
  const applications = useApplications();

  // Interviewers cannot list jobs.
  // (Admins aren't sent here by the menu either; their job overview is the admin dashboard.)
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
      {/* The four states of a data page: error, loading, empty, and data. */}
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
                  {/* Template string joins "capitalize" with the status colour classes. */}
                  <Badge className={`capitalize ${statusStyle[job.status]}`}>{job.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {/* The dialog is always in the page; "open" decides whether it shows. */}
      <JobFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
```

## `src/app/(app)/jobs/[jobId]/page.tsx`: the board

```tsx
"use client";

import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
// useParams reads the [jobId] part of the URL.
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CandidateCard } from "@/components/features/candidates/candidate-card";
import { JobFormDialog } from "@/components/features/jobs/job-form-dialog";
import { ErrorState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApplications, useJob } from "@/lib/queries";
import { PIPELINE, STAGE_COLOR, STAGE_LABEL } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

export default function JobPage() {
  // For /jobs/abc-123, jobId = "abc-123". <{ jobId: string }> tells TypeScript the shape.
  const { jobId } = useParams<{ jobId: string }>();
  const user = useAuthStore((state) => state.user);
  const job = useJob(jobId);
  const applications = useApplications(jobId);         // only this job's candidates
  const [editing, setEditing] = useState(false);

  // Early returns: show an error or a placeholder until the job loads.
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
            {/* Only open jobs have a working public link. */}
            {job.data.status === "open" && (
              <Button
                variant="outline"
                // navigator.clipboard.writeText copies text; .then runs after it succeeds.
                // window.location.origin = "https://hiredesk-app.vercel.app" on the live site.
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

      {/* Tabs: "pipeline" is shown first (defaultValue). */}
      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          {applications.isLoading && <Skeleton className="h-64" />}
          {applications.data && (
            // The board scrolls sideways on small screens (overflow-x-auto); the negative margins
            // let it reach the screen edges.
            <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
              {/* min-w-max = as wide as all the columns need. */}
              <div className="flex min-w-max gap-4">
                {/* One column per stage (all six). */}
                {PIPELINE.map((stage) => {
                  const items = applications.data.filter((item) => item.stage === stage);
                  return (
                    // <section> with aria-label = a named region for screen readers.
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
          {/* whitespace-pre-line keeps the line breaks the manager typed. */}
          <div className="max-w-prose rounded-lg border bg-card p-6">
            <p className="whitespace-pre-line leading-relaxed">{job.data.description}</p>
            <h2 className="mb-2 mt-6 font-display text-xl font-semibold">Required qualifications</h2>
            <p className="whitespace-pre-line leading-relaxed">{job.data.qualification_requirements || "No qualifications listed."}</p>
            <h2 className="mb-2 mt-6 font-display text-xl font-semibold">Salary range</h2>
            <p className="leading-relaxed">
              {/* ?.toLocaleString() = format only if not null; ?? "Not stated" otherwise. */}
              {job.data.salary_min?.toLocaleString() ?? "Not stated"} – {job.data.salary_max?.toLocaleString() ?? "Not stated"}
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Passing job={...} puts the dialog in "edit" mode. */}
      <JobFormDialog open={editing} onOpenChange={setEditing} job={job.data} />
    </>
  );
}
```

## `src/components/features/jobs/job-form-dialog.tsx`

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useCreateJob, useUpdateJob } from "@/lib/queries";
import { jobSchema } from "@/lib/schemas";
import type { Job } from "@/lib/types";

type JobValues = z.infer<typeof jobSchema>;

// Create a job (no `job`) or edit one. Only hiring managers can open this.
// open/onOpenChange let the PARENT control whether the dialog shows ("controlled component").
export function JobFormDialog({
  open,
  onOpenChange,
  job,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: Job;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{job ? "Edit job" : "Create a job"}</DialogTitle>
          <DialogDescription>
            {job ? "Changes show on the public page right away." : "Save it as a draft, or open it to start taking applications."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the form always starts from the current job. */}
        {open && <JobForm job={job} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function JobForm({ job, onDone }: { job?: Job; onDone: () => void }) {
  const create = useCreateJob();
  // Hooks can't be called conditionally, so both are always created; only one is used.
  const update = useUpdateJob(job?.id ?? "");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JobValues>({
    resolver: zodResolver(jobSchema),
    // Pre-fill from the job when editing; empty when creating.
    // Salaries are numbers in the API but text in <input>, so convert with toString().
    defaultValues: {
      title: job?.title ?? "",
      description: job?.description ?? "",
      qualification_requirements: job?.qualification_requirements ?? "",
      salary_min: job?.salary_min?.toString() ?? "",
      salary_max: job?.salary_max?.toString() ?? "",
      status: job?.status ?? "draft",
    },
  });

  const pending = create.isPending || update.isPending;

  function onSubmit(values: JobValues) {
    const onError = (error: Error) => toast.error(error.message);
    // Text from the inputs -> numbers (or null when empty).
    const salary_min = values.salary_min ? Number(values.salary_min) : null;
    const salary_max = values.salary_max ? Number(values.salary_max) : null;
    if (job) {
      // EDIT: send every field (PATCH accepts null salaries to clear them).
      update.mutate(
        {
          title: values.title,
          description: values.description,
          qualification_requirements: values.qualification_requirements,
          salary_min,
          salary_max,
          status: values.status,
        },
        { onSuccess: () => { toast.success("Job saved"); onDone(); }, onError },
      );
    } else {
      // A new job starts as a draft. If the manager chose another status, set it right after.
      create.mutate(
        {
          title: values.title,
          description: values.description,
          qualification_requirements: values.qualification_requirements,
          // Conditional spread: include salary_min only if it has a value.
          ...(salary_min !== null ? { salary_min } : {}),
          ...(salary_max !== null ? { salary_max } : {}),
        },
        {
          // "created" = the new job returned by the API.
          onSuccess: async (created) => {
            if (values.status !== "draft") {
              // POST /jobs always creates a draft, so open/close it with a PATCH.
              // .catch(() => null) = if that fails, still finish (the job exists as a draft).
              await api.patch(`/jobs/${created.id}`, { status: values.status }).catch(() => null);
            }
            toast.success("Job created");
            onDone();
          },
          onError,
        },
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Field label="Job title" htmlFor="title" error={errors.title?.message}>
        <Input id="title" placeholder="Product Designer" {...register("title")} />
      </Field>
      <Field label="Description" htmlFor="description" error={errors.description?.message}>
        <Textarea id="description" rows={6} {...register("description")} />
      </Field>
      <Field label="Required qualifications" htmlFor="qualification_requirements" error={errors.qualification_requirements?.message} hint="Separate qualifications with commas or new lines">
        <Textarea id="qualification_requirements" rows={4} {...register("qualification_requirements")} />
      </Field>
      {/* Two columns from small screens up. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum salary" htmlFor="salary_min" error={errors.salary_min?.message}>
          <Input id="salary_min" type="number" min="0" {...register("salary_min")} />
        </Field>
        <Field label="Maximum salary" htmlFor="salary_max" error={errors.salary_max?.message}>
          <Input id="salary_max" type="number" min="0" {...register("salary_max")} />
        </Field>
        <Field label="Status" htmlFor="status" hint="Only open jobs accept applications">
          <Select id="status" {...register("status")}>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {/* type="button" = doesn't submit the form. */}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : job ? "Save job" : "Create job"}
        </Button>
      </div>
    </form>
  );
}
```

## `src/components/features/candidates/candidate-card.tsx`

```tsx
import Link from "next/link";
import { StageMenu } from "@/components/shared/stage-menu";
import { Avatar } from "@/components/ui/avatar";
import { isManager, useAuthStore } from "@/stores/auth-store";
import type { Application } from "@/lib/types";
import { formatDate } from "@/lib/utils";

// One candidate on the job board: a link to their page and, for hiring managers, the "Move" menu.
export function CandidateCard({ application }: { application: Application }) {
  const user = useAuthStore((state) => state.user);
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <Link href={`/candidates/${application.id}`} className="flex items-center gap-3 hover:text-primary">
        <Avatar name={application.full_name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{application.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">Applied {formatDate(application.created_at)}</p>
        </div>
      </Link>
      {/* The Move/Hire/Reject dropdown (Part 19). Moving updates the board instantly (optimistic update). */}
      {isManager(user) && (
        <div className="mt-3 flex justify-end">
          <StageMenu application={application} />
        </div>
      )}
    </div>
  );
}
```
