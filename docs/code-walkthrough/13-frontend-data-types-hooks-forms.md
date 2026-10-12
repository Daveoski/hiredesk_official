# Part 13: Frontend data: types, data hooks, form rules, constants (copyable)

- `lib/types.ts`: TypeScript shapes that **mirror the backend's response schemas**.
- `lib/queries.ts`: **hooks** that fetch and change server data with TanStack Query.
- `lib/schemas.ts`: **Zod** rules for every form.
- `lib/constants.ts`: stage lists, labels, colours and where each role lands after login.

## `src/lib/types.ts` (the important parts)

```ts
// These types mirror the backend response schemas.
// If the backend adds a field to a response, add it here too, or TypeScript won't know about it.

// A "union of string literals": the value must be exactly one of these strings.
// (These match the Python StrEnums in the backend models.)
export type Role = "company_admin" | "hiring_manager" | "interviewer";
export type Stage = "applied" | "screen" | "interview" | "offer" | "hired" | "rejected";
export type JobStatus = "draft" | "open" | "closed";
export type InterviewStatus = "assigned" | "scheduled" | "completed" | "cancelled";
export type ScorecardStatus = "pending" | "submitted";
export type Recommendation = "recommend" | "maybe" | "not_recommend";

// Matches the backend's UserRead. Ids are strings in JSON (UUIDs as text).
export interface User {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role: Role;
  password_login_enabled: boolean;
}

// Matches PendingInvitationRead (GET /users/invitations). Dates arrive as ISO text: "2026-10-11T...".
export interface PendingInvitation {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
  expires_at: string;
}

// Matches UserInvitationRead (inviting/resending): includes the link and whether the email went out.
export interface UserInvitation {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  expires_at: string;
  invite_url: string;
  email_sent: boolean;
}

export interface Company {
  id: string;
  name: string;
}

// Matches JobRead. "number | null" = a number or nothing (salary not given).
export interface Job {
  id: string;
  title: string;
  description: string;
  qualification_requirements: string;
  salary_min: number | null;
  salary_max: number | null;
  status: JobStatus;
  hiring_manager_id: string | null;
  created_at: string;
  stages: Stage[];                      // Stage[] = an array of stages
}

// Matches PublicJobRead (the apply page). Includes company_name, no internal fields.
export interface PublicJob { id: string; title: string; description: string; company_name: string;
  qualification_requirements: string; salary_min: number | null; salary_max: number | null; }

// Matches ApplicationRead: the candidate + a few job fields.
export interface Application {
  id: string;
  job_id: string;
  job_title: string;
  job_qualification_requirements: string;
  job_salary_min: number | null;
  job_salary_max: number | null;
  full_name: string;
  email: string;
  phone: string;
  cv_url: string;
  candidate_qualifications: string;
  expected_salary: number | null;
  match_score: number | null;
  manager_notes: string | null;
  interviewer_recommendation: Recommendation | null;
  supporting_documents: { name: string; url: string }[];   // an array of {name, url} objects
  cover_letter: string | null;
  stage: Stage;
  created_at: string;
}

// The other interfaces follow the same pattern, one per backend schema:
//   StageHistory          <- StageHistoryRead      (from_stage, to_stage, changed_by_id, changed_at)
//   Interview             <- InterviewRead         (starts_at, ends_at, status, meeting_type, ..., duration_minutes)
//   Rating / Scorecard    <- RatingRead / ScorecardRead (ratings, recommendation, average_score)
//   ApplicationScorecards <- ApplicationScorecards (aggregate_score + scorecards)
//   ProgressReport        <- ProgressReport        (totals, pipeline, jobs, team, recent_activity, results, scorecards)
// Record<Stage, number> (used in ProgressReport) = an object with one number per stage.
```

## `src/lib/queries.ts`: every read and write the app makes

