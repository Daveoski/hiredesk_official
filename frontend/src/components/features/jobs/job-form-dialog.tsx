"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useCreateJob, useDraftJob, useUpdateJob } from "@/lib/queries";
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
  const draft = useDraftJob();
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    formState: { errors },
  } = useForm<JobValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      title: job?.title ?? "",
      description: job?.description ?? "",
      qualification_requirements: job?.qualification_requirements ?? "",
      eligibility_criteria: job?.eligibility_criteria ?? "",
      salary_min: job?.salary_min?.toString() ?? "",
      salary_max: job?.salary_max?.toString() ?? "",
      status: job?.status ?? "draft",
    },
  });

  const pending = create.isPending || update.isPending || draft.isPending;

  // The AI assistant writes the description, qualifications and eligibility criteria from the title.
  // Anything already in the description is passed along as notes (location, seniority, tools...).
  function draftWithAI() {
    const title = getValues("title").trim();
    if (!title) {
      setError("title", { message: "Enter a job title first" });
      return;
    }
    draft.mutate(
      { title, notes: getValues("description").slice(0, 2000) },
      {
        onSuccess: (result) => {
          const options = { shouldDirty: true, shouldValidate: true };
          setValue("description", result.description, options);
          setValue("qualification_requirements", result.qualification_requirements, options);
          setValue("eligibility_criteria", result.eligibility_criteria, options);
          toast.success("Draft ready. Review and edit it before saving.");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

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
          eligibility_criteria: values.eligibility_criteria,
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
          eligibility_criteria: values.eligibility_criteria,
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
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-accent p-3 text-sm text-accent-foreground">
        <p className="min-w-0 flex-1">
          Let the AI assistant write the description, qualifications and eligibility criteria. Notes in the description (location, seniority, tools) guide the draft.
        </p>
        <Button type="button" size="sm" onClick={draftWithAI} disabled={pending}>
          <Sparkles /> {draft.isPending ? "Drafting..." : "Draft with AI"}
        </Button>
      </div>
      <Field label="Description" htmlFor="description" error={errors.description?.message}>
        <Textarea id="description" rows={6} {...register("description")} />
      </Field>
      <Field label="Required qualifications" htmlFor="qualification_requirements" error={errors.qualification_requirements?.message} hint="Separate qualifications with commas or new lines">
        <Textarea id="qualification_requirements" rows={4} {...register("qualification_requirements")} />
      </Field>
      <Field label="Eligibility criteria" htmlFor="eligibility_criteria" error={errors.eligibility_criteria?.message} hint="Conditions an applicant must meet to be considered, such as right to work or a required licence">
        <Textarea id="eligibility_criteria" rows={3} {...register("eligibility_criteria")} />
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
