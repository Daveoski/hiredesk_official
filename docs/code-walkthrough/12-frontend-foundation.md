# Part 12: Frontend foundation (copyable)

These files sit under every page: the root layout, the providers (data cache and pop-up messages), the API client that talks to the backend, the login store, and small helpers.

**TypeScript basics used everywhere:**

| Syntax | Meaning |
|---|---|
| `name: string` | `name` must be text |
| `x?: number` | optional |
| `string \| null` | text OR nothing |
| `<T>` | a *generic*: a type chosen by the caller |
| `interface X { ... }` | describes an object's shape |
| `import type` | imports only types (removed when compiled) |
| `@/` | short for `frontend/src/` (set in `tsconfig.json`) |

## `src/app/layout.tsx`: wraps every page of the site

```tsx
// "import type" = only the TYPE is imported (nothing ends up in the browser bundle).
import type { Metadata } from "next";
// next/font downloads Google fonts at BUILD time and serves them from our own site (fast, private).
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "@/components/providers";
// Global CSS: Tailwind + our colour tokens. Imported once, here, for the whole app.
import "./globals.css";

// Each font becomes a CSS variable, used in globals.css (--font-display, --font-sans).
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });   // headings
const body = Figtree({ subsets: ["latin"], variable: "--font-figtree" });                    // body text

// The page <title> and <meta description> (shown in browser tabs and Google results).
export const metadata: Metadata = {
  title: "HireDesk | Smarter Hiring for Modern Teams",
  description: "HireDesk helps companies review applicants, coordinate interviews, and make confident hiring decisions with a clear, collaborative workflow.",
};

// The ROOT layout: Next.js wraps EVERY page in this. "children" = the page being shown.
// "export default" = the main thing this file provides (Next.js looks for it).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Template string `${a} ${b}` adds both font variables as classes on <html>.
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {/* Providers give every page the data cache and toasts. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## `src/components/providers.tsx`: the data cache and toasts

```tsx
// "use client" = this runs in the BROWSER (it uses state and effects). Without it, it would
// render on the server only.
"use client";

// TanStack Query: QueryClient = the cache of server data; QueryClientProvider = shares it with every component.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
// Toaster = the place where toast pop-ups appear.
import { Toaster } from "sonner";
import { useAuthStore } from "@/stores/auth-store";

export function Providers({ children }: { children: React.ReactNode }) {
  // useState with a FUNCTION: create the QueryClient once, on the first render only.
  // [queryClient] takes the first item of the [value, setter] pair; we never change it.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: {
      staleTime: 15_000,             // data counts as fresh for 15 seconds (no refetch inside that time)
      retry: false,                  // don't automatically retry failed requests
      refetchOnWindowFocus: false,   // don't refetch every time you switch back to the tab
    } } }),
  );

  // Cached data belongs to whoever was signed in. When the account changes (log out,
  // or someone else logs in on this browser), drop it so nobody sees the previous user's data.
  useEffect(
    () =>
      // subscribe() calls our function on EVERY store change, with the new and previous state.
      // It returns an "unsubscribe" function; returning it from useEffect cleans up on unmount.
      useAuthStore.subscribe((state, previous) => {
        // A different user, or the token disappeared (logout): wipe the cache.
        if (state.user?.id !== previous.user?.id || (previous.token && !state.token)) queryClient.clear();
      }),
    [queryClient],    // dependency list: run this effect once (queryClient never changes)
  );

  return (
    // Every component inside can now use useQuery/useMutation.
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Toasts appear bottom-right; richColors = green success, red error. */}
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}
```

## `src/lib/api.ts`: the one place that talks to the backend

```ts
import { useAuthStore } from "@/stores/auth-store";

// The backend address. NEXT_PUBLIC_ variables are baked into the browser code at BUILD time.
// "??" = use the right side if the left is null/undefined (local default).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Our own error type, carrying the HTTP status (401, 409...) as well as the message.
export class ApiError extends Error {
  constructor(
    message: string,
    // "public status" = create a property this.status automatically from this argument.
    public status: number,
  ) {
    super(message);      // call the parent Error class with the message
  }
}

// FastAPI sends errors as { detail: "text" } or { detail: [{ loc, msg }, ...] }.
// Turn either into one readable sentence.
function errorMessage(body: unknown, fallback: string): string {
  // "unknown" = we don't know the shape yet. "as" tells TypeScript what we expect.
  // "?." = optional chaining: if body is null, give undefined instead of crashing.
  const detail = (body as { detail?: unknown } | null)?.detail;
  // Case 1: our own errors, e.g. raise HTTPException(409, "This email is already registered").
  if (typeof detail === "string") return detail;
  // Case 2: validation errors (422): a list of problems. Show the first one.
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: (string | number)[]; msg?: string };
    // loc is the path to the bad field, e.g. ["body", "password"]: take the last part, "password".
    const field = first.loc?.[first.loc.length - 1];
    // e.g. "password: String should have at least 8 characters"
    return field ? `${field}: ${first.msg}` : (first.msg ?? fallback);
  }
  return fallback;
}

