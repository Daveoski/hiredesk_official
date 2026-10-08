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
  const update = useUpdateJob(job?.id ?? "");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JobValues>({
    resolver: zodResolver(jobSchema),
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
    const salary_min = values.salary_min ? Number(values.salary_min) : null;
    const salary_max = values.salary_max ? Number(values.salary_max) : null;
    if (job) {
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
          ...(salary_min !== null ? { salary_min } : {}),
          ...(salary_max !== null ? { salary_max } : {}),
        },
        {
          onSuccess: async (created) => {
            if (values.status !== "draft") {
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
