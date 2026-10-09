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
  const sendsToken = auth && !!token;
  if (sendsToken) headers.set("Authorization", `Bearer ${token}`);
  // Do not set Content-Type for FormData: the browser adds the multipart boundary itself.
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Cannot reach the server. Check that the backend is running.", 0);
  }

  // Only an expired session sends the user back to /login. A 401 from a sign-in attempt
  // (for example a rejected Google token) stays on the page so its message can be shown.
  if (response.status === 401 && sendsToken) {
    useAuthStore.getState().logout();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      // Come back to the same page after signing in again.
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?expired=1&next=${next}`;
    }
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
  del: <T = null>(path: string) => request<T>(path, { method: "DELETE" }),
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