```ts
// useQuery = READ data (cached, with loading/error states). useMutation = CHANGE data.
// useQueryClient = access the cache. keepPreviousData = show old data while new data loads.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  Application, ApplicationScorecards, Company, Interview, Job, JobStatus, PendingInvitation,
  ProgressReport, Role, Scorecard, Stage, StageHistory, User, UserInvitation, Recommendation,
} from "./types";

// ---- Reading data ----
// Pattern: useQuery({ queryKey, queryFn, enabled })
//   queryKey = the cache NAME. Two components using the same key share one request and one result.
//   queryFn  = the function that fetches.
//   enabled  = false means "don't fetch" (e.g. the user's role isn't allowed to).
// In a component:  const jobs = useJobs();  then jobs.data, jobs.isLoading, jobs.isError, jobs.error

// The user's company (sidebar shows its name). Arrow function returning the useQuery result.
export const useCompany = () => useQuery({ queryKey: ["company"], queryFn: () => api.get<Company>("/companies/me") });

// All visible jobs. "enabled = true" is a default parameter value.
export const useJobs = (enabled = true) =>
  useQuery({ queryKey: ["jobs"], queryFn: () => api.get<Job[]>("/jobs"), enabled });

// One job. Key ["jobs", jobId]: it starts with "jobs", so invalidating "jobs" also refreshes this.
export const useJob = (jobId: string) =>
  useQuery({ queryKey: ["jobs", jobId], queryFn: () => api.get<Job>(`/jobs/${jobId}`) });

// Managers and admins only.
// Team members, optionally filtered by role (e.g. "interviewer" for the assign dialog).
// "role?: Role" = optional. "role ?? 'all'" = use "all" in the key when no role is given.
export const useUsers = (enabled = true, role?: Role) =>
  useQuery({
    queryKey: ["users", role ?? "all"],
    queryFn: () => api.get<User[]>(role ? `/users?role=${role}` : "/users"),
    enabled,
  });

// Candidates, optionally for one job, sorted. Every option is part of the key,
// so each combination is cached separately.
export const useApplications = (
  jobId?: string,
  sortBy = "created_at",
  sortOrder: "asc" | "desc" = "desc",
  enabled = true,
) =>
  useQuery({
    queryKey: ["applications", jobId ?? "all", sortBy, sortOrder],
    // Build the URL; add &job_id=... only when a job is given.
    queryFn: () => api.get<Application[]>(`/applications?limit=200&sort_by=${sortBy}&sort_order=${sortOrder}${jobId ? `&job_id=${jobId}` : ""}`),
    enabled,
  });

// One candidate.
export const useApplication = (id: string) =>
  useQuery({ queryKey: ["application", id], queryFn: () => api.get<Application>(`/applications/${id}`) });

// A candidate's stage history (managers only, so "enabled" is passed in).
export const useHistory = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["history", id],
    queryFn: () => api.get<StageHistory[]>(`/applications/${id}/history`),
    enabled,
  });

// All visible interviews, or one candidate's interviews.
export const useInterviews = (applicationId?: string, enabled = true) =>
  useQuery({
    queryKey: ["interviews", applicationId ?? "all"],
    queryFn: () => api.get<Interview[]>(applicationId ? `/interviews?application_id=${applicationId}` : "/interviews"),
    enabled,
  });

// A candidate's scorecards (+ aggregate for managers).
export const useScorecards = (applicationId: string) =>
  useQuery({
    queryKey: ["scorecards", applicationId],
    queryFn: () => api.get<ApplicationScorecards>(`/applications/${applicationId}/scorecards`),
  });

// Company admins only.
// The admin dashboard's report for the last N days.
export const useProgressReport = (days: number, enabled = true) =>
  useQuery({
    queryKey: ["progress-report", days],
    queryFn: () => api.get<ProgressReport>(`/reports/progress?days=${days}`),
    enabled,
    // Keep showing the previous period while the new one loads, so the page does not jump.
    placeholderData: keepPreviousData,
  });

// ---- Changing data ----
// Pattern: useMutation({ mutationFn, onSuccess })
// In a component:  const create = useCreateJob();  create.mutate(body, { onSuccess, onError });
// create.isPending is true while the request runs (used to disable buttons).

// "Email me this report".
export function useEmailProgressReport() {
  return useMutation({
    mutationFn: (days: number) => api.post<{ sent_to: string[] }>(`/reports/progress/email?days=${days}`),
  });
}

// Account page.
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password?: string; password: string }) => api.put<User>("/auth/password", body),
  });
}

// Any change to a candidate can affect many screens, so these refresh the related lists.
// Returns a function: refresh("jobs", "applications") marks those caches stale, and any
// screen showing them refetches automatically.
function useRefresh() {
  const queryClient = useQueryClient();
  return (...keys: string[]) => keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}

export function useCreateJob() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { title: string; description: string; qualification_requirements: string; salary_min?: number; salary_max?: number }) =>
      api.post<Job>("/jobs", body),
    onSuccess: () => refresh("jobs"),        // the jobs list now includes the new job
  });
}

export function useUpdateJob(jobId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { title?: string; description?: string; qualification_requirements?: string; salary_min?: number | null; salary_max?: number | null; status?: JobStatus }) =>
      api.patch<Job>(`/jobs/${jobId}`, body),
    onSuccess: () => refresh("jobs", "applications"),
  });
}

// Moving a candidate, with an OPTIMISTIC UPDATE: the board changes instantly, before the server answers.
export function useMoveStage() {
  const queryClient = useQueryClient();
  return useMutation({
    // ({ id, stage }) = "destructuring": take id and stage out of the object passed to mutate().
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) =>
      api.patch<Application>(`/applications/${id}/stage`, { stage }),
    // Update the board right away, then roll back if the server refuses (for example, a skipped stage).
    // onMutate runs BEFORE the request.
    onMutate: async ({ id, stage }) => {
      // Stop any refetch in progress so it doesn't overwrite our instant change.
      await queryClient.cancelQueries({ queryKey: ["applications"] });
      // Snapshot every cached "applications" list, to restore on error.
      const previous = queryClient.getQueriesData<Application[]>({ queryKey: ["applications"] });
      // In every cached list, change this candidate's stage. "{ ...item, stage }" = a copy with stage replaced.
      queryClient.setQueriesData<Application[]>({ queryKey: ["applications"] }, (list) =>
        list?.map((item) => (item.id === id ? { ...item, stage } : item)),
      );
      // Whatever we return here is passed to onError/onSettled as "context".
      return { previous };
    },
    // The server refused (e.g. 409): put every list back as it was.
    // _error, _vars = parameters we don't use (the leading underscore says so).
    onError: (_error, _vars, context) => context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data)),
    // Success or failure: refetch the real data to be sure the screen matches the server.
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      queryClient.invalidateQueries({ queryKey: ["history", id] });
    },
  });
}

// Hire or reject.
export function useDecide() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "hired" | "rejected" }) =>
      api.post<Application>(`/applications/${id}/decision`, { decision }),
    onSuccess: () => refresh("applications", "application", "history"),
  });
}

// The interviewer picks a time. "{ interviewId, ...body }" = take interviewId out; the REST goes in the body.
export function useScheduleInterview() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ interviewId, ...body }: { interviewId: string; starts_at: string; duration_minutes: number; meeting_type: "virtual" | "in_person"; meeting_url?: string; location?: string }) =>
      api.patch<Interview>(`/interviews/${interviewId}/schedule`, body),
    onSuccess: () => refresh("interviews", "scorecards", "applications"),
  });
}

// The hiring manager assigns an interviewer.
export function useAssignInterviewer() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { application_id: string; interviewer_id: string }) => api.post<Interview>("/interviews", body),
    onSuccess: () => refresh("interviews", "scorecards", "applications"),
  });
}

// Save the match score and notes.
export function useAssessApplication() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; match_score: number | null; manager_notes: string }) =>
      api.patch<Application>(`/applications/${id}/assessment`, body),
    onSuccess: () => refresh("applications", "application"),
  });
}

export function useCancelInterview() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.post<Interview>(`/interviews/${id}/cancel`),
    onSuccess: () => refresh("interviews", "scorecards"),
  });
}

export function useSubmitScorecard() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({
      interviewId,
      ratings,
      recommendation,
    }: {
      interviewId: string;
      ratings: { criterion: string; rating: number; comment?: string }[];
      recommendation: Recommendation;
    }) => api.put<Scorecard>(`/interviews/${interviewId}/scorecard`, { ratings, recommendation }),
    onSuccess: () => refresh("interviews", "scorecards", "applications"),
  });
}

// Invite a teammate.
export function useCreateUser() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { full_name: string; email: string; role: Role }) =>
      api.post<UserInvitation>("/users", body),
    onSuccess: () => refresh("users", "invitations"),
  });
}

// Company admins only.
export const usePendingInvitations = (enabled = true) =>
  useQuery({ queryKey: ["invitations"], queryFn: () => api.get<PendingInvitation[]>("/users/invitations"), enabled });

export function useResendInvitation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.post<UserInvitation>(`/users/invitations/${id}/resend`),
    onSuccess: () => refresh("invitations"),
  });
}

export function useRevokeInvitation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.del(`/users/invitations/${id}`),
    onSuccess: () => refresh("invitations"),
  });
}
```

