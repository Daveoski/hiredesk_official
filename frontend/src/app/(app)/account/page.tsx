"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChangePassword, useCompany } from "@/lib/queries";
import { changePasswordSchema } from "@/lib/schemas";
import { ROLE_LABEL } from "@/lib/stages";
import { useAuthStore } from "@/stores/auth-store";

type PasswordValues = z.infer<typeof changePasswordSchema>;

export default function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const company = useCompany();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Your account" description="Your profile and sign-in details." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar name={user.full_name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{user.full_name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              {company.data && <p className="truncate text-sm text-muted-foreground">{company.data.name}</p>}
            </div>
            <Badge>{ROLE_LABEL[user.role]}</Badge>
          </CardContent>
        </Card>
        <PasswordCard />
      </div>
    </>
  );
}

function PasswordCard() {
  const user = useAuthStore((state) => state.user)!;
  const setSession = useAuthStore((state) => state.setSession);
  const changePassword = useChangePassword();
  // A Google-only account has no password yet, so it does not need the current one.
  // Older saved sessions may not have the field yet; treat them as having a password.
  const hasPassword = user.password_login_enabled !== false;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(changePasswordSchema) });

  function onSubmit(values: PasswordValues) {
    if (hasPassword && !values.current_password) {
      setError("current_password", { message: "Enter your current password" });
      return;
    }
    changePassword.mutate(
      { current_password: hasPassword ? values.current_password : undefined, password: values.password },
      {
        onSuccess: (updated) => {
          const token = useAuthStore.getState().token;
          if (token) setSession(token, updated);
          reset();
          toast.success(hasPassword ? "Your password was changed" : "Password set. You can now also sign in with email.");
        },
        onError: (error) =>
          setError(error.message.toLowerCase().includes("current") ? "current_password" : "password", {
            message: error.message,
          }),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasPassword ? "Change password" : "Set a password"}</CardTitle>
        <CardDescription>
          {hasPassword
            ? "Use at least 8 characters. You will get an email confirming the change."
            : "You sign in with Google. Add a password to also sign in with your email."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {/* Lets password managers attach the new password to the right account. */}
          <input type="email" autoComplete="username" value={user.email} readOnly hidden />
          {hasPassword && (
            <Field label="Current password" htmlFor="current_password" error={errors.current_password?.message}>
              <Input id="current_password" type="password" autoComplete="current-password" {...register("current_password")} />
            </Field>
          )}
          <Field label="New password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters">
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm_password" error={errors.confirm_password?.message}>
            <Input id="confirm_password" type="password" autoComplete="new-password" {...register("confirm_password")} />
          </Field>
          <Button type="submit" className="self-start" disabled={changePassword.isPending}>
            {changePassword.isPending ? "Saving..." : hasPassword ? "Change password" : "Set password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
