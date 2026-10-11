# Part 23: CI/CD and deployment files (copyable)

**CI** (Continuous Integration) = GitHub automatically checks every change. **CD** (Continuous Deployment) = Vercel automatically deploys `main`. Workflows are **YAML** files: indentation shows structure, `key: value` sets a setting, and `- item` is a list item.

## `.github/workflows/backend.yml`

```yaml
# Backend CI: runs the test suite on every push and pull request, then, on main,
# applies Alembic migrations to the production Neon database (used by the Vercel backend).
name: Backend                       # the name shown in GitHub's Actions tab

# WHEN it runs:
on:
  push:
    branches: [main]                # a push to main...
    paths: ["backend/**", ".github/workflows/backend.yml"]   # ...that changed backend files (or this file)
  pull_request:
    paths: ["backend/**", ".github/workflows/backend.yml"]   # any pull request touching the backend
  workflow_dispatch:                # also a "Run workflow" button in GitHub

# Every "run:" command starts inside the backend/ folder.
defaults:
  run:
    working-directory: backend

jobs:
  # JOB 1: test. Each job runs on a fresh virtual machine ("runner").
  test:
    runs-on: ubuntu-latest
    # A SERVICE CONTAINER: a throwaway PostgreSQL 16 database just for this job.
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: hiredesk_test      # ends in _test, as conftest.py requires
        ports: ["5432:5432"]
        # Wait until the database is ready before starting the steps.
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      # conftest.py reads this to find the test database.
      TEST_DATABASE_URL: postgresql+psycopg://postgres:postgres@localhost:5432/hiredesk_test
    steps:
      - uses: actions/checkout@v4             # download the repository's code
      - uses: actions/setup-python@v5         # install Python 3.12...
        with:
          python-version: "3.12"
          cache: pip                          # ...and cache downloaded packages between runs (faster)
          cache-dependency-path: backend/requirements*.txt
      - run: pip install -r requirements-dev.txt    # runtime packages + pytest
      - run: pytest -q                              # all 73 tests; any failure fails the job
      - name: Models match migrations
        # The tests migrated the database to head; fail if a model changed without a migration.
        env:
          DATABASE_URL: ${{ env.TEST_DATABASE_URL }}     # ${{ ... }} = a GitHub expression
          JWT_SECRET: ci-only-placeholder-secret-0123456789abcdef
        run: alembic check

  # JOB 2: migrate the PRODUCTION database.
  migrate:
    # Only after the tests pass on main. Needs the repository secret NEON_DATABASE_URL_UNPOOLED
    # (the DATABASE_URL_UNPOOLED value from the Vercel/Neon integration).
    needs: test                     # wait for "test" to succeed
    # Never for pull requests; only real pushes to main.
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    # Never two migration runs at the same time.
    concurrency: production-migrations
    env:
      # SECRETS are encrypted values stored in the repo's settings, readable only by workflows.
      DATABASE_URL: ${{ secrets.NEON_DATABASE_URL_UNPOOLED }}
      # Settings validation needs a value; migrations never sign tokens.
      JWT_SECRET: migrations-only-placeholder-secret-0123456789
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: backend/requirements*.txt
      - run: pip install -r requirements.txt
      - name: Apply migrations
        # "run: |" = a multi-line shell script.
        run: |
          # -z = "is empty". Without the secret, skip with a yellow warning instead of failing.
          if [ -z "$DATABASE_URL" ]; then
            echo "::warning::NEON_DATABASE_URL_UNPOOLED secret is not set; skipping migrations."
            exit 0
          fi
          alembic upgrade head
```

## `.github/workflows/frontend.yml`

```yaml
# Frontend CI: typecheck and production-build the Next.js app on every change,
# so a broken build is caught here instead of on the Vercel deployment.
name: Frontend

on:
  push:
    branches: [main]
    paths: ["frontend/**", ".github/workflows/frontend.yml"]
  pull_request:
    paths: ["frontend/**", ".github/workflows/frontend.yml"]
  workflow_dispatch:

defaults:
  run:
    working-directory: frontend

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_API_URL: https://hiredesk-api.vercel.app   # baked into the build, like on Vercel
      NEXT_TELEMETRY_DISABLED: "1"                           # don't send Next.js usage statistics
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2                # install Bun
      - run: bun install --frozen-lockfile        # install EXACTLY bun.lock's versions (fail if out of date)
      - run: bun run typecheck                    # tsc --noEmit: any type error fails the job
      - run: bun run build                        # next build: the same build Vercel does
```

## `.github/workflows/progress-reports.yml`

```yaml
# Emails every company's admins their hiring progress report, every Monday at 08:00 UTC
# (09:00 in Lagos). Can also be run by hand from the Actions tab with a custom period.
name: Progress reports

on:
  # CRON format: minute hour day-of-month month day-of-week. "0 8 * * 1" = 08:00 every Monday.
  schedule:
    - cron: "0 8 * * 1"
  # By hand, with an input box for the number of days.
  workflow_dispatch:
    inputs:
      days:
        description: "Report period in days"
        default: "7"
        required: true

jobs:
  send:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    env:
      DATABASE_URL: ${{ secrets.NEON_DATABASE_URL_UNPOOLED }}
      RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
      # Use Gmail only when the SMTP_USERNAME secret exists. "A && B || C" = if A then B else C.
      SMTP_HOST: ${{ secrets.SMTP_USERNAME && 'smtp.gmail.com' || '' }}
      SMTP_USERNAME: ${{ secrets.SMTP_USERNAME }}
      SMTP_PASSWORD: ${{ secrets.SMTP_PASSWORD }}
      EMAIL_FROM: ${{ secrets.EMAIL_FROM || 'HireDesk <onboarding@resend.dev>' }}
      FRONTEND_BASE_URL: ${{ secrets.FRONTEND_BASE_URL || 'http://localhost:3000' }}
      # Settings validation needs a value; the report never signs tokens.
      JWT_SECRET: reports-only-placeholder-secret-0123456789
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: backend/requirements*.txt
      - run: pip install -r requirements.txt
      - name: Send progress reports
        run: |
          # Need a database AND some way to send email; otherwise skip with a warning.
          if [ -z "$DATABASE_URL" ] || { [ -z "$SMTP_HOST" ] && [ -z "$RESEND_API_KEY" ]; }; then
            echo "::warning::Set NEON_DATABASE_URL_UNPOOLED and either SMTP_USERNAME/SMTP_PASSWORD or RESEND_API_KEY; no reports sent."
            exit 0
          fi
          # The days typed in by hand, or 7 for the scheduled run.
          python -m app.reports.send_progress_reports --days "${{ github.event.inputs.days || '7' }}"
```

