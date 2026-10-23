# Part 14: Sign-in pages (copyable)

`/login`, `/register` and `/accept-invite`, plus the Google button and the shared page frame. All three pages follow the same pattern:
1. Get a token (password or Google).
2. Save the token.
3. Ask `/auth/me` who you are.
4. Save the session.
5. Go to the dashboard.

## `src/app/login/page.tsx`

```tsx
"use client";

// zodResolver connects a Zod schema to React Hook Form (the form uses the schema's rules).
import { zodResolver } from "@hookform/resolvers/zod";
// <Link> = navigation between pages without a full page reload.
import Link from "next/link";
// useRouter = change page from code. useSearchParams = read ?next=...&expired=1 from the URL.
import { useRouter, useSearchParams } from "next/navigation";
// Suspense = show a fallback while something isn't ready yet (needed around useSearchParams).
import { Suspense, useState } from "react";
// React Hook Form: manages the inputs' values, validation and submit.
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Field } from "@/components/shared/field";
import { GoogleSignInButton } from "@/components/shared/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { HOME } from "@/lib/constants";
import { loginSchema } from "@/lib/schemas";
import type { User } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

// The form's value type, worked out FROM the schema: { email: string; password: string }.
type LoginValues = z.infer<typeof loginSchema>;

// The page itself. Next.js requires useSearchParams to sit inside <Suspense> on pages
// that are built ahead of time, so the real form is a separate component inside it.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginForm />
    </Suspense>
  );
}

// Only same-site paths, so a crafted link cannot send people to another website after login.
// "/candidates/1" is OK. "https://evil.com" and "//evil.com" (which browsers treat as another site) are not.
// This prevents an "open redirect" attack.
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Where to go after logging in (the page you were on before your session expired).
  const next = safeNext(params.get("next"));
  // ?expired=1 is added by api.ts when a session runs out.
  const expired = params.get("expired") === "1";
  // Read ONE thing from the store: the setSession function.
  const setSession = useAuthStore((state) => state.setSession);
  // useState returns [current value, setter]. Here: the error message under the form.
  const [error, setError] = useState("");
  // Disables the Google button while its request runs.
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  // useForm gives:
  //   register     -> connects an <input> to a field
  //   handleSubmit -> validates, then calls our function with the values
  //   errors       -> the Zod messages per field
  //   isSubmitting -> true while onSubmit runs
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  // Runs only if validation passed.
  async function onSubmit(values: LoginValues) {
    setError("");
    try {
      // The backend login uses the OAuth2 form, where the email field is called "username".
      // URLSearchParams builds "username=...&password=..." (a simple form body).
      const form = new URLSearchParams({ username: values.email, password: values.password });
      const token = await api.postForm<{ access_token: string }>("/auth/login", form);
      // Save the token first so the next request is authenticated.
      useAuthStore.setState({ token: token.access_token });
      // Who am I? (name, role...)
      const user = await api.get<User>("/auth/me");
      // Save both (also into localStorage via persist).
      setSession(token.access_token, user);
      // replace (not push) = the login page isn't kept in the Back history.
      router.replace(next ?? HOME[user.role]);
    } catch (err) {
      // Clear any half-saved token, then show the message (e.g. "Incorrect email or password").
      useAuthStore.getState().logout();
      // "instanceof Error" = is it an error object? Then use its message; otherwise a default.
      setError(err instanceof Error ? err.message : "Could not log in");
    }
  }

  // Called by the Google button with Google's ID token (a long signed string).
  async function handleGoogleSignIn(idToken: string) {
    setError("");
    setGoogleSubmitting(true);
    try {
      // The backend verifies the token with Google (Part 4). No create_company here:
      // from the login page an unknown Google account gets "No HirePlume account..." (404).
      const token = await api.post<{ access_token: string }>("/auth/google", { id_token: idToken });
      useAuthStore.setState({ token: token.access_token });
      const user = await api.get<User>("/auth/me");
      setSession(token.access_token, user);
      router.replace(next ?? HOME[user.role]);
    } catch (err) {
      useAuthStore.getState().logout();
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      // "finally" runs whether it succeeded or failed.
      setGoogleSubmitting(false);
    }
  }

  // What's drawn on screen (JSX).
  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see your hiring pipeline. Admins and hiring managers can use their work Google account."
    >
      {/* A small decorative badge. className = Tailwind utility classes. */}
      <div className="mb-4 flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          1
        </span>
        Secure access
      </div>

      {/* {condition && <X />} = show X only when the condition is true. */}
      {expired && (
        // role="status" makes screen readers announce it politely.
        <p role="status" className="mb-4 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          Your session expired. Sign in again to pick up where you left off.
        </p>
      )}

      {/* Passing a function as a prop: the button calls it when Google returns a token. */}
      <GoogleSignInButton onCredential={handleGoogleSignIn} disabled={googleSubmitting} />

      {/* "or continue with email": a line, text, a line. */}
      <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* handleSubmit(onSubmit): validate first, then call onSubmit. noValidate = use OUR
          messages instead of the browser's built-in validation pop-ups. */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {/* Field = label + input + error message (Part 22). errors.email?.message = Zod's message, if any. */}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          {/* {...register("email")} spreads name/onChange/onBlur/ref onto the input, connecting it to the form.
              autoComplete helps password managers fill it in. */}
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
        </Field>
        {error && (
          // role="alert" = screen readers announce it immediately.
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        {/* Disabled while submitting, so a double click can't send twice. */}
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Logging in..." : "Log in"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        New company?{" "}
        {/* {" "} keeps a space between the text and the link. */}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Create your account
        </Link>
      </p>
    </AuthLayout>
  );
}
```

