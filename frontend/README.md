# HireDesk frontend

Next.js (App Router), TypeScript, Tailwind CSS v4, shadcn/ui-style components, TanStack Query, Zustand, Zod.

## Run it

```bash
bun install
bun run dev                    # http://localhost:3000
```

Create `.env.local` in this directory with `NEXT_PUBLIC_API_URL=http://localhost:8000` before starting the frontend.

The backend must allow this origin. In the backend `.env`:

```
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

## Where things are

- `src/app` pages: the public landing page, `login`, `register`, `accept-invite`, `apply/[jobId]` (public), and `(app)/` for logged-in pages.
- `src/lib/api.ts` fetch wrapper, `queries.ts` all TanStack Query hooks, `schemas.ts` all Zod schemas.
- `src/stores/auth-store.ts` the only Zustand store (token and user, saved in localStorage).
- `src/components/ui` base components, `shared` reusable pieces, `features` screen-specific dialogs.
