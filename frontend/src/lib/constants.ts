import type { InterviewStatus, Recommendation, Role, Stage } from "./types";

export const STAGES: Stage[] = ["applied", "screen", "interview", "offer", "hired", "rejected"];

// The stages a candidate passes through before the final decision.
export const MAIN_STAGES: Stage[] = ["applied", "screen", "interview", "offer"];

export const STAGE_LABEL: Record<Stage, string> = {
  applied: "Applied",
  screen: "Screen",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export const STAGE_COLOR: Record<Stage, string> = {
  applied: "var(--stage-applied)",
  screen: "var(--stage-screen)",
  interview: "var(--stage-interview)",
  offer: "var(--stage-offer)",
  hired: "var(--stage-hired)",
  rejected: "var(--stage-rejected)",
};

// The backend only lets a candidate move one step forward at a time.
export const NEXT_STAGE: Partial<Record<Stage, Stage>> = {
  applied: "screen",
  screen: "interview",
  interview: "offer",
};

export const isFinal = (stage: Stage) => stage === "hired" || stage === "rejected";

export const ROLE_LABEL: Record<Role, string> = {
  company_admin: "Company admin",
  hiring_manager: "Hiring manager",
  interviewer: "Interviewer",
};

// Where each role lands after signing in.
export const HOME: Record<Role, string> = {
  company_admin: "/team",
  hiring_manager: "/jobs",
  interviewer: "/interviews",
};

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  recommend: "Recommend",
  maybe: "Maybe",
  not_recommend: "Do not recommend",
};

// Used to sort candidates by the interviewers' decision.
export const RECOMMENDATION_RANK: Record<Recommendation, number> = {
  recommend: 2,
  maybe: 1,
  not_recommend: 0,
};

export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  assigned: "Waiting for a date",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const MAX_DOCUMENTS = 6;