import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  Application,
  ApplicationScorecards,
  Company,
  Interview,
  Job,
  JobStatus,
  ProgressReport,
  Role,
  Scorecard,
  Stage,
  StageHistory,
  User,
  UserInvitation,
  Recommendation,
} from "./types";

// ---- Reading data ----

export const useCompany = () => useQuery({ queryKey: ["company"], queryFn: () => api.get<Company>("/companies/me") });

export const useJobs = (enabled = true) =>
  useQuery({ queryKey: ["jobs"], queryFn: () => api.get<Job[]>("/jobs"), enabled });

export const useJob = (jobId: string) =>
  useQuery({ queryKey: ["jobs", jobId], queryFn: () => api.get<Job>(`/jobs/${jobId}`) });

// Managers and admins only.
export const useUsers = (enabled = true, role?: Role) =>
  useQuery({
    queryKey: ["users", role ?? "all"],
    queryFn: () => api.get<User[]>(role ? `/users?role=${role}` : "/users"),
    enabled,
  });

export const useApplications = (
  jobId?: string,
  sortBy = "created_at",
  sortOrder: "asc" | "desc" = "desc",
  enabled = true,
) =>
  useQuery({
    queryKey: ["applications", jobId ?? "all", sortBy, sortOrder],
    queryFn: () => api.get<Application[]>(`/applications?limit=200&sort_by=${sortBy}&sort_order=${sortOrder}${jobId ? `&job_id=${jobId}` : ""}`),
    enabled,
  });

export const useApplication = (id: string) =>
  useQuery({ queryKey: ["application", id], queryFn: () => api.get<Application>(`/applications/${id}`) });

export const useHistory = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["history", id],
    queryFn: () => api.get<StageHistory[]>(`/applications/${id}/history`),
    enabled,
  });

export const useInterviews = (applicationId?: string, enabled = true) =>
  useQuery({
    queryKey: ["interviews", applicationId ?? "all"],
    queryFn: () => api.get<Interview[]>(applicationId ? `/interviews?application_id=${applicationId}` : "/interviews"),
    enabled,
  });

export const useScorecards = (applicationId: string) =>
  useQuery({
    queryKey: ["scorecards", applicationId],
    queryFn: () => api.get<ApplicationScorecards>(`/applications/${applicationId}/scorecards`),
  });

// Company admins only.
export const useProgressReport = (days: number, enabled = true) =>
  useQuery({
    queryKey: ["progress-report", days],
    queryFn: () => api.get<ProgressReport>(`/reports/progress?days=${days}`),
    enabled,
    // Keep showing the previous period while the new one loads, so the page does not jump.
    placeholderData: keepPreviousData,
  });

// ---- Changing data ----

export function useEmailProgressReport() {
  return useMutation({
    mutationFn: (days: number) => api.post<{ sent_to: string[] }>(`/reports/progress/email?days=${days}`),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password?: string; password: string }) => api.put<User>("/auth/password", body),
  });
}

// Any change to a candidate can affect many screens, so these refresh the related lists.
function useRefresh() {
  const queryClient = useQueryClient();
  return (...keys: string[]) => keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}

export function useCreateJob() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { title: string; description: string; qualification_requirements: string; salary_min?: number; salary_max?: number }) =>
      api.post<Job>("/jobs", body),
    onSuccess: () => refresh("jobs"),
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

export function useMoveStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) =>
      api.patch<Application>(`/applications/${id}/stage`, { stage }),
    // Update the board right away, then roll back if the server refuses (for example, a skipped stage).
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ["applications"] });
      const previous = queryClient.getQueriesData<Application[]>({ queryKey: ["applications"] });
      queryClient.setQueriesData<Application[]>({ queryKey: ["applications"] }, (list) =>
        list?.map((item) => (item.id === id ? { ...item, stage } : item)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data)),
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["application", id] });
      queryClient.invalidateQueries({ queryKey: ["history", id] });
    },
  });
}

export function useDecide() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "hired" | "rejected" }) =>
      api.post<Application>(`/applications/${id}/decision`, { decision }),
    onSuccess: () => refresh("applications", "application", "history"),
  });
}

export function useScheduleInterview() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ interviewId, ...body }: { interviewId: string; starts_at: string; duration_minutes: number; meeting_type: "virtual" | "in_person"; meeting_url?: string; location?: string }) =>
      api.patch<Interview>(`/interviews/${interviewId}/schedule`, body),
    onSuccess: () => refresh("interviews", "scorecards", "applications"),
  });
}

export function useAssignInterviewer() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { application_id: string; interviewer_id: string }) => api.post<Interview>("/interviews", body),
    onSuccess: () => refresh("interviews", "scorecards", "applications"),
  });
}

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

export function useCreateUser() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { full_name: string; email: string; role: Role }) =>
      api.post<UserInvitation>("/users", body),
    onSuccess: () => refresh("users"),
  });
}
