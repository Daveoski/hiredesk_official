# Daily Work Log

## 2026-10-08

- Validated the hiring workflow across applicant review, interviewer assignment and scheduling, scorecards, manager assessment, final decisions, and admin outcome notifications.
- Corrected role visibility and notification behavior; the complete backend test suite passed with 47 tests.
- Refreshed the public homepage with responsive layout, richer product copy, and the requested contact email and phone number.

## 2026-10-09

- Reworked the homepage in a more premium visual direction with responsive scroll-reveal motion and clearer role-specific workflow details.
- Removed unsupported performance statistics and an unverified testimonial so the marketing copy reflects implemented backend behavior.
- Connected Google Identity Services to login and registration. The backend now verifies Google-issued ID tokens and verified email claims before reusing or creating a company-admin account.
- Configured the supplied Google Web client ID in the ignored local frontend and backend environment files. Preserved the existing frontend API URL and enabled the backend Google auth setting.
- Created a separate local `hiredesk_dev` database and applied all three Alembic migrations. Cleared fixture rows only from the dedicated `hiredesk_test` database; preserved the local development account and invitation.
- Started the backend on `127.0.0.1:8002` and the frontend on `localhost:3000`.
- Verification: frontend typecheck and production build passed; all 11 authentication tests passed; login and registration returned HTTP 200; backend health returned `ok`; the Google sign-in widget rendered in the browser; mobile viewport had no horizontal overflow.
- Cleaned local artifacts by removing the empty SQLite test database and duplicate npm lockfiles, keeping Bun as the frontend package manager.
- Added repository setup/layout guidance and ignore rules for secrets, local databases, and generated frontend output; updated backend `.env` to persist the working `hiredesk_dev` connection.

### Bug fixes

- Backend failed to import in the project `.venv`: added `google-auth[requests]` and `alembic` to `pyproject.toml` (and `pytest` as a dev dependency) with `uv add`; changed `requirements.txt` to `google-auth[requests]`, which `google.auth.transport.requests` needs.
- `hiredesk_dev` was still at migration `0003` while the code reads the `password_login_enabled` column; applied `0004`.
- The frontend API client redirected to `/login` on any 401, so a rejected Google sign-in reloaded the login page and hid its error. It now redirects only when a session token was sent.
- Fixed `test_register_login_and_read_profile`, which matched the new `password_login_enabled` field; it now checks that `hashed_password` is not returned.

### Google sign-in for admins and hiring managers

- `/auth/google` signs in any existing team member, and an invited hiring manager or interviewer who signs in with Google now joins the inviting company with the invited role. Previously, an invited user signing in with Google got a new company and the admin role.
- New companies are created through Google only from the register page (`create_company: true`); an unknown Google email on the login page gets a clear 404.
- The accept-invite page has a Google button; it sends the invite token, and a different Google account gets a 403 naming the invited email.

### Password changes, personal dashboards and admin progress emails

- `PUT /auth/password` lets any signed-in user change their own password. It requires the current password unless the account has only used Google, and emails the user a confirmation. The new Account page (`/account`) is in every user's sidebar.
- Everyone now lands on `/overview`, which shows a dashboard for the signed-in user:
  - Interviewers: interviews to schedule, scorecards due, and upcoming interviews with join links.
  - Hiring managers: their jobs, plus a to-do list of applicants to screen, finished interviews, and offers awaiting a decision.
  - Admins: a company-wide progress report with the pipeline, progress by job, team workload, results, scorecards and recent activity, a period picker, and an "Email me this report" button.
- Company admins are now emailed on stage moves, hires and rejections, interviewer assignment, interview scheduling and cancellation, scorecard submission (with ratings and recommendation), and new teammates joining. The shared email helper is in `app/core/notifications.py`.
- Added `GET /reports/progress` and `POST /reports/progress/email` (admins only) and the `python -m app.reports.send_progress_reports [--days N]` script for scheduled report emails; documented scheduling in the README.

### Verification

- 60 backend tests passed, including new tests for Google invite acceptance, password changes, admin notifications, report access and content, and report emails. A shared `outbox` test fixture captures emails from every module.
- Frontend typecheck and production build passed. The new dashboards and Account page have not yet been checked in a browser.

## Follow-up

- Complete a real Google sign-in using a Google account and confirm `http://localhost:3000` is listed as an authorized JavaScript origin for the OAuth client.
- Click through the new dashboards and the Account page as an admin, a hiring manager and an interviewer.
- Schedule `python -m app.reports.send_progress_reports` (cron or Windows Task Scheduler) if automatic weekly reports are wanted.
- Consider a per-admin setting to turn progress notification emails off, since busy companies will get many emails.
- Delete the empty `backend/frontend/package-lock.json` and the npm `frontend/package-lock.json` that reappeared; Bun is the frontend package manager.

## Daily Entry Template

### YYYY-MM-DD

- Work completed:
- Verification:
- Follow-up:
