// Browser helpers. They call the same-origin proxy at /api/agent and the small readers at /api/me.
// The proxy adds the session user id. A path segment "me" becomes that id. Never send a user id from here.

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** True when the agent has no such route (FastAPI answers 404 "Not Found"). */
export function isEndpointMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && err.message === "Not Found";
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.detail === "string") return o.detail;
    if (Array.isArray(o.detail) && o.detail.length > 0) {
      const first = o.detail[0] as { msg?: unknown; loc?: unknown };
      const where = Array.isArray(first.loc) ? first.loc.slice(1).join(".") : "";
      const msg = typeof first.msg === "string" ? first.msg : fallback;
      return where ? `${where}: ${msg}` : msg;
    }
    if (typeof o.error === "string") return o.error;
  }
  return fallback;
}

type Init = { method?: string; body?: unknown; signal?: AbortSignal };

async function request<T>(url: string, init: Init = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
    cache: "no-store",
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, messageFrom(parsed, `Request failed (${res.status}).`));
  }
  return parsed as T;
}

/** Calls the agent through the proxy. `path` starts with a slash, for example "/goals". */
export function agent<T>(path: string, init?: Init): Promise<T> {
  return request<T>(`/api/agent${path}`, init);
}

/** Calls a route handler in this app under /api/me. */
export function me<T>(path: string, init?: Init): Promise<T> {
  return request<T>(`/api/me${path}`, init);
}

/** Text for a toast or an inline error. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (isEndpointMissing(err)) return "This endpoint is not deployed yet.";
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
