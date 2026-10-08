"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { HOME } from "@/lib/constants";
import { loginSchema } from "@/lib/schemas";
import type { User } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setError("");
    try {
      // The backend login uses the OAuth2 form, where the email field is called "username".
      const form = new URLSearchParams({ username: values.email, password: values.password });
      const token = await api.postForm<{ access_token: string }>("/auth/login", form);
      // Save the token first so the next request is authenticated.
      useAuthStore.setState({ token: token.access_token });
      const user = await api.get<User>("/auth/me");
      setSession(token.access_token, user);
      router.replace(HOME[user.role]);
    } catch (err) {
      useAuthStore.getState().logout();
      setError(err instanceof Error ? err.message : "Could not log in");
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to see your hiring pipeline.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
        </Field>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Logging in..." : "Log in"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        New company?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Create your account
        </Link>
      </p>
    </AuthLayout>
  );
}
