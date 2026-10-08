import { useAuthStore } from "@/stores/auth-store";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// FastAPI sends errors as { detail: "text" } or { detail: [{ loc, msg }, ...] }.
function errorMessage(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: (string | number)[]; msg?: string };
    const field = first.loc?.[first.loc.length - 1];
    return field ? `${field}: ${first.msg}` : (first.msg ?? fallback);
  }
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  const token = useAuthStore.getState().token;
  if (auth && token) headers.set("Authorization", `Bearer ${token}`);
  // Do not set Content-Type for FormData: the browser adds the multipart boundary itself.
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Cannot reach the server. Check that the backend is running.", 0);
  }

  if (response.status === 401 && auth) {
    useAuthStore.getState().logout();
    if (typeof window !== "undefined") window.location.href = "/login";
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(errorMessage(body, "Something went wrong"), response.status);
  return body as T;
}

export const api = {
  get: <T>(path: string, auth = true) => request<T>(path, {}, auth),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  // Public endpoints and the login form send form data and need no token.
  postForm: <T>(path: string, form: FormData | URLSearchParams, auth = false) =>
    request<T>(
      path,
      {
        method: "POST",
        body: form,
        headers: form instanceof URLSearchParams ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      },
      auth,
    ),
};
