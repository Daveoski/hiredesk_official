import type { Role, Stage } from "./types";

export const PIPELINE: Stage[] = ["applied", "screen", "interview", "offer", "hired", "rejected"];

// The stages a candidate moves through before a final decision.
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

export const ROLE_LABEL: Record<Role, string> = {
  company_admin: "Company admin",
  hiring_manager: "Hiring manager",
  interviewer: "Interviewer",
};

// The stage endpoint only accepts these. Hired and rejected go through the decision endpoint.
export const MOVABLE_STAGES: Stage[] = ["screen", "interview", "offer"];

export function isFinal(stage: Stage) {
  return stage === "hired" || stage === "rejected";
}