## `src/app/register/page.tsx` (differences from login)

```tsx
"use client";
// (Same imports as login, plus "toast" from sonner and registerSchema.)

type RegisterValues = z.infer<typeof registerSchema>;   // { company_name, full_name, email, password }

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState("");
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  // getValues = read a field's current value without submitting (used for the Google path).
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterValues) {
    setError("");
    try {
      // 1) Create the company + admin.
      await api.post<User>("/auth/register", values);
      // 2) Log in straight away with the same details (same steps as the login page).
      const form = new URLSearchParams({ username: values.email, password: values.password });
      const token = await api.postForm<{ access_token: string }>("/auth/login", form);
      useAuthStore.setState({ token: token.access_token });
      const user = await api.get<User>("/auth/me");
      setSession(token.access_token, user);
      toast.success("Your company is ready");        // a green pop-up
      router.replace(HOME[user.role]);
    } catch (err) {
      useAuthStore.getState().logout();
      setError(err instanceof Error ? err.message : "Could not create the account");
    }
  }

  async function handleGoogleSignIn(idToken: string) {
    setError("");
    setGoogleSubmitting(true);
    try {
      const token = await api.post<{ access_token: string }>("/auth/google", {
        id_token: idToken,
        // Use the company name typed so far, if any. ?.trim() = trim only if it exists;
        // "|| null" = send null when empty (the backend then makes "<Name>'s Company").
        company_name: getValues("company_name")?.trim() || null,
        // ONLY the register page sends this: "if this Google account is new, create a company".
        create_company: true,
      });
      useAuthStore.setState({ token: token.access_token });
      const user = await api.get<User>("/auth/me");
      setSession(token.access_token, user);
      toast.success("Signed in with Google");
      router.replace(HOME[user.role]);
    } catch (err) {
      useAuthStore.getState().logout();
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setGoogleSubmitting(false);
    }
  }

  // JSX: the same layout as login, with four inputs (company_name, full_name, email, password)
  // and a "Create company" button, then a link back to /login.
  // ...
}
```

## `src/app/accept-invite/page.tsx`

```tsx
"use client";
// (Imports as on the login page, plus acceptInvitationSchema.)

type InvitationValues = z.infer<typeof acceptInvitationSchema>;   // { password, confirm_password }

// Suspense wrapper again, because the form reads ?token=... with useSearchParams.
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  // The secret token from the email link: /accept-invite?token=XYZ
  const token = useSearchParams().get("token");
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState("");
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InvitationValues>({ resolver: zodResolver(acceptInvitationSchema) });

  // OPTION 1: choose a password.
  async function onSubmit(values: InvitationValues) {
    if (!token) {
      setError("This invitation link is missing its token.");
      return;                                       // stop here
    }
    setError("");
    try {
      // Accept: creates the user in the inviting company with the invited role.
      const inviteForm = { token, password: values.password };
      const invitedUser = await api.post<User>("/auth/accept-invite", inviteForm);
      // Then log in with the new password, exactly like the login page.
      const loginForm = new URLSearchParams({ username: invitedUser.email, password: values.password });
      const session = await api.postForm<{ access_token: string }>("/auth/login", loginForm);
      useAuthStore.setState({ token: session.access_token });
      const user = await api.get<User>("/auth/me");
      setSession(session.access_token, user);
      router.replace(HOME[user.role]);
    } catch (err) {
      useAuthStore.getState().logout();
      // e.g. "This invitation is invalid or expired" (410).
      setError(err instanceof Error ? err.message : "Could not accept this invitation");
    }
  }

  // OPTION 2: continue with Google.
  async function handleGoogleSignIn(idToken: string) {
    setError("");
    setGoogleSubmitting(true);
    try {
      // The backend checks that the Google email is the one the invitation was sent to.
      // Sending invite_token lets it give a clear 403 if the wrong Google account is used.
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
      title="Join your HirePlume team"
      subtitle="Continue with the Google account your invitation was sent to, or choose a password."
    >
      {/* Only show the options when the link actually has a token. <>...</> = a "fragment":
          groups elements without adding an extra <div>. */}
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
      {/* condition ? A : B = show A or B. */}
      {token ? (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {/* autoComplete="new-password" tells password managers to suggest a strong new one. */}
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
```

## `src/components/shared/google-sign-in-button.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Types describing the small part of Google's script we use (Google doesn't ship TypeScript types).
type GoogleCredentialResponse = { credential?: string };     // credential = the ID token
type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (element: HTMLElement, options: { theme: string; size: string; width: number }) => void;
    };
  };
};

