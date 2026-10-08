"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { useAssignInterviewer, useUsers } from "@/lib/queries";
import { assignInterviewerSchema } from "@/lib/schemas";
import type { Application } from "@/lib/types";

type AssignmentValues = z.infer<typeof assignInterviewerSchema>;

// Managers assign an interviewer; the interviewer chooses the time and meeting format.
export function ScheduleDialog({
  application,
  open,
  onOpenChange,
}: {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign interviewer</DialogTitle>
          <DialogDescription>Choose a teammate to interview {application.full_name} for {application.job_title}.</DialogDescription>
        </DialogHeader>
        {open && <ScheduleForm application={application} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({ application, onDone }: { application: Application; onDone: () => void }) {
  const interviewers = useUsers(true, "interviewer");
  const assign = useAssignInterviewer();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AssignmentValues>({
    resolver: zodResolver(assignInterviewerSchema),
    defaultValues: { interviewer_id: "" },
  });

  function onSubmit(values: AssignmentValues) {
    assign.mutate(
      { application_id: application.id, interviewer_id: values.interviewer_id },
      {
        onSuccess: () => { toast.success("Interviewer assigned"); onDone(); },
        onError: (error) => setError("interviewer_id", { message: error.message }),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Field label="Interviewer" htmlFor="interviewer_id" error={errors.interviewer_id?.message}>
        <Select id="interviewer_id" {...register("interviewer_id")}>
          <option value="">Choose an interviewer</option>
          {interviewers.data?.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={assign.isPending}>
          {assign.isPending ? "Assigning..." : "Assign interviewer"}
        </Button>
      </div>
    </form>
  );
}
