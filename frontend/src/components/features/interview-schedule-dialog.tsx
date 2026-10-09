"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { useScheduleInterview } from "@/lib/queries";
import { scheduleSchema } from "@/lib/schemas";

type ScheduleValues = z.infer<typeof scheduleSchema>;

// "YYYY-MM-DDTHH:mm" in the browser's time zone, the format datetime-local's min expects.
function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function InterviewScheduleDialog({
  interviewId,
  candidateName,
  open,
  onOpenChange,
}: {
  interviewId: string;
  candidateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const schedule = useScheduleInterview();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<ScheduleValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { starts_at: "", duration_minutes: 45, meeting_type: "virtual", meeting_url: "", location: "" },
  });
  const meetingType = watch("meeting_type");

  function onSubmit(values: ScheduleValues) {
    schedule.mutate(
      {
        interviewId,
        starts_at: new Date(values.starts_at).toISOString(),
        duration_minutes: values.duration_minutes,
        meeting_type: values.meeting_type,
        meeting_url: values.meeting_url || undefined,
        location: values.location || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Interview scheduled and applicant notified");
          onOpenChange(false);
        },
        onError: (error) => setError("starts_at", { message: error.message }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule with {candidateName}</DialogTitle>
          <DialogDescription>Choose a time and add the meeting details. The applicant will be emailed.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field label="Date and time" htmlFor="starts_at" error={errors.starts_at?.message}>
              <Input id="starts_at" type="datetime-local" min={localNow()} {...register("starts_at")} />
            </Field>
            <Field label="Minutes" htmlFor="duration_minutes" error={errors.duration_minutes?.message}>
              <Input id="duration_minutes" type="number" min={15} max={240} step={15} {...register("duration_minutes", { valueAsNumber: true })} />
            </Field>
          </div>
          <Field label="Meeting type" htmlFor="meeting_type">
            <Select id="meeting_type" {...register("meeting_type")}>
              <option value="virtual">Google Meet or Zoom</option>
              <option value="in_person">In person</option>
            </Select>
          </Field>
          {meetingType === "virtual" ? (
            <Field label="Meeting link" htmlFor="meeting_url" error={errors.meeting_url?.message}>
              <Input id="meeting_url" type="url" placeholder="https://meet.google.com/..." {...register("meeting_url")} />
            </Field>
          ) : (
            <Field label="Meeting location" htmlFor="location" error={errors.location?.message}>
              <Input id="location" {...register("location")} />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={schedule.isPending}>{schedule.isPending ? "Scheduling..." : "Schedule interview"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
