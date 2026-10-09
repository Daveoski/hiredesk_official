# HireDesk

HireDesk is an applicant-tracking platform with a Next.js web client and a FastAPI backend. The backend owns authentication, authorization, hiring workflow rules, persistence, file uploads, and email delivery.

## Repository Layout

```text
backend/
	app/                 FastAPI routes, domain models, schemas, and integrations
	alembic/             PostgreSQL schema migrations
	tests/               API and workflow regression tests
frontend/
	src/app/             Next.js routes and pages
	src/components/      UI, layout, and workflow components
	src/lib/              API client, types, schemas, and shared utilities
docs/                   Architecture documentation
specs/                  Product and software requirements
WORK_LOG.md             Dated project activity log
```

## Local Development

### Backend

1. Install backend dependencies from `backend/requirements.txt` in your Python environment.
2. Configure `backend/.env` using `backend/.env.example` as a key reference. Keep real credentials in the ignored `.env`, never in source control.
3. Ensure PostgreSQL is running and `DATABASE_URL` points to a development database, not the test database.
4. From `backend/`, apply migrations and start the API:

```sh
alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8002
```

The health endpoint is `http://127.0.0.1:8002/health` and the OpenAPI page is `http://127.0.0.1:8002/docs`.

### Frontend

1. Configure `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://127.0.0.1:8002` and any public frontend configuration required for enabled features.
2. From `frontend/`, install dependencies and start Next.js with Bun:

```sh
bun install
bun run dev
```

The web client is available at `http://localhost:3000`.

## Tests and Local Data

Run backend tests from `backend/` with `pytest`. The test fixture defaults to PostgreSQL database `hiredesk_test` and asserts that the configured test database name ends with `_test`. It truncates that database before each test. Never point `TEST_DATABASE_URL` at `hiredesk_dev` or any database containing data you want to keep.

The frontend has `bun run typecheck` and `bun run build` checks. Test files are retained as regression coverage; cleanup of local database rows does not require deleting the tests.

## Deployment (Vercel + Neon Postgres)

The repo deploys as two Vercel projects from the same GitHub repository. Every push to `main` redeploys both.

| Vercel project | Root Directory | Framework | Environment variables |
|---|---|---|---|
| `hiredesk-api` | `backend` | FastAPI (auto-detected from `app/main.py`) | `DATABASE_URL` (injected by Neon), `JWT_SECRET`, `FRONTEND_BASE_URL`, `CORS_ORIGINS`, optional `CORS_ORIGIN_REGEX`, `GOOGLE_AUTH_ENABLED`, `GOOGLE_CLIENT_ID`, `CLOUDINARY_*`, `RESEND_API_KEY`, `EMAIL_FROM` |
| `hiredesk` | `frontend` | Next.js (Bun) | `NEXT_PUBLIC_API_URL` (the backend URL), `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |

- The database is Neon Postgres from the Vercel Marketplace (Storage tab), connected to the backend project. The backend converts Neon's `postgres://` URL to the psycopg driver and disables prepared statements for the pooled connection.
- `.github/workflows/backend.yml` runs the backend tests on every push and pull request. On `main` it then runs `alembic upgrade head` against Neon using the repository secret `NEON_DATABASE_URL_UNPOOLED` (the `DATABASE_URL_UNPOOLED` value from the Neon integration).
- Vercel Functions accept request bodies up to 4.5 MB, so larger CV or document uploads through the backend are rejected with HTTP 413.

## Integrations

- Google sign-in uses a public web client ID in the frontend and matching verification settings in the backend.
- Cloudinary stores candidate CVs and supporting documents.
- Resend sends transactional email when configured. Company admins are emailed as hiring progresses (stage moves, hires and rejections, interviews, scorecards, new teammates).

### Scheduled progress reports

Admins can view the progress report on their dashboard and email it to themselves. To send every company's admins the report automatically, schedule this command from `backend/`:

```bash
python -m app.reports.send_progress_reports            # the last 7 days
python -m app.reports.send_progress_reports --days 1   # a daily report
```

For example with cron (`0 8 * * 1` for Mondays at 8:00) or Windows Task Scheduler (`schtasks /Create /SC WEEKLY /D MON /ST 08:00 ...`).

Set production credentials in the deployment platform's secret/environment configuration. Do not commit `.env` files, API keys, provider secrets, or JWT signing keys.