## `src/lib/schemas.ts`: form rules (Zod)

```ts
// Zod: describe what valid data looks like; it checks values and gives error messages.
// The SECOND argument of each rule is the message shown under the input.
// Remember: the backend checks everything again. These rules are for instant feedback.
import { z } from "zod";

// Login: a valid email and a non-empty password.
export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

// Register: same limits as the backend's RegisterRequest.
export const registerSchema = z.object({
  company_name: z.string().min(1, "Enter your company name").max(100),
  full_name: z.string().min(1, "Enter your name").max(100),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

// Accept invite: password + confirmation. .refine() = a custom rule across fields.
// path: ["confirm_password"] = show the message under the confirm field.
export const acceptInvitationSchema = z.object({
  password: z.string().min(8, "Use at least 8 characters").max(128),
  confirm_password: z.string(),
}).refine((values) => values.password === values.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

// current_password is only required when the account already has one (see the account page).
export const changePasswordSchema = z.object({
  current_password: z.string().max(128).optional(),
  password: z.string().min(8, "Use at least 8 characters").max(128),
  confirm_password: z.string(),
}).refine((values) => values.password === values.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

// Job form. Salaries come from <input> as TEXT, so check with a regex: /^\d+$/ = digits only.
// "!value ||" = empty is fine (optional).
export const jobSchema = z.object({
  title: z.string().min(1, "Enter a job title").max(200),
  description: z.string().min(1, "Describe the role").max(10000),
  qualification_requirements: z.string().max(5000),
  salary_min: z.string().optional().refine((value) => !value || /^\d+$/.test(value), "Enter a whole number"),
  salary_max: z.string().optional().refine((value) => !value || /^\d+$/.test(value), "Enter a whole number"),
  status: z.enum(["draft", "open", "closed"]),
}).refine((values) => !values.salary_min || !values.salary_max || Number(values.salary_min) <= Number(values.salary_max), {
  message: "Minimum salary cannot exceed maximum salary",
  path: ["salary_max"],
});

// The public apply form.
export const applySchema = z.object({
  full_name: z.string().min(1, "Enter your name").max(100),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(5, "Enter a phone number").max(30),
  candidate_qualifications: z.string().min(1, "Describe your relevant qualifications").max(5000),
  expected_salary: z.string().optional().refine((value) => !value || /^\d+$/.test(value), "Enter a whole number"),
  cover_letter: z.string().max(5000).optional(),
});

// Invite a teammate (admins can only invite these two roles).
export const userSchema = z.object({
  full_name: z.string().min(1, "Enter a name").max(100),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["hiring_manager", "interviewer"]),
});

// Assign an interviewer: one must be chosen.
export const assignInterviewerSchema = z.object({
  interviewer_id: z.string().min(1, "Choose an interviewer"),
});

// Schedule an interview.
export const scheduleSchema = z.object({
  // Must be in the future (the backend also refuses past times).
  starts_at: z
    .string()
    .min(1, "Choose a date and time")
    .refine((value) => new Date(value).getTime() > Date.now(), "Choose a time in the future"),
  meeting_type: z.enum(["virtual", "in_person"]),
  // A valid URL, OR an empty string (when the meeting is in person).
  meeting_url: z.string().url("Enter a valid meeting link").optional().or(z.literal("")),
  location: z.string().max(500).optional(),
  duration_minutes: z
    .number({ invalid_type_error: "Enter the length in minutes" })
    .int()
    .min(15, "At least 15 minutes")
    .max(240, "At most 240 minutes"),
// Two cross-field rules: a link for video calls, a place for in-person meetings.
}).refine((values) => values.meeting_type !== "virtual" || Boolean(values.meeting_url), {
  message: "Enter the Meet or Zoom link",
  path: ["meeting_url"],
}).refine((values) => values.meeting_type !== "in_person" || Boolean(values.location), {
  message: "Enter the meeting location",
  path: ["location"],
});

// The scorecard form: a recommendation and 1-20 criteria, each rated 1-5.
// (The form starts ratings at 0, so "Choose a rating" appears until one is picked.)
export const scorecardSchema = z.object({
  recommendation: z.enum(["recommend", "maybe", "not_recommend"]),
  ratings: z
    .array(
      z.object({
        criterion: z.string().min(1, "Name the criterion").max(100),
        rating: z.number().int().min(1, "Choose a rating").max(5),
        comment: z.string().max(1000).optional(),
      }),
    )
    .min(1, "Add at least one criterion")
    .max(20),
});

// File limits, shared by the apply page.
export const CV_EXTENSIONS = [".pdf", ".doc", ".docx"];
export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENTS = 6;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"];

// Check a CV before uploading. Returns an error message, or null if fine.
export function checkCv(file: File): string | null {
  const name = file.name.toLowerCase();
  // .some() = true if ANY extension matches the end of the name.
  if (!CV_EXTENSIONS.some((ext) => name.endsWith(ext))) return "The CV must be a PDF, DOC or DOCX file";
  if (file.size > CV_MAX_BYTES) return "The CV must be 5 MB or smaller";
  return null;
}

export function checkSupportingDocument(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!DOCUMENT_EXTENSIONS.some((ext) => name.endsWith(ext))) return "Use PDF, DOC, DOCX, PNG or JPG files";
  if (file.size > DOCUMENT_MAX_BYTES) return "Each supporting document must be 10 MB or smaller";
  return null;
}
```

