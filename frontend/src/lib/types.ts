// These types mirror the backend response schemas.

export type Role = "company_admin" | "hiring_manager" | "interviewer";
export type Stage = "applied" | "screen" | "interview" | "offer" | "hired" | "rejected";
export type JobStatus = "draft" | "open" | "closed";
export type InterviewStatus = "assigned" | "scheduled" | "completed" | "cancelled";
export type ScorecardStatus = "pending" | "submitted";
export type Recommendation = "recommend" | "maybe" | "not_recommend";

export interface User {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role: Role;
  password_login_enabled: boolean;
}

export interface UserInvitation {
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
  stages: Stage[];
}

export interface PublicJob {
  id: string;
  title: string;
  description: string;
  company_name: string;
  qualification_requirements: string;
  salary_min: number | null;
  salary_max: number | null;
}

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
  supporting_documents: { name: string; url: string }[];
  cover_letter: string | null;
  stage: Stage;
  created_at: string;
}

export interface StageHistory {
  id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  changed_by_id: string | null;
  changed_at: string;
}

export interface Interview {
  id: string;
  application_id: string;
  interviewer_id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: InterviewStatus;
  duration_minutes: number | null;
  meeting_type: "virtual" | "in_person" | null;
  meeting_url: string | null;
  location: string | null;
}

export interface Rating {
  criterion: string;
  rating: number;
  comment: string | null;
}

export interface Scorecard {
  id: string;
  interview_id: string;
  interviewer_id: string;
  status: ScorecardStatus;
  recommendation: Recommendation | null;
  submitted_at: string | null;
  ratings: Rating[];
  average_score: number | null;
}

// The company admin's progress report (GET /reports/progress).
export interface ProgressReport {
  company_name: string;
  generated_at: string;
  period_days: number;
  period_start: string;
  totals: {
    open_jobs: number;
    active_candidates: number;
    new_applications: number;
    hired: number;
    rejected: number;
    interviews_to_schedule: number;
    upcoming_interviews: number;
    scorecards_due: number;
  };
  pipeline: Record<Stage, number>;
  interviews_by_status: Record<InterviewStatus, number>;
  jobs: {
    id: string;
    title: string;
    status: JobStatus;
    hiring_manager_name: string | null;
    applicants: number;
    pipeline: Record<Stage, number>;
  }[];
  team: {
    id: string;
    full_name: string;
    role: Role;
    open_jobs: number;
    active_candidates: number;
    interviews_to_schedule: number;
    upcoming_interviews: number;
    scorecards_due: number;
    scorecards_submitted: number;
  }[];
  recent_activity: {
    application_id: string;
    candidate_name: string;
    job_title: string;
    from_stage: Stage | null;
    to_stage: Stage;
    changed_by_name: string | null;
    changed_at: string;
  }[];
  results: {
    application_id: string;
    candidate_name: string;
    job_title: string;
    outcome: Stage;
    decided_by_name: string | null;
    decided_at: string;
    match_score: number | null;
    interviewer_recommendation: Recommendation | null;
  }[];
  scorecards: {
    application_id: string;
    candidate_name: string;
    job_title: string;
    interviewer_name: string;
    recommendation: Recommendation | null;
    average_score: number | null;
    submitted_at: string;
  }[];
}

export interface ApplicationScorecards {
  aggregate_score: number | null;
  scorecards: Scorecard[];
}
