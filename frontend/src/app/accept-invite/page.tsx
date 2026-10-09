"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Field } from "@/components/shared/field";
import { GoogleSignInButton } from "@/components/shared/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { HOME } from "@/lib/constants";
import { acceptInvitationSchema } from "@/lib/schemas";
import type { User } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

type InvitationValues = z.infer<typeof acceptInvitationSchema>;

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState("");
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvitationValues>({ resolver: zodResolver(acceptInvitationSchema) });

  async function onSubmit(values: InvitationValues) {
    if (!token) {
      setError("This invitation link is missing its token.");
      return;
    }
    setError("");
    try {
      const inviteForm = { token, password: values.password };
      const invitedUser = await api.post<User>("/auth/accept-invite", inviteForm);
      const loginForm = new URLSearchParams({ username: invitedUser.email, password: values.password });
      const session = await api.postForm<{ access_token: string }>("/auth/login", loginForm);
      useAuthStore.setState({ token: session.access_token });
      const user = await api.get<User>("/auth/me");
      setSession(session.access_token, user);
      router.replace(HOME[user.role]);
    } catch (err) {
      useAuthStore.getState().logout();
      setError(err instanceof Error ? err.message : "Could not accept this invitation");
    }
  }

  async function handleGoogleSignIn(idToken: string) {
    setError("");
    setGoogleSubmitting(true);
    try {
      // The backend checks that the Google email is the one the invitation was sent to.
      const session = await api.post<{ access_token: string }>("/auth/google", { id_token: idToken, invite_token: token });
      useAuthStore.setState({ token: session.access_token });
      const user = await api.get<User>("/auth/me");
      setSession(session.access_token, user);
      router.replace(HOME[user.role]);
    } catch (err) {
      useAuthStore.getState().logout();
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setGoogleSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Join your HireDesk team"
      subtitle="Continue with the Google account your invitation was sent to, or choose a password."
    >
      {token && (
        <>
          <GoogleSignInButton onCredential={handleGoogleSignIn} disabled={googleSubmitting} />
          <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or choose a password
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      {token ? (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters">
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm_password" error={errors.confirm_password?.message}>
            <Input id="confirm_password" type="password" autoComplete="new-password" {...register("confirm_password")} />
          </Field>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting ? "Activating..." : "Accept invitation"}</Button>
        </form>
      ) : (
        <p role="alert" className="text-sm text-destructive">This invitation link is missing its token.</p>
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
