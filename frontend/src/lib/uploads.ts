import { api, ApiError } from "./api";

interface SignedUpload {
  upload_url: string;
  public_id: string;
  fields: Record<string, string>;
}

// Sends a file straight from the browser to file storage (Cloudinary), so large CVs never
// pass through the API, whose host limits request bodies to 4.5 MB.
// Returns the public id to send with the application; the API checks the file again.
export async function uploadDirect(jobId: string, kind: "cv" | "document", file: File): Promise<string> {
  const signed = await api.post<SignedUpload>(`/public/jobs/${jobId}/uploads`, {
    kind,
    filename: file.name,
    size: file.size,
  });

  const form = new FormData();
  Object.entries(signed.fields).forEach(([key, value]) => form.append(key, value));
  form.append("file", file);

  let response: Response;
  try {
    response = await fetch(signed.upload_url, { method: "POST", body: form });
  } catch {
    throw new ApiError(`Could not upload ${file.name}. Check your connection and try again.`, 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(body?.error?.message ?? `Could not upload ${file.name}`, response.status);
  }
  return signed.public_id;
}
