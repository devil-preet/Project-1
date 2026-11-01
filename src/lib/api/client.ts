export type ApiResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

/** Browser-side JSON POST carrying the headers our CSRF checks require. */
export async function postJson<T extends object = object>(
  url: string,
  body: unknown = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

/** Only same-site relative paths may be used as post-login destinations (open-redirect guard). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

/** Browser-side multipart POST (file upload). Content-Type is left to the browser (boundary). */
export async function postForm<T extends object = object>(url: string, form: FormData): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Requested-With": "fetch" },
      body: form,
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}
