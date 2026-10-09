# HireDesk Software Requirements Specification

- **Type:** project specification
- **Status:** Draft, as-built baseline
- **Owner:** TBD
- **Date:** 2026-10-09
- **Links:** [Product Requirements Document](prd-hiredesk.md); [ERD and Architecture](../docs/architecture/hiredesk-erd-and-architecture.md)

## 1. Purpose
This SRS records observable system behavior and constraints for the current HireDesk implementation. Requirements marked **Implemented** reflect the inspected source and tests; **Configuration-dependent** requirements need external credentials/services; **Open** items require a product decision or additional implementation.

## 2. System Context
HireDesk consists of a Next.js web application and a FastAPI JSON/form API backed by PostgreSQL. The API persists company, user, job, application, interview, scorecard, and invitation data. Cloudinary stores candidate documents; Resend sends transactional email; Google Identity Services provides optional login/registration when configured.

Candidates are external, unauthenticated users. Company users authenticate with email/password or Google and receive JWT bearer tokens for protected API operations.

## 3. User Classes and Authorization

| Role | Authorized behavior | Explicit restrictions |
|---|---|---|
| `company_admin` | Manage company users/invitations; read company jobs/users; receive assessment and successful-hire emails. | Cannot list/read applications or interviews through the current visibility queries. |
| `hiring_manager` | Create/update jobs assigned to them; review applications and interviews for those jobs; move stages; assess; decide; assign/cancel interviews; read all scorecards for visible applications. | Cannot access another company's data or another manager's job data. |
| `interviewer` | Read assigned non-cancelled interviews/applications; schedule assigned interviews; submit own scorecards; read scorecard information allowed by the privacy rule. | Cannot create jobs, invite users, move application stages, decide, schedule another interviewer's work, or receive an aggregate score. |
| Candidate | Read open public job details; submit an application. | No authenticated candidate account or private application API is defined. |

Protected resources are scoped to the user's company and role. Out-of-scope resources are generally returned as `404` to avoid disclosing their existence; role checks may return `403`.

## 4. Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-001 | The system shall create a company and its first `company_admin` when valid email/password registration succeeds. Email addresses shall be normalized to lowercase and unique. | Implemented |
| FR-002 | The system shall issue a signed bearer access token after valid password authentication and expose the current user's profile through `/auth/me`. | Implemented |
| FR-003 | When Google auth is enabled and a client ID is configured, the API shall verify the Google ID token audience and require a verified email before account lookup or creation. | Implemented; depends on Google credentials and network access |
| FR-004 | On Google auth, an existing user with the verified email shall sign in; an unknown identity shall create a company and `company_admin` account. | Implemented; invitation linking is open |
| FR-005 | A company admin shall be able to invite a hiring manager or interviewer. Invitations shall have a unique token hash, expire after seven days, and be accepted only once. | Implemented |
| FR-006 | A hiring manager shall be able to create and update jobs. Jobs shall support `draft`, `open`, and `closed` states and salary range validation. | Implemented |
| FR-007 | Public job detail and application endpoints shall expose only open jobs. | Implemented |
| FR-008 | A candidate shall be able to submit an application without creating a user account. Applications shall include required name, email, phone, and CV fields plus optional qualifications, expected salary, cover letter, and supporting documents. | Implemented |
| FR-009 | A candidate email shall be unique per job. Duplicate applications shall return conflict rather than creating another record. | Implemented |
| FR-010 | CV uploads shall allow PDF, DOC, or DOCX up to 5 MB. Supporting documents shall allow PDF, DOC, DOCX, PNG, or JPG up to 10 MB each, with a maximum of six documents. | Implemented; Cloudinary required |
| FR-011 | A hiring manager shall move an application through `applied -> screen -> interview -> offer -> hired` or reject it from any non-final stage. Each successful move shall append a stage-history record. | Implemented |
| FR-012 | A hiring manager shall record a nullable 0-100 match score and notes up to 5,000 characters. | Implemented |
| FR-013 | A hiring manager shall make a final `hired` or `rejected` decision. Hiring shall only be allowed from `offer`. | Implemented |
| FR-014 | The system shall assign interviews to same-company users with interviewer role. A new interview assignment shall create one pending scorecard and notify the interviewer. | Implemented |
| FR-015 | An assigned interviewer shall schedule only their own assigned interview for a future time and duration of 15-240 minutes. Virtual meetings require a URL; in-person meetings require a location. | Implemented |
| FR-016 | The database shall prevent overlapping scheduled interview ranges for the same interviewer. Adjacent time ranges may be scheduled; cancelled interviews do not reserve time. | Implemented |
| FR-017 | Scheduling shall send the candidate interview time and meeting URL or location when email is configured. | Configuration-dependent |
| FR-018 | The assigned interviewer shall submit one scorecard only after the interview is scheduled. It shall contain 1-20 unique criteria, each rated 1-5, optional comments, and an optional recommendation. | Implemented |
| FR-019 | A submitted scorecard shall become immutable through the submission endpoint and mark its interview completed. | Implemented |
| FR-020 | The application-level interviewer recommendation shall be `not_recommend` if any submitted recommendation is `not_recommend`; `recommend` if all submitted recommendations are `recommend`; otherwise `maybe` when recommendations exist. | Implemented |
| FR-021 | Hiring managers shall see all scorecards for visible applications and an aggregate of submitted scorecard averages. Interviewers shall not receive the aggregate. | Implemented |
| FR-022 | An interviewer shall see their own scorecards. They shall see other interviewers' submitted scorecards for a candidate only after submitting all of their own scorecards for that candidate. | Implemented |
| FR-023 | Candidate application receipt and stage/decision updates shall be sent by email when Resend is configured. Company admins shall receive assessment and successful-hire summary emails. | Configuration-dependent |

