// Pure helpers for the /api/agent proxy. They have no I/O, so vitest can test them.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ME_SEGMENT = "me";

export type PathCheck =
  | { ok: true; path: string }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Builds the agent path from the catch-all segments.
 * It rejects dot segments. It rejects a path segment that holds another user's uuid.
 * The literal segment "me" becomes the session user id. The browser never learns the uuid.
 */
export function buildAgentPath(segments: string[], userId: string): PathCheck {
  if (segments.length === 0) {
    return { ok: false, status: 400, error: "Missing path." };
  }
  for (const raw of segments) {
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return { ok: false, status: 400, error: "Bad path encoding." };
    }
    if (seg === "" || seg === "." || seg === ".." || /[/\\]/.test(seg)) {
      return { ok: false, status: 400, error: "Bad path segment." };
    }
    if (UUID_RE.test(seg) && seg.toLowerCase() !== userId.toLowerCase()) {
      return { ok: false, status: 403, error: "Path user does not match session." };
    }
  }
  const out = segments.map((raw) => (raw === ME_SEGMENT ? userId : raw));
  return { ok: true, path: "/" + out.map(encodeURIComponent).join("/") };
}

/** Copies the query string. It drops any client user_id and sets the session user id. */
export function withUserQuery(search: URLSearchParams, userId: string): URLSearchParams {
  const out = new URLSearchParams(search);
  out.delete("user_id");
  out.set("user_id", userId);
  return out;
}

/** Sets user_id in a JSON body. It overwrites any client value. Returns null if the body is not an object. */
export function withUserBody(raw: string, userId: string): Record<string, unknown> | null {
  if (raw.trim() === "") return { user_id: userId };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return { ...(parsed as Record<string, unknown>), user_id: userId };
}
