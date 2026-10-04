// Date and text helpers. Pure code.

/** "3 min ago", "2 h ago", "4 d ago". `now` is a parameter so tests can fix it. */
export function timeAgo(value: Date | string | number, now: Date = new Date()): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "unknown";
  const sec = Math.round((now.getTime() - then) / 1000);
  if (sec < 0) return "just now";
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Server renders run in UTC on Vercel; format there in the demo's local zone unless the caller passes one. */
export const SERVER_TIME_ZONE = "America/Detroit";

function zoneFor(timeZone?: string): string | undefined {
  return timeZone ?? (typeof window === "undefined" ? SERVER_TIME_ZONE : undefined);
}

export function formatDateTime(value: Date | string, timeZone?: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "unknown";
  timeZone = zoneFor(timeZone);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatDate(value: Date | string, timeZone?: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: zoneFor(timeZone) });
}

/** Whole years from a YYYY-MM-DD birth date to a YYYY-MM-DD day, or null for a bad date. */
export function ageOn(dob: string | null | undefined, day: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? "");
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!b || !t) return null;
  const years = Number(t[1]) - Number(b[1]);
  const age = Number(t[2]) * 100 + Number(t[3]) < Number(b[2]) * 100 + Number(b[3]) ? years - 1 : years;
  return age >= 0 ? age : null;
}

/** "possibly_ill" becomes "Possibly ill". */
export function humanize(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