// The core function. <T> = the type of data the caller expects back.
// "async" = it waits for the network; it returns a Promise (a value that arrives later).
async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  // Read the token from the store directly (not with a hook: this isn't a component).
  const token = useAuthStore.getState().token;
  // "!!token" turns a value into true/false (has a token or not).
  const sendsToken = auth && !!token;
  if (sendsToken) headers.set("Authorization", `Bearer ${token}`);
  // Do not set Content-Type for FormData: the browser adds the multipart boundary itself.
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    // "await" = pause here until the server answers. "...init" copies the method/body into the options.
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    // fetch only THROWS when there's no answer at all (server down, no internet, CORS blocked).
    throw new ApiError("Cannot reach the server. Check that the backend is running.", 0);
  }

  // Only an expired session sends the user back to /login. A 401 from a sign-in attempt
  // (for example a rejected Google token) stays on the page so its message can be shown.
  if (response.status === 401 && sendsToken) {
    useAuthStore.getState().logout();
    // typeof window !== "undefined" = we're in a browser (window doesn't exist on the server).
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      // Come back to the same page after signing in again.
      // encodeURIComponent makes "/candidates/1?x=y" safe to put inside a URL.
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?expired=1&next=${next}`;
    }
  }

  // 204 = no body. Otherwise read JSON; if that fails (e.g. an HTML error page), use null.
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  // response.ok = status 200-299. Anything else becomes an ApiError with a readable message.
  if (!response.ok) throw new ApiError(errorMessage(body, "Something went wrong"), response.status);
  return body as T;
}

// Short helpers, one per HTTP method. Usage: api.get<Job[]>("/jobs"), api.post<Job>("/jobs", body).
export const api = {
  get: <T>(path: string, auth = true) => request<T>(path, {}, auth),
  // JSON.stringify turns a JS object into JSON text for the request body.
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  // <T = null> = if the caller doesn't say, assume no data comes back (204).
  del: <T = null>(path: string) => request<T>(path, { method: "DELETE" }),
  // Public endpoints and the login form send form data and need no token.
  postForm: <T>(path: string, form: FormData | URLSearchParams, auth = false) =>
    request<T>(
      path,
      {
        method: "POST",
        body: form,
        // URLSearchParams = a simple form (the login form); FormData = multipart (with files).
        headers: form instanceof URLSearchParams ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      },
      auth,
    ),
};
```

## `src/stores/auth-store.ts`: who is logged in

```ts
// Zustand: a tiny library for shared state. "create" makes a store; "persist" saves it in the browser.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/lib/types";

// The shape of the store: two values and two functions.
interface AuthState {
  token: string | null;              // the JWT from login, or null
  user: User | null;                 // name, email, role... from /auth/me
  setSession: (token: string, user: User) => void;   // "void" = returns nothing
  logout: () => void;
}

// useAuthStore is a HOOK: components call useAuthStore((state) => state.user) to read
// (and re-render when it changes). Non-components use useAuthStore.getState().
export const useAuthStore = create<AuthState>()(
  persist(
    // "set" updates the store. These are the initial values and the actions.
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: "hiredesk-auth",       // the key in localStorage
      // Save only these two fields (functions can't be saved).
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
// localStorage survives page refreshes, so you stay signed in. On load, the store "rehydrates"
// (reads back from localStorage). The protected layout waits for that (Part 15).

// A small helper used by many pages.
export function isManager(user: User | null) {
  return user?.role === "hiring_manager";
}
```

## `src/lib/utils.ts`: small helpers

```ts
// clsx joins class names conditionally; tailwind-merge resolves Tailwind conflicts ("p-2 p-4" -> "p-4").
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn("a", condition && "b", "c") -> "a b c" or "a c". Used in almost every component.
// "...inputs" = any number of arguments, collected into an array.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// "Ada Okafor" -> "AO" (for avatars).
export function initials(name: string) {
  return name
    .split(" ")                            // ["Ada", "Okafor"]
    .filter(Boolean)                       // drop empty pieces from double spaces
    .slice(0, 2)                           // at most 2 words
    .map((part) => part[0].toUpperCase())  // first letter of each, upper-cased
    .join("");                             // "AO"
}

// "2026-10-11T..." -> "11 Oct 2026" in the visitor's own language/region (undefined = browser default).
export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// -> "Sun, 11 Oct, 3:00 PM" in the visitor's own time zone.
export function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// 450000 -> "450,000"; null -> "Not stated".
export function formatSalary(value: number | null) {
  return value === null ? "Not stated" : value.toLocaleString();
}
```

## `src/lib/uploads.ts`: upload a file straight to Cloudinary (Part 6 explains the backend side)

```ts
import { api, ApiError } from "./api";

// The answer from POST /public/jobs/{id}/uploads.
interface SignedUpload {
  upload_url: string;
  public_id: string;
  fields: Record<string, string>;     // Record<K, V> = an object with K keys and V values
}

// Sends a file straight from the browser to file storage (Cloudinary), so large CVs never
// pass through the API, whose host limits request bodies to 4.5 MB.
// Returns the public id to send with the application; the API checks the file again.
export async function uploadDirect(jobId: string, kind: "cv" | "document", file: File): Promise<string> {
  // Step 1: ask OUR API for a signed permission for this one file.
  const signed = await api.post<SignedUpload>(`/public/jobs/${jobId}/uploads`, {
    kind,                    // shorthand for kind: kind
    filename: file.name,
    size: file.size,
  });

  // Step 2: build a multipart form with the signed fields + the file...
  const form = new FormData();
  // Object.entries({a: 1}) -> [["a", 1]]; add each field to the form.
  Object.entries(signed.fields).forEach(([key, value]) => form.append(key, value));
  form.append("file", file);

  // ...and send it DIRECTLY to Cloudinary (not through our API).
  let response: Response;
  try {
    response = await fetch(signed.upload_url, { method: "POST", body: form });
  } catch {
    throw new ApiError(`Could not upload ${file.name}. Check your connection and try again.`, 0);
  }
  if (!response.ok) {
    // Cloudinary's errors look like { error: { message: "..." } }.
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(body?.error?.message ?? `Could not upload ${file.name}`, response.status);
  }
  // Step 3 (in the apply page): send this id with the application.
  return signed.public_id;
}
```