## `src/lib/constants.ts`

```ts
import type { Recommendation, Role, Stage } from "./types";

// Every stage, in pipeline order (for filters and board columns).
export const PIPELINE: Stage[] = ["applied", "screen", "interview", "offer", "hired", "rejected"];

// The stages a candidate moves through before a final decision.
export const MAIN_STAGES: Stage[] = ["applied", "screen", "interview", "offer"];

// The stage endpoint only accepts these. Hired and rejected go through the decision endpoint.
export const MOVABLE_STAGES: Stage[] = ["screen", "interview", "offer"];

// Human-readable labels. Record<Stage, string> forces an entry for EVERY stage:
// forget one and TypeScript reports an error.
export const STAGE_LABEL: Record<Stage, string> = {
  applied: "Applied",
  screen: "Screen",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

// Each stage's colour, pointing at CSS variables defined in globals.css.
export const STAGE_COLOR: Record<Stage, string> = {
  applied: "var(--stage-applied)",
  screen: "var(--stage-screen)",
  interview: "var(--stage-interview)",
  offer: "var(--stage-offer)",
  hired: "var(--stage-hired)",
  rejected: "var(--stage-rejected)",
};

// Is this a final stage?
export function isFinal(stage: Stage) {
  return stage === "hired" || stage === "rejected";
}

export const ROLE_LABEL: Record<Role, string> = {
  company_admin: "Company admin",
  hiring_manager: "Hiring manager",
  interviewer: "Interviewer",
};

// Where each role lands after signing in: everyone starts on their own dashboard.
export const HOME: Record<Role, string> = {
  company_admin: "/overview",
  hiring_manager: "/overview",
  interviewer: "/overview",
};

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  recommend: "Recommend",
  maybe: "Maybe",
  not_recommend: "Do not recommend",
};
```

The supporting-document limit (`MAX_DOCUMENTS = 6`) lives in `lib/schemas.ts`, next to the upload checks that use it.
