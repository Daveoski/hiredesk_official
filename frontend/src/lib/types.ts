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
}

export interface UserInvitation {
  email: string;
  full_name: string;
  role: Role;
  expires_at: string;
  invite_url: string;
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

export interface ApplicationScorecards {
  aggregate_score: number | null;
  scorecards: Scorecard[];
}