## 5. Data Requirements

- Primary identifiers are UUIDs.
- `User.email` is unique across the platform; user records belong to one company and one role.
- `Job` belongs to a company and optionally references its hiring manager.
- `Application` belongs to one job; `(job_id, email)` is unique. Candidate attributes are stored on the application, not a separate candidate entity.
- `StageHistory` records application stage transitions, with nullable actor for the initial candidate-submission event.
- `Interview` belongs to one application and one interviewer. Scheduling timestamps are nullable until scheduled.
- `Scorecard` has one unique row per interview. `ScorecardRating` uses `(scorecard_id, criterion)` as its composite primary key and enforces ratings from 1 to 5.
- `Invitation` belongs to a company and inviter; only a SHA-256 token hash is stored.
- Application supporting documents are persisted as JSON name/URL entries; files themselves are held in Cloudinary.

## 6. External Interfaces

| Interface | Contract |
|---|---|
| Web client to API | JSON, form-urlencoded, or multipart HTTP requests; bearer JWT for protected operations. API base URL is configured in the frontend. |
| Google Identity Services | Browser obtains a Google ID token; API verifies signature, issuer/audience through `google-auth`, and verified email using the configured client ID. |
| PostgreSQL | SQLModel/SQLAlchemy persistence; Alembic migrations define schema and PostgreSQL scheduling exclusion constraint. |
| Cloudinary | CV and supporting document uploads; supported file types and size limits are enforced before upload. |
| Resend | Plain-text transactional emails are queued with FastAPI background tasks. Missing configuration skips sending and logs a warning. |

## 7. Non-Functional Requirements

### Security and privacy
- NFR-SEC-1: Protected endpoints shall reject missing/invalid/expired bearer tokens with `401`.
- NFR-SEC-2: Role and company authorization shall be enforced server-side; frontend hiding alone is not authorization.
- NFR-SEC-3: Google identity shall be established only from a verified Google ID token; the API shall not trust a client-supplied email as proof of identity.
- NFR-SEC-4: Invitation secrets shall be single-use, time-limited, and stored as hashes.
- NFR-SEC-5: Passwords shall be stored as password hashes, not plaintext.

### Reliability and data integrity
- NFR-REL-1: Stage changes shall be serialized per application so concurrent updates cannot produce inconsistent history.
- NFR-REL-2: Interview overlap prevention shall be enforced by PostgreSQL, including concurrent scheduling attempts.
- NFR-REL-3: Scorecard submission shall be protected against duplicate concurrent submissions.
- NFR-REL-4: Email failures shall not fail the originating API request; failures shall be logged.

### Input and API behavior
- NFR-API-1: Invalid request fields shall return validation errors; expected domain conflicts shall return `409`.
- NFR-API-2: List applications shall support stage/job filters, sort selection, and pagination with `limit` from 1 to 200.
- NFR-API-3: Access token lifetime shall default to 60 minutes and be configurable.

### Availability and scale
- NFR-OPS-1: Production uptime, throughput, latency, retention, backup, disaster recovery, and maximum tenant scale have not been specified. They require product/operations decisions before production commitments.

## 8. API Surface Summary

| Area | Representative routes |
|---|---|
| Authentication | `POST /auth/register`, `POST /auth/login`, `POST /auth/google`, `POST /auth/accept-invite`, `GET /auth/me` |
| Team | `POST /users`, `GET /users` |
| Jobs | `POST /jobs`, `GET /jobs`, `GET /jobs/{job_id}`, `PATCH /jobs/{job_id}` |
| Public applications | `GET /public/jobs/{job_id}`, `POST /public/jobs/{job_id}/applications` |
| Candidate workflow | `GET /applications`, `GET /applications/{id}`, `PATCH /applications/{id}/stage`, `PATCH /applications/{id}/assessment`, `POST /applications/{id}/decision`, `GET /applications/{id}/history` |
| Interviews | `POST /interviews`, `PATCH /interviews/{id}/schedule`, `GET /interviews`, `POST /interviews/{id}/cancel` |
| Scorecards | `PUT /interviews/{id}/scorecard`, `GET /applications/{id}/scorecards` |

## 9. Error and Conflict Behavior

- `401`: invalid/expired authentication token or invalid Google ID token.
- `403`: authenticated user lacks the required role.
- `404`: resource is absent or not visible to the caller.
- `409`: duplicate application, invalid stage transition, completed workflow conflict, duplicate scorecard submission, or interviewer time conflict.
- `410`: invitation is expired, already accepted, or invalid.
- `422`: request validation failure, invalid interviewer/meeting details, or upload restrictions.
- `502`/`503`: external storage failure or missing service configuration as applicable.

## 10. Verification

- Backend automated coverage lives under `backend/tests/` and covers auth/invitations, candidate stage and assessment workflow, interview scheduling/conflicts, and scorecard privacy/aggregation.
- Frontend checks include TypeScript typecheck and Next.js production build.
- Google provider acceptance requires a real Google account, an authorized JavaScript origin, and a valid configured OAuth client. Mocked token-verification tests do not prove Google Console configuration or live provider availability.

## 11. Out of Scope and Open Issues

- No candidate account or candidate-facing application status portal.
- No custom pipeline stages, calendar integration, analytics, billing, password recovery, or MFA.
- Google sign-in currently creates a new company-admin account for an unknown verified email; it does not consume a pending team invitation. Decide whether pending invitees should be matched to invitations and assigned their invited company/role.
- User deletion, company deletion, record retention, and uploaded-file deletion behavior are not specified.
- Production service-level objectives and deployment topology are not specified.
