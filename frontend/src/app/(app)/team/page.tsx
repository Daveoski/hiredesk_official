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

function daysLeft(expiresAt: string) {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

function PendingInvitations() {
  const invitations = usePendingInvitations();
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  const [revoking, setRevoking] = useState<PendingInvitation | null>(null);
  const [freshLink, setFreshLink] = useState<{ id: string; url: string } | null>(null);

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
                  <Avatar name={invitation.full_name} className="opacity-70" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{invitation.full_name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {invitation.email} · {ROLE_LABEL[invitation.role]}
                    </p>
                  </div>
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
