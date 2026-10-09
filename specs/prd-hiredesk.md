# HireDesk Product Requirements Document

- **Type:** project
- **Status:** Draft, as-built baseline
- **Owner:** TBD
- **Date:** 2026-10-09
- **Links:** [Software Requirements Specification](srs-hiredesk.md); [ERD and Architecture](../docs/architecture/hiredesk-erd-and-architecture.md)

## Summary
HireDesk is a multi-company applicant tracking workspace for managing job posts, candidate applications, interviewer coordination, assessments, and final hiring decisions. This document describes the product supported by the current repository and highlights decisions that remain open.

## Problem and Goals
Hiring teams need one place to review applicants, coordinate interviews, record assessment evidence, and communicate outcomes. Candidate information and hiring decisions should be available to the right company roles without exposing them to every teammate.

Product goals:
- Let companies publish open roles and receive candidate applications with CVs and supporting information.
- Give hiring managers a clear, sequential candidate pipeline and final decision workflow.
- Let interviewers schedule assigned meetings and submit independent scorecards.
- Give company admins team administration and outcome notifications without general access to applicant records.
- Preserve an auditable stage history and enforce company and role access in the backend.

## Users and Use Cases

| User | Primary use cases |
|---|---|
| Candidate | View an open job, submit an application, receive confirmation and stage/interview outcome emails. Candidates do not have HireDesk accounts. |
| Company admin | Create the company workspace, invite hiring managers/interviewers, view company jobs and team members, receive completed assessment and successful-hire notifications. |
| Hiring manager | Create and manage jobs, review candidates for assigned jobs, move applications through stages, record qualification assessments, assign interviewers, and make final decisions. |
| Interviewer | View assigned interviews and candidates, schedule a virtual or in-person interview, submit a scorecard, and view other submitted feedback only after submitting their own scorecards for that candidate. |

## Product Scope

### Current scope
- Company registration with email/password or optional Google sign-in.
- Company team invitations for hiring managers and interviewers.
- Job creation, editing, and draft/open/closed states.
- Public job details and candidate application submission.
- CV and supporting-document uploads through Cloudinary.
- A fixed application stage sequence: `applied -> screen -> interview -> offer -> hired`; candidates can also be rejected from any non-final stage.
- Hiring-manager assessments, interviewer assignment and scheduling, scorecards, recommendations, and final decisions.
- Email notifications through Resend when configured.
- Role-based access control and stage history.

### Out of scope for the current baseline
- Candidate login, candidate dashboards, or self-service application tracking.
- Custom per-company hiring stages or workflow builders.
- Interview calendar synchronization with Google Calendar or other providers.
- Automated CV parsing, ranking, or AI recommendations.
- Billing, subscriptions, analytics dashboards, and multi-language support.
- Password reset, MFA, SSO for organizations, or social providers other than Google.

## Product Requirements

### PR-1: Company workspace and identity
A new company administrator can create a company workspace using email/password. When Google sign-in is configured, a verified first-time Google identity can create a company-admin account; an existing account with the same verified email can sign in.

**Acceptance:** A successful registration creates one company and one admin; duplicate email registration is rejected; Google auth rejects invalid or unverified Google identity tokens.

### PR-2: Team invitations
A company admin can invite a teammate as a hiring manager or interviewer. The invitation is one-time and expires after seven days. Accepting it creates a user with the invited role and company membership.

**Acceptance:** An expired, reused, or invalid token cannot create an account; a valid token preserves the invited company and role.

### PR-3: Job management and public listing
Hiring managers can create and update jobs. Jobs are draft by default; only open jobs are visible to candidates and accept applications; closed jobs no longer accept applications.

**Acceptance:** Public reads and applications for a non-open or unknown job return not found; invalid salary ranges are rejected.

### PR-4: Candidate application intake
Candidates can apply without an account using their name, email, phone, CV, qualifications, and optional cover letter, expected salary, and supporting documents.

**Acceptance:** A CV is PDF, DOC, or DOCX and no larger than 5 MB; up to six supporting documents can be uploaded, each PDF/DOC/DOCX/PNG/JPG and no larger than 10 MB; the same email cannot apply twice to one job.

### PR-5: Stage-based review
Hiring managers can advance applications one step at a time through the fixed pipeline or reject an application from any non-final stage. Each move is recorded in stage history and candidate stage updates are emailed when Resend is configured.

**Acceptance:** Skipped, backward, repeated-final, or otherwise invalid transitions are rejected; every successful transition records prior stage, next stage, actor, and timestamp.

### PR-6: Assessment and final decision
Hiring managers can record a 0-100 qualification match score and notes up to 5,000 characters. They make the final hire/reject decision; hiring is allowed only from the offer stage. Company admins receive an assessment summary and successful-hire notification, while candidates receive decision updates.

**Acceptance:** Only a hiring manager can assess or decide; admin notification contains candidate, role, assessment score/notes, and interviewer recommendation where available; final transitions follow the stage rules.

### PR-7: Interview coordination
A hiring manager assigns a company interviewer to a non-final application. The interviewer selects a future time, duration from 15 to 240 minutes, and either a virtual meeting URL or physical location. Candidate receives the scheduled meeting details by email when Resend is configured.

**Acceptance:** The interviewer must belong to the same company and have the interviewer role; overlapping scheduled interviews for one interviewer are rejected; cancelled interview slots are reusable.

### PR-8: Interview scorecards
Each assigned interview has one pending scorecard. The assigned interviewer submits one scorecard after the interview is scheduled, with 1-20 unique criteria, ratings from 1 to 5, optional comments, and an optional recommendation.

**Acceptance:** An unassigned interviewer, cancelled interview, unscheduled interview, or previously submitted scorecard cannot be submitted; submission marks the interview completed; managers can see all submitted scorecards and the aggregate average.

### PR-9: Role-appropriate access
The backend enforces company and role visibility for every protected resource. Company admins can manage team members and view company jobs but do not browse application or interview records. Hiring managers see applications and interviews for their assigned jobs. Interviewers see their active assignments and are subject to scorecard privacy rules.

**Acceptance:** Requests outside a user's resource scope do not disclose whether the resource exists; role violations return forbidden where applicable.

## Success Measures
The repository does not currently implement product analytics, so these are proposed measures, not existing reports:
- Time from application receipt to final decision.
- Percentage of assigned interviews with scorecards submitted.
- Candidate notification delivery success rate.
- Application progression and hiring conversion by job.
- Duplicate application and scheduling-conflict rejection rates.

## Assumptions
- The first successful account in a new workspace is a company admin.
- Hiring managers own job records and candidate decisions.
- The hiring pipeline is shared and fixed across jobs.
- Email and file storage are external integrations and may be unconfigured in development.
- A Google-authenticated user is matched to an existing account by verified email.

## Open Questions and Risks
- Should Google sign-in accept a pending team invitation and preserve the invited company and role? Current Google first-time registration creates a new company-admin account and does not consume a pending invitation.
- Should Google registration require explicit company name input, or is the current derived company name acceptable?
- What retention and deletion rules apply to CVs, applications, and stage history?
- What availability, response-time, backup, and recovery objectives should apply in production?
- Which email delivery and Cloudinary configurations are required before a production launch?
