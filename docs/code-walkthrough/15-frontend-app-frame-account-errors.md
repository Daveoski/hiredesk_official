# Part 15: The signed-in app frame, Account page, error pages (copyable)

Every page under `src/app/(app)/` is wrapped by `(app)/layout.tsx`. The brackets make `(app)` a **route group**: it shares a layout but adds nothing to the URL, so `/overview` is not `/app/overview`.

## `src/app/(app)/layout.tsx`: the login gate

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useAuthStore } from "@/stores/auth-store";

// Every page inside (app) needs a logged-in user.
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Re-render when the token changes (e.g. logout).
  const token = useAuthStore((state) => state.token);
  // Render nothing until the browser has mounted, so the server and browser HTML match.
  // (The server can't read localStorage, so it doesn't know if you're logged in. Rendering nothing
  //  on the first pass avoids a "hydration mismatch" between server and browser HTML.)
  const [mounted, setMounted] = useState(false);
  // True once the auth store has finished reading localStorage ("rehydrated").
  const [hydrated, setHydrated] = useState(false);

  // [] = run once, after the first render in the browser.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // Already rehydrated? Done.
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    // Otherwise wait for it. onFinishHydration returns an unsubscribe function,
    // which React calls as cleanup when the layout disappears.
    return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  // Once we KNOW the store is loaded: no token -> go to login, remembering where you were.
  // (Checking before hydration would wrongly send logged-in users to /login on every refresh.)
  useEffect(() => {
    if (hydrated && !token) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }, [hydrated, token, router]);   // re-run whenever any of these change

  // Show nothing until everything is ready and we have a token.
  if (!mounted || !hydrated || !token) return null;
  // Otherwise: the sidebar frame with the page inside.
  return <AppShell>{children}</AppShell>;
}
```

> This gate is a **convenience**, not security. Even if someone skipped it, every API call needs a valid token, and the backend enforces roles and permissions.

## `src/components/layout/app-shell.tsx`: the sidebar and mobile menu

```tsx
"use client";

// Icons from lucide-react; each is a React component, e.g. <Briefcase />.
import { Briefcase, CalendarClock, KeyRound, LayoutDashboard, LogOut, Menu, Users, UserCog } from "lucide-react";
import Link from "next/link";
// usePathname = the current URL path, e.g. "/jobs/123" (used to highlight the active menu item).
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/layout/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useCompany } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
// (isManager is imported but not used here.)
import { isManager, useAuthStore } from "@/stores/auth-store";

// A custom hook: build the menu for the logged-in user's ROLE.
function useNavItems() {
  const user = useAuthStore((state) => state.user);
  // Everyone gets the Dashboard. Each item: link, text, icon component.
  const items = [{ href: "/overview", label: "Dashboard", icon: LayoutDashboard }];
  if (user?.role === "hiring_manager") {
    items.push({ href: "/jobs", label: "Jobs", icon: Briefcase });
    items.push({ href: "/candidates", label: "Candidates", icon: Users });
    items.push({ href: "/interviews", label: "Interviews", icon: CalendarClock });
  }
  if (user?.role === "interviewer") {
    items.push({ href: "/candidates", label: "Assigned candidates", icon: Users });
    items.push({ href: "/interviews", label: "Interviews", icon: CalendarClock });
  }
  if (user?.role === "company_admin") items.push({ href: "/team", label: "Team", icon: UserCog });
  // Everyone gets Account.
  items.push({ href: "/account", label: "Account", icon: KeyRound });
  return items;
}
// (Hiding links is for convenience only: the API still refuses forbidden actions.)

// The sidebar contents, used both on desktop and inside the mobile menu.
// onNavigate (optional) lets the mobile menu close itself after a click.
function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = useNavItems();
  // Without a selector, this takes the whole store; then pick user and logout.
  const { user, logout } = useAuthStore();
  const company = useCompany();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo />
        {/* The company name under the logo, once loaded. truncate = cut long text with "…". */}
        {company.data && <p className="mt-1 truncate text-sm text-muted-foreground">{company.data.name}</p>}
      </div>
      {/* aria-label names the navigation for screen readers. */}
      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {/* .map() turns each item into a <Link>. "icon: Icon" renames the field so it can be used as <Icon />
            (React components must start with a capital letter). */}
        {items.map(({ href, label, icon: Icon }) => {
          // Active if we're on this page or a page inside it ("/jobs" is active on "/jobs/123").
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}                    // React needs a unique "key" for each item in a list
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}   // tells screen readers "you are here"
              // cn() joins the shared classes with the active or inactive style.
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      {/* The user card at the bottom with a log-out button. */}
      {user && (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <Avatar name={user.full_name} />
          {/* min-w-0 lets truncate work inside a flex row. */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Log out"            // icon-only buttons need a text label for screen readers
            onClick={() => {
              logout();                     // clear the token (Providers then clears the data cache)
              router.push("/login");
            }}
          >
            <LogOut />
          </Button>
        </div>
      )}
    </div>
  );
}