## Vercel and other deployment files

```jsonc
// backend/vercel.json: settings for the backend's Vercel function.
{
  "$schema": "https://openapi.vercel.sh/vercel.json",   // lets editors check this file
  "functions": {
    // The FastAPI entry point (Vercel finds app/main.py automatically).
    "app/main.py": {
      // Keep these OUT of the deployed bundle: smaller and faster, and no test code in production.
      "excludeFiles": "{tests/**,frontend/**,.pytest_cache/**,tmp_*.db}"
    }
  }
}
```

| File | Purpose |
|---|---|
| `backend/.python-version` | `3.12`: tells Vercel which Python to use |
| `backend/requirements.txt` | Runtime packages Vercel installs (FastAPI, SQLModel, psycopg, Alembic, google-auth[requests], pwdlib[argon2], cloudinary, resend...) |
| `backend/requirements-dev.txt` | `-r requirements.txt` plus `pytest` and `httpx`, for tests only |
| `frontend/.vercelignore` | Keeps `node_modules`, `.next`, `.env*` out of CLI uploads |
| `.gitattributes` | `*.sh text eol=lf`: shell scripts keep Unix line endings even on Windows (bash can't run Windows endings) |
| `.gitignore` files | Never commit `.env`, `.venv`, `node_modules`, `.next`, `.vercel` |

**Vercel project settings** (set in the dashboard or through the API):

| Setting | `hiredesk-official` (site) | `hiredesk-api` (backend) |
|---|---|---|
| Root Directory | `frontend` | `backend` |
| Framework Preset | Next.js | FastAPI |
| Production branch | `main` | `main` |
| Domain | `hiredesk-app.vercel.app` | `hiredesk-api.vercel.app` |
| Protection | Production public, previews private | same |
| Environment variables | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `DATABASE_URL` + `DATABASE_URL_UNPOOLED` (from Neon), `JWT_SECRET`, `FRONTEND_BASE_URL`, `CORS_ORIGINS`, `CORS_ORIGIN_REGEX`, `GOOGLE_*`, `CLOUDINARY_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `SMTP_*` (once set up) |

## `scripts/setup-google-signin-and-email.sh` (how it's built)

```bash
#!/usr/bin/env bash
# The "shebang": run this file with bash.

set -euo pipefail
# -e: stop at the first failing command.  -u: error on undefined variables.
# -o pipefail: a failure anywhere in a "a | b" pipe counts as a failure.

# ── The library part (identical in every wizard) defines small helpers:
#   stage "Name"        clear the screen, print "Stage 3/7 · Name"
#   say / step / note   print instructions in different styles
#   open_url URL        open a web page in the browser (works on Windows, Mac, Linux, WSL)
#   ask VAR "Prompt"    read visible input into VAR (offers the saved value as a default)
#   ask_secret VAR ...  the same, but hidden (read -s), for passwords
#   write_env KEY VAL   add or replace KEY=VAL in backend/.env
#   set_secret NAME VAL set a GitHub secret with the gh CLI (or note it as "to do by hand")
#   confirm "Q?"        a y/N question
#   finish              print a summary of what was saved and what's left

# ── The stages part, specific to HireDesk:
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # the repo root, wherever you run it from
ENV_FILE="$ROOT/backend/.env"                             # where settings are saved
PY="$ROOT/.venv/Scripts/python"                           # the project's Python on Windows...
[[ -x "$PY" ]] || PY="$ROOT/.venv/bin/python"             # ...or on Mac/Linux

# run_py: run a Python snippet from backend/, so it can import the app and read backend/.env.
run_py() { (cd "$ROOT/backend" && "$PY" -c "$1"); }

TOTAL_STAGES=7
# Stage 1-2: open Google Cloud Console; tell you to add https://hiredesk-app.vercel.app as an
#            Authorized JavaScript origin and to publish the app (or add test users).
# Stage 3:   open Google's 2-Step Verification page (needed before app passwords).
# Stage 4:   open the App Passwords page; ask for your Gmail address and the app password (hidden);
#            CHECK it by logging in to smtp.gmail.com with Python's smtplib; loop until it works;
#            then write SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD to backend/.env.
#            (Secrets are passed to Python through ENVIRONMENT VARIABLES, never as command-line
#             arguments, so they don't show up in process lists.)
# Stage 5:   send a real test invitation email using the app's own send_email() + invitation_email().
# Stage 6:   after confirm "y": save the four SMTP settings to the hiredesk-api Vercel project through
#            Vercel's REST API (using the Vercel CLI's login token), redeploy production, wait for READY,
#            and check /health. Also tries to set the GitHub secrets for the Monday report.
# Stage 7:   open the live login page so you can try "Continue with Google" and inviting someone.
```

Run it from Git Bash or PowerShell: `& "C:\Program Files\Git\bin\bash.exe" scripts/setup-google-signin-and-email.sh`.
