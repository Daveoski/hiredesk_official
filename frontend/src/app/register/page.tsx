"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { HOME } from "@/lib/constants";
import { registerSchema } from "@/lib/schemas";
import type { User } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterValues) {
    setError("");
    try {
      await api.post<User>("/auth/register", values);
      // Log in straight away with the same details.
      const form = new URLSearchParams({ username: values.email, password: values.password });
      const token = await api.postForm<{ access_token: string }>("/auth/login", form);
      useAuthStore.setState({ token: token.access_token });
      const user = await api.get<User>("/auth/me");
      setSession(token.access_token, user);
      toast.success("Your company is ready");
      router.replace(HOME[user.role]);
    } catch (err) {
      useAuthStore.getState().logout();
      setError(err instanceof Error ? err.message : "Could not create the account");
    }
  }

  return (
    <AuthLayout title="Create your company" subtitle="You become the company admin and can invite your team later.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Field label="Company name" htmlFor="company_name" error={errors.company_name?.message}>
          <Input id="company_name" autoComplete="organization" {...register("company_name")} />
        </Field>
        <Field label="Your name" htmlFor="full_name" error={errors.full_name?.message}>
          <Input id="full_name" autoComplete="name" {...register("full_name")} />
        </Field>
        <Field label="Work email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters">
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create company"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
