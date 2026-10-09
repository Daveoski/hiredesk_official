import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z.object({
  company_name: z.string().min(1, "Enter your company name").max(100),
  full_name: z.string().min(1, "Enter your name").max(100),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

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

export const applySchema = z.object({
  full_name: z.string().min(1, "Enter your name").max(100),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(5, "Enter a phone number").max(30),
  candidate_qualifications: z.string().min(1, "Describe your relevant qualifications").max(5000),
  expected_salary: z.string().optional().refine((value) => !value || /^\d+$/.test(value), "Enter a whole number"),
  cover_letter: z.string().max(5000).optional(),
});

export const userSchema = z.object({
  full_name: z.string().min(1, "Enter a name").max(100),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["hiring_manager", "interviewer"]),
});

export const assignInterviewerSchema = z.object({
  interviewer_id: z.string().min(1, "Choose an interviewer"),
});

export const scheduleSchema = z.object({
  starts_at: z.string().min(1, "Choose a date and time"),
  meeting_type: z.enum(["virtual", "in_person"]),
  meeting_url: z.string().url("Enter a valid meeting link").optional().or(z.literal("")),
  location: z.string().max(500).optional(),
  duration_minutes: z
    .number({ invalid_type_error: "Enter the length in minutes" })
    .int()
    .min(15, "At least 15 minutes")
    .max(240, "At most 240 minutes"),
}).refine((values) => values.meeting_type !== "virtual" || Boolean(values.meeting_url), {
  message: "Enter the Meet or Zoom link",
  path: ["meeting_url"],
}).refine((values) => values.meeting_type !== "in_person" || Boolean(values.location), {
  message: "Enter the meeting location",
  path: ["location"],
});

export const assessmentSchema = z.object({
  match_score: z.number().int().min(0).max(100).nullable(),
  manager_notes: z.string().max(5000),
});

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

export const CV_EXTENSIONS = [".pdf", ".doc", ".docx"];
export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENTS = 6;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"];

export function checkCv(file: File): string | null {
  const name = file.name.toLowerCase();
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
