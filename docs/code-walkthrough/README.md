# HireDesk: line-by-line code walkthrough

Every source file in HireDesk, copied with explanation comments written inside the code. Each block can be copied as it is: the comments don't change what the code does.

Read in order: the backend follows a request from the entry point to the database, and the frontend follows a user from signing in to each page.

## Backend (Python, FastAPI)

| Part | Files |
|---|---|
| [01](01-backend-foundation.md) | `main.py`, `core/config.py`, `db/session.py`, `db/common.py` |
| [02](02-database-models.md) | Every model (table): companies, users, invitations, jobs, applications, stage history, interviews, scorecards |
| [03](03-security.md) | `core/security.py` (hashing, JWT), `auth/dependencies.py` (who is calling, roles), `auth/permissions.py` (who sees what), schemas |
| [04](04-auth-router.md) | `auth/router.py`: register, login, Google sign-in, password change, accept invite |
| [05](05-users-and-companies.md) | `users/router.py` (invitations: send, list, resend, revoke), `companies/router.py` |
| [06](06-jobs-public-apply-and-uploads.md) | Jobs, the public apply endpoints, `core/storage.py` (Cloudinary, direct uploads) |
| [07](07-candidates-pipeline.md) | Candidate schemas, `service.py` (stage rules + row lock), candidates router |
| [08](08-interviews.md) | Interview schemas and router (assign, schedule, cancel, no double-booking) |
| [09](09-scorecards.md) | Scorecard schemas and router (submit, privacy rule, aggregate) |
| [10](10-email-notifications-reports.md) | `core/email.py`, `core/notifications.py`, the progress report (schemas, service, router, weekly script) |
| [11](11-migrations-and-tests.md) | Alembic (`env.py`, migrations 0001–0005) and the tests (`conftest.py`, examples) |

## Frontend (TypeScript, Next.js, React)

| Part | Files |
|---|---|
| [12](12-frontend-foundation.md) | Root layout, providers, `lib/api.ts`, auth store, utils, `lib/uploads.ts` |
| [13](13-frontend-data-types-hooks-forms.md) | `lib/types.ts`, `lib/queries.ts` (data hooks), `lib/schemas.ts` (form rules), constants |
| [14](14-frontend-sign-in-pages.md) | Login, register, accept-invite, Google button, auth layout, logo |
| [15](15-frontend-app-frame-account-errors.md) | Protected layout, sidebar (app shell), dashboard picker, Account page, 404 and error pages |
| [16](16-frontend-dashboard-building-blocks.md) | `dashboard/parts.tsx`: hero, tiles, sections, to-do rows, stage bars, agenda, timeline |
| [17](17-frontend-role-dashboards.md) | Interviewer, hiring manager and admin dashboards |
| [18](18-frontend-jobs.md) | Jobs list, job board, job form, candidate card |
| [19](19-frontend-candidates.md) | Candidates list and detail page, stage menu, stage thread, assign and scorecard dialogs |
| [20](20-frontend-interviews-and-team.md) | Interviews page, schedule dialog, Team page (pending invitations), confirm dialog |
| [21](21-frontend-public-pages.md) | Apply page, CV dropzone, landing page, scroll reveal |
| [22](22-frontend-ui-styles-config.md) | UI components (button, input, dialog, dropdown, tabs...), shared pieces, `globals.css`, `next.config.ts` |

## Automation and deployment

| Part | Files |
|---|---|
| [23](23-ci-cd-and-deployment-files.md) | GitHub Actions workflows (backend, frontend, weekly reports), Vercel settings, the setup script |

Where a file repeats the same pattern many times (some CSS in `globals.css`, the `register` page's form fields, and parts of migration 0002's `downgrade()`), the repetition is summarised and marked with `...`. Everything else is complete.

For the big picture (what the app does, the PRD, SRS and ERD, a glossary, deployment history and practice questions), see [../HireDesk_Code_Guide.docx](../HireDesk_Code_Guide.docx).