// The page frame: a fixed sidebar on desktop, a top bar + slide-out menu on phones.
export function AppShell({ children }: { children: React.ReactNode }) {
  // Whether the mobile menu is open.
  const [open, setOpen] = useState(false);
  return (
    // lg:pl-64 = on large screens, leave room on the left for the 16rem sidebar.
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar: hidden on phones, fixed on the left on large screens. */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background lg:block">
        <Sidebar />
      </aside>
      {/* Phone top bar: sticky at the top, hidden on large screens (lg:hidden). backdrop-blur = frosted glass. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <Button variant="outline" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
      </header>
      {/* The phone menu reuses the Dialog component, restyled as a full-height panel on the left. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="left-0 top-0 h-full max-h-none w-72 max-w-none translate-x-0 translate-y-0 rounded-none p-0">
          {/* Dialogs need a title for accessibility; sr-only = visible to screen readers only. */}
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <Sidebar onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      {/* The page itself, centred, max width 6xl. */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
```

## `src/app/(app)/overview/page.tsx`: the dashboard picker

```tsx
"use client";

import { useState } from "react";
import { AdminDashboard } from "@/components/features/dashboard/admin-dashboard";
import { InterviewerDashboard } from "@/components/features/dashboard/interviewer-dashboard";
import { ManagerDashboard } from "@/components/features/dashboard/manager-dashboard";
import { JobFormDialog } from "@/components/features/jobs/job-form-dialog";
import { useAuthStore } from "@/stores/auth-store";

// Every signed-in user lands here and sees a dashboard for their own role and work.
export default function OverviewPage() {
  const user = useAuthStore((state) => state.user);
  // Whether the hiring manager's "New job" dialog is open.
  const [creating, setCreating] = useState(false);
  if (!user) return null;

  return (
    <>
      {/* Exactly one of these three appears, depending on the role. */}
      {user.role === "company_admin" && <AdminDashboard user={user} />}
      {user.role === "hiring_manager" && (
        <>
          {/* onCreateJob = a function the dashboard calls when "New job" is clicked. */}
          <ManagerDashboard user={user} onCreateJob={() => setCreating(true)} />
          <JobFormDialog open={creating} onOpenChange={setCreating} />
        </>
      )}
      {user.role === "interviewer" && <InterviewerDashboard user={user} />}
    </>
  );
}
```

## `src/app/(app)/account/page.tsx`: profile and password

```tsx
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
import { ROLE_LABEL } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

type PasswordValues = z.infer<typeof changePasswordSchema>;

export default function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const company = useCompany();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Your account" description="Your profile and sign-in details." />
      {/* Two cards side by side on large screens, stacked on phones. */}
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
  // The "!" at the end tells TypeScript "this is definitely not null here" (the page checked already).
  const user = useAuthStore((state) => state.user)!;
  const setSession = useAuthStore((state) => state.setSession);
  const changePassword = useChangePassword();
  // A Google-only account has no password yet, so it does not need the current one.
  // Older saved sessions may not have the field yet; treat them as having a password.
  // ("!== false" is true for both true AND undefined.)
  const hasPassword = user.password_login_enabled !== false;
  const {
    register,
    handleSubmit,
    reset,            // clears the form
    setError,         // shows a message under a field
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(changePasswordSchema) });

  function onSubmit(values: PasswordValues) {
    // The schema can't know whether the current password is required, so check here.
    if (hasPassword && !values.current_password) {
      setError("current_password", { message: "Enter your current password" });
      return;
    }
    changePassword.mutate(
      // Google-only accounts send no current password.
      { current_password: hasPassword ? values.current_password : undefined, password: values.password },
      {
        onSuccess: (updated) => {
          // The server returns the updated user (password_login_enabled is now true): save it in the store.
          const token = useAuthStore.getState().token;
          if (token) setSession(token, updated);
          reset();
          toast.success(hasPassword ? "Your password was changed" : "Password set. You can now also sign in with email.");
        },
        // Put the server's message under the right field: "current" in the message -> current password field.
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
          {/* Only accounts that already have a password are asked for it. */}
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
          {/* self-start = don't stretch the button to full width. */}
          <Button type="submit" className="self-start" disabled={changePassword.isPending}>
            {changePassword.isPending ? "Saving..." : hasPassword ? "Change password" : "Set password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

## `src/app/not-found.tsx` and `src/app/error.tsx`

```tsx
// not-found.tsx: Next.js shows this for any URL that doesn't match a page.
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo href="/" />
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">404</p>
      {/* &apos; = an apostrophe written safely inside JSX text. */}
      <h1 className="max-w-md text-4xl font-bold">This page isn&apos;t on the hiring plan</h1>
      <p className="max-w-md text-muted-foreground">
        The link may be old, or the job may no longer be accepting applications.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {/* asChild = render the Button's styles ON the Link (one <a> element, not a button inside a link). */}
        <Button asChild>
          <Link href="/overview">Go to my dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to the home page</Link>
        </Button>
      </div>
    </main>
  );
}
```

```tsx
// error.tsx: shown instead of a blank page when something on a page crashes.
// Must be a client component, because it has a "Try again" button.
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

// Next.js passes the error, and reset() which tries rendering the page again.
// "digest" = a reference id for server errors, useful when reporting a bug.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log it in the browser console for debugging.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo href="/" />
      <h1 className="max-w-md text-4xl font-bold">Something went wrong on this page</h1>
      <p className="max-w-md text-muted-foreground">
        Your work is saved on the server. Try again, and if it keeps happening, go back to your dashboard.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/overview">Go to my dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
```