// Tell TypeScript that "window.google" may exist (Google's script adds it).
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

// Google Identity Services: the official "Sign in with Google" script.
const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export function GoogleSignInButton({
  onCredential,           // called with the ID token
  disabled = false,
}: {
  onCredential: (credential: string) => void;
  disabled?: boolean;
}) {
  // The public client id (same as the backend's GOOGLE_CLIENT_ID).
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  // A REF to the <div> where Google draws its button (refs point at real page elements).
  const buttonRef = useRef<HTMLDivElement>(null);
  // Keep the LATEST onCredential in a ref. Google keeps the callback we give it once; through
  // the ref, it always calls the newest version of the parent's function.
  const onCredentialRef = useRef(onCredential);
  const [message, setMessage] = useState("");

  onCredentialRef.current = onCredential;

  // Load Google's script once, then draw the button.
  useEffect(() => {
    if (!clientId) return;               // not configured: show the fallback button below

    let cancelled = false;               // set when the component disappears
    const renderGoogleButton = () => {
      if (cancelled || !buttonRef.current || !window.google) return;
      // Tell Google our client id and what to do when someone picks an account.
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) onCredentialRef.current(response.credential);
        },
      });
      // Ask Google to draw its official button inside our <div>, as wide as the form.
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: Math.max(250, Math.floor(buttonRef.current.getBoundingClientRect().width)),
      });
    };

    // Three cases: the script is already loaded, already being loaded, or not loaded yet.
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_URL}"]`);
    if (window.google) {
      renderGoogleButton();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton);
    } else {
      // Add a <script> tag to the page; draw the button when it finishes loading.
      const script = document.createElement("script");
      script.src = GOOGLE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = renderGoogleButton;
      script.onerror = () => setMessage("Google sign-in could not load. Check your connection and try again.");
      document.head.appendChild(script);
    }

    // CLEANUP: runs when the component disappears. Avoids drawing into a removed element.
    return () => {
      cancelled = true;
      existingScript?.removeEventListener("load", renderGoogleButton);
    };
  }, [clientId]);           // re-run only if the client id changes

  // No client id configured: show a normal button that explains what to set.
  if (!clientId) {
    return (
      <div className="mb-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full justify-center gap-2"
          disabled={disabled}
          onClick={() => setMessage("Google sign-in needs NEXT_PUBLIC_GOOGLE_CLIENT_ID in frontend/.env.local and GOOGLE_AUTH_ENABLED=true plus GOOGLE_CLIENT_ID in backend/.env.")}
        >
          Continue with Google
        </Button>
        {message && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{message}</p>}
      </div>
    );
  }

  // Normal case: an empty <div> that Google fills with its button. While "disabled",
  // it's faded and can't be clicked (pointer-events-none).
  return (
    <div className="mb-4">
      <div ref={buttonRef} className={disabled ? "pointer-events-none opacity-50" : "min-h-10"} />
      {message && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{message}</p>}
    </div>
  );
}
```

> **Remember:** Google only shows this button on websites listed as **Authorized JavaScript origins** for the client ID in Google Cloud Console. That's why the live site needed `https://hireplume-app.vercel.app` added.

## `src/components/layout/auth-layout.tsx` and `logo.tsx`

```tsx
import { Logo } from "@/components/layout/logo";
import { StageThread } from "@/components/shared/stage-thread";

// Shared frame for account forms: the form on the left, the product idea on the right.
// It takes three props: a title, a subtitle, and "children" (the form inside).
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    // grid: one column on phones; lg:grid-cols-2 = two columns on large screens (lg = 1024px+).
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo href="/" />
        {/* The form area: centred, max width "sm". */}
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mb-8 mt-2 text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>
      {/* The dark right half: hidden on phones (hidden), shown on large screens (lg:flex). */}
      <div className="hidden flex-col justify-center gap-10 bg-foreground p-14 text-background lg:flex">
        <h2 className="max-w-md text-4xl font-bold leading-tight">Every candidate, one clear path to a decision.</h2>
        <p className="max-w-md text-background/70">
          Hiring managers publish roles. Admins build the team. Interviewers share clear feedback, and applicants stay informed.
        </p>
        {/* A sample pipeline graphic (the "stage thread", Part 19). */}
        <div className="max-w-md rounded-lg bg-background p-6 text-foreground">
          <StageThread stage="interview" />
        </div>
      </div>
    </div>
  );
}
```

```tsx
import Link from "next/link";

// The HirePlume logo: a small drawn mark + the name. It links to the dashboard by default.
export function Logo({ href = "/overview" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight">
      {/* The mark: a purple square with a line and two dots, built from positioned <span>s. */}
      <span className="relative flex size-8 items-center justify-center rounded-lg bg-primary">
        <span className="absolute left-1.5 right-1.5 top-1/2 h-0.5 -translate-y-1/2 bg-white/50" />
        <span className="absolute left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white" />
        <span className="absolute right-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white/60" />
      </span>
      HirePlume
    </Link>
  );
}
```
