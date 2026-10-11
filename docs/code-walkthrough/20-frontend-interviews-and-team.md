# Part 20: Interviews page, scheduling, Team page (copyable)

## `src/app/(app)/interviews/page.tsx`

```tsx
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

// One tab per interview status.
const TABS: { value: InterviewStatus; label: string }[] = [
  { value: "assigned", label: "Awaiting schedule" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function InterviewsPage() {
  const user = useAuthStore((state) => state.user);
  const interviews = useInterviews();               // only what this user may see
  const applications = useApplications();           // to show candidate names
  const users = useUsers(isManager(user));          // interviewer names (managers only)
  // The id of the interview being scheduled (opens the dialog), or null.
  const [scheduling, setScheduling] = useState<string | null>(null);

  // Has the interview's start time arrived? (Scorecards open then.)
  const hasStarted = (item: Interview) => item.starts_at !== null && new Date(item.starts_at).getTime() <= Date.now();
  const interviewerName = (id: string) =>
    id === user?.id ? "You" : (users.data?.find((item) => item.id === id)?.full_name ?? "Interviewer");

  // Draw the list for one tab.
  function renderList(status: InterviewStatus) {
    const rows: Interview[] = (interviews.data ?? [])
      .filter((item) => item.status === status)
      // Scheduled: soonest first. Other tabs: most recent first.
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
                {/* Interviewers schedule their assigned interviews from here. */}
                {user?.role === "interviewer" && item.status === "assigned" && candidate && (
                  <Button size="sm" onClick={() => setScheduling(item.id)}>Schedule</Button>
                )}
                {/* Once it has started, a shortcut to the candidate page, where the scorecard is filled in. */}
                {user?.role === "interviewer" && item.status === "scheduled" && hasStarted(item) && (
                  <Button size="sm" asChild>
                    <Link href={`/candidates/${item.application_id}`}>Fill scorecard</Link>
                  </Button>
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
        // Interviewers open on "Awaiting schedule" (their to-do); managers on "Scheduled".
        <Tabs defaultValue={user?.role === "interviewer" ? "assigned" : "scheduled"}>
          <TabsList>
            {/* Each tab shows its count, e.g. "Scheduled (3)". */}
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
      {/* The schedule dialog, when an interview is chosen. The long expression finds the candidate's name:
          the interview with id === scheduling -> its application_id -> that application's full_name. */}
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
```

## `src/components/features/interview-schedule-dialog.tsx`

```tsx
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
// toISOString() gives UTC, so shift by the time-zone offset first, then cut to 16 characters.
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
    watch,              // read a field's live value (to switch link/location inputs)
    setError,
    formState: { errors },
  } = useForm<ScheduleValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { starts_at: "", duration_minutes: 45, meeting_type: "virtual", meeting_url: "", location: "" },
  });
  // Re-renders whenever the meeting type changes.
  const meetingType = watch("meeting_type");

  function onSubmit(values: ScheduleValues) {
    schedule.mutate(
      {
        interviewId,
        // The input gives local time WITHOUT a zone ("2026-10-14T15:00"); new Date() reads it as local
        // time, and toISOString() converts it to UTC with "Z". The backend requires a zone.
        starts_at: new Date(values.starts_at).toISOString(),
        duration_minutes: values.duration_minutes,
        meeting_type: values.meeting_type,
        // "|| undefined" = don't send empty strings.
        meeting_url: values.meeting_url || undefined,
        location: values.location || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Interview scheduled and applicant notified");
          onOpenChange(false);
        },
        // e.g. "You already have an interview at that time" (the database's no-overlap rule).
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
              {/* datetime-local = the browser's date+time picker. min = no past dates in the picker. */}
              <Input id="starts_at" type="datetime-local" min={localNow()} {...register("starts_at")} />
            </Field>
            <Field label="Minutes" htmlFor="duration_minutes" error={errors.duration_minutes?.message}>
              {/* valueAsNumber = give the form a number, not text. step=15 = arrows move in 15s. */}
              <Input id="duration_minutes" type="number" min={15} max={240} step={15} {...register("duration_minutes", { valueAsNumber: true })} />
            </Field>
          </div>
          <Field label="Meeting type" htmlFor="meeting_type">
            <Select id="meeting_type" {...register("meeting_type")}>
              <option value="virtual">Google Meet or Zoom</option>
              <option value="in_person">In person</option>
            </Select>
          </Field>
          {/* Show the link field OR the location field, depending on the type. */}
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
```

