// Quiet hours live in profiles.quiet_hours as {start, end}, both "HH:MM" in 24 h time.
// The window may cross midnight, so end can be earlier than start.

export type QuietHours = { start: string; end: string };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHHMM(value: unknown): value is string {
  return typeof value === "string" && HHMM.test(value);
}

/** Minutes since midnight for an "HH:MM" string. */
export function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export type QuietHoursCheck =
  | { ok: true; value: QuietHours | null }
  | { ok: false; error: string };

/**
 * Validates a quiet hours input.
 * Two empty values turn quiet hours off. One empty value is an error.
 * A window that starts and ends at the same time is an error.
 */
export function validateQuietHours(start: unknown, end: unknown): QuietHoursCheck {
  const s = typeof start === "string" ? start.trim() : "";
  const e = typeof end === "string" ? end.trim() : "";
  if (s === "" && e === "") return { ok: true, value: null };
  if (s === "" || e === "") return { ok: false, error: "Set both a start and an end time." };
  if (!isHHMM(s) || !isHHMM(e)) return { ok: false, error: "Use the 24 hour format HH:MM." };
  if (s === e) return { ok: false, error: "Start and end must differ." };
  return { ok: true, value: { start: s, end: e } };
}

/** Length of the window in minutes. Handles a window that crosses midnight. */
export function quietWindowMinutes(q: QuietHours): number {
  const diff = toMinutes(q.end) - toMinutes(q.start);
  return diff > 0 ? diff : diff + 24 * 60;
}

/** Reads the jsonb value from the database. Returns null when the shape is wrong. */
export function parseQuietHours(raw: unknown): QuietHours | null {
  if (raw === null || typeof raw !== "object") return null;
  const { start, end } = raw as Record<string, unknown>;
  const s = typeof start === "string" ? start.slice(0, 5) : "";
  const e = typeof end === "string" ? end.slice(0, 5) : "";
  return isHHMM(s) && isHHMM(e) ? { start: s, end: e } : null;
}
