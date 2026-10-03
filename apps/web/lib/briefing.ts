// Pure helpers for the morning briefing card and its audio route. No I/O, so vitest can test them.

export const DEFAULT_TIMEZONE = "America/Detroit";

/** The local calendar day (YYYY-MM-DD) in a time zone. An unknown zone falls back to the default zone. */
export function localDay(timeZone: string | null | undefined, now: Date = new Date()): string {
  for (const zone of [timeZone, DEFAULT_TIMEZONE]) {
    if (!zone) continue;
    try {
      // The en-CA locale prints dates as YYYY-MM-DD.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      continue;
    }
  }
  return now.toISOString().slice(0, 10);
}

export type ByteRange = { start: number; end: number };

/**
 * Reads a single "bytes=a-b" Range header for a body of `size` bytes.
 * Returns null when there is no header, "invalid" when the range cannot be served.
 * Safari asks for ranges before it plays audio, so the audio route answers them.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "") || size <= 0) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

/** Text for the user when the audio route fails. */
export function audioErrorText(status: number | null): string {
  if (status === 404) return "There is no briefing to read yet. Generate one first.";
  if (status === 503) return "The voice service is unavailable. Try again in a moment.";
  if (status === 401) return "Your session ended. Sign in again.";
  return "Could not play the briefing. Try again.";
}