## `src/app/(app)/team/page.tsx`

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Send, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/empty-state";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateUser, usePendingInvitations, useResendInvitation, useRevokeInvitation, useUsers } from "@/lib/queries";
import { userSchema } from "@/lib/schemas";
import { ROLE_LABEL } from "@/lib/stages";
import type { PendingInvitation } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

type UserValues = z.infer<typeof userSchema>;

export default function TeamPage() {
  const router = useRouter();
  const current = useAuthStore((state) => state.user);
  const isAdmin = current?.role === "company_admin";
  const users = useUsers(isAdmin);
  const [adding, setAdding] = useState(false);

  // Only company admins manage the team.
  useEffect(() => {
    if (current && !isAdmin) router.replace("/overview");
  }, [current, isAdmin, router]);

  return (
    <>
      <PageHeader
        title="Team"
        description="Add hiring managers and interviewers to your company."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus /> Add team member
          </Button>
        }
      />
      {users.isError && <ErrorState message={users.error.message} />}
      {users.isLoading && <Skeleton className="h-48" />}
      {/* The members who have joined. */}
      {users.data && (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {users.data.map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={member.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{member.full_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                </div>
                <Badge>{ROLE_LABEL[member.role]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {isAdmin && <PendingInvitations />}
      <AddMemberDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

// Whole days until a date. 86_400_000 = milliseconds in a day. Math.ceil rounds UP (0.2 days -> 1).
function daysLeft(expiresAt: string) {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

// The "Pending invitations" section with Resend and Revoke.
function PendingInvitations() {
  const invitations = usePendingInvitations();
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  // The invitation awaiting "are you sure?" for revoking.
  const [revoking, setRevoking] = useState<PendingInvitation | null>(null);
  // After a resend, the new link is shown under that invitation (in case the email failed).
  const [freshLink, setFreshLink] = useState<{ id: string; url: string } | null>(null);

  // Nothing pending (or still loading): show nothing.
  if (!invitations.data?.length) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-xl font-semibold">Pending invitations</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        People who haven&apos;t joined yet. Resending emails a fresh link and gives them 7 more days.
      </p>
      <Card className="overflow-hidden">
        <ul className="divide-y">
          {invitations.data.map((invitation) => {
            const left = daysLeft(invitation.expires_at);
            return (
              <li key={invitation.id} className="flex flex-col gap-3 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Faded avatar = not joined yet. */}
                  <Avatar name={invitation.full_name} className="opacity-70" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{invitation.full_name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {invitation.email} · {ROLE_LABEL[invitation.role]}
                    </p>
                  </div>
                  {/* "Expires in 3 days" or an amber "Expired". */}
                  <Badge className={left > 0 ? "" : "bg-status-warning-wash text-status-warning"}>
                    {left > 0 ? `Expires in ${left} day${left === 1 ? "" : "s"}` : "Expired"}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resend.isPending}
                      onClick={() =>
                        resend.mutate(invitation.id, {
                          onSuccess: (result) => {
                            setFreshLink({ id: invitation.id, url: result.invite_url });
                            if (result.email_sent) toast.success(`New invitation emailed to ${invitation.email}`);
                            // toast.warning = an amber pop-up.
                            else toast.warning("New link created, but the email could not be sent. Copy the link below.");
                          },
                          onError: (error) => toast.error(error.message),
                        })
                      }
                    >
                      <Send /> Resend
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRevoking(invitation)} aria-label={`Revoke invitation for ${invitation.email}`}>
                      <X />
                    </Button>
                  </div>
                </div>
                {/* The new link with a copy button, shown only for the invitation just resent. */}
                {freshLink?.id === invitation.id && (
                  <div className="flex gap-2">
                    <Input readOnly value={freshLink.url} aria-label="New invitation link" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Copy invitation link"
                      onClick={() => navigator.clipboard.writeText(freshLink.url).then(() => toast.success("Invitation link copied"))}
                    >
                      <Copy />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      {/* "?? 'They'" = use "They" if revoking is null (while the dialog closes). */}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke this invitation?"
        description={`${revoking?.full_name ?? "They"} will no longer be able to join with the link they were sent. You can invite them again later.`}
        confirmLabel="Revoke invitation"
        destructive
        loading={revoke.isPending}
        onConfirm={() =>
          revoking &&
          revoke.mutate(revoking.id, {
            onSuccess: () => {
              toast.success("Invitation revoked");
              setRevoking(null);
            },
            onError: (error) => {
              toast.error(error.message);
              setRevoking(null);
            },
          })
        }
      />
    </section>
  );
}

// The "Add team member" dialog.
function AddMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
          <DialogDescription>We email them a one-time link to join. They can set a password or continue with Google.</DialogDescription>
        </DialogHeader>
        {open && <AddMemberForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddMemberForm({ onDone }: { onDone: () => void }) {
  const create = useCreateUser();
  // After inviting: the link, and whether the email went out.
  const [inviteUrl, setInviteUrl] = useState("");
  const [sent, setSent] = useState<{ email: string; ok: boolean } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UserValues>({ resolver: zodResolver(userSchema), defaultValues: { role: "interviewer" } });

  function onSubmit(values: UserValues) {
    create.mutate(values, {
      onSuccess: (invitation) => {
        if (invitation.email_sent) toast.success(`Invitation emailed to ${values.email}`);
        else toast.warning("Invitation created, but the email could not be sent. Share the link below.");
        setSent({ email: values.email, ok: invitation.email_sent });
        setInviteUrl(invitation.invite_url);
      },
      // e.g. "This email is already registered" under the email field.
      onError: (error) => setError("email", { message: error.message }),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message}>
        <Input id="full_name" {...register("full_name")} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" {...register("email")} />
      </Field>
      <Field label="Role" htmlFor="role">
        <Select id="role" {...register("role")}>
          <option value="interviewer">Interviewer</option>
          <option value="hiring_manager">Hiring manager</option>
        </Select>
      </Field>
      {/* A green "emailed" or amber "couldn't email" message after inviting. */}
      {sent && (
        <p
          role="status"
          className={
            sent.ok
              ? "rounded-md bg-status-good-wash px-3 py-2 text-sm text-status-good"
              : "rounded-md bg-status-warning-wash px-3 py-2 text-sm text-status-warning"
          }
        >
          {sent.ok
            ? `We emailed ${sent.email} a link to join. You can also share the link below.`
            : `We couldn't email ${sent.email}. Copy the link below and send it to them yourself.`}
        </p>
      )}
      {/* The link is always shown after inviting, with a copy button. */}
      {inviteUrl && (
        <Field label="One-time invitation link" htmlFor="invite_url" hint="This link expires in 7 days and can only be used once.">
          <div className="flex gap-2">
            <Input id="invite_url" readOnly value={inviteUrl} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copy invitation link"
              onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => toast.success("Invitation link copied"))}
            >
              <Copy />
            </Button>
          </div>
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding..." : "Add team member"}
        </Button>
      </div>
    </form>
  );
}
```

## `src/components/shared/confirm-dialog.tsx`

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// A reusable "Are you sure?" dialog for actions that can't be undone (hire, reject, cancel, revoke).
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,       // true = a red confirm button
  loading,           // true = the confirm button is disabled while the request runs
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          {/* The safe choice, on the left. */}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep as is
          </Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```
