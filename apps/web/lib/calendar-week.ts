// Pure helpers for the /calendar page: week math in the user's time zone, block layout, status labels.
// No I/O, so vitest can test them. A "day" is a local date string, YYYY-MM-DD.
import { DEFAULT_TIMEZONE } from "@/lib/briefing";
import { humanize } from "@/lib/format";
import type { PlanItem } from "@/lib/plan";
import { isValidTimeZone } from "@/lib/profile";

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(day: string): { y: number; m: number; d: number } | null {
  const match = DAY_RE.exec(day);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

function dayString(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${mm}-${dd}`;
}

/** Adds whole days to a local date string. Calendar arithmetic only, so it ignores DST. */
export function addDays(day: string, n: number): string {
  const p = parseDay(day);
  if (!p) return day;
  return dayString(Date.UTC(p.y, p.m - 1, p.d + n));
}

/** The Monday of the week that holds `day`. A bad input comes back unchanged. */
export function mondayOf(day: string): string {
  const p = parseDay(day);
  if (!p) return day;
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

/** The profile zone when it is a real IANA zone, otherwise America/Detroit. */
export function zoneOrDefault(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

/** The local date of an instant in a time zone. */
export function localDay(value: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The week to show: the Monday from `?week=`, or the Monday of today when the value is missing or bad. */
export function resolveWeek(param: string | undefined, today: string): string {
  return param && parseDay(param) ? mondayOf(param) : mondayOf(today);
}

/** Monday to Sunday of the week that starts on `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant a local day starts in a time zone. Handles days with a DST change. */
export function startOfDay(day: string, timeZone: string): Date {
  const p = parseDay(day);
  if (!p) return new Date(NaN);
  const wall = Date.UTC(p.y, p.m - 1, p.d);
  const first = wall - offsetMs(wall, timeZone);
  return new Date(wall - offsetMs(first, timeZone));
}

/** The UTC range [from, to) that covers the week that starts on `monday`. */
export function weekRange(monday: string, timeZone: string): { from: Date; to: Date } {
  return { from: startOfDay(monday, timeZone), to: startOfDay(addDays(monday, 7), timeZone) };
}

/** "Oct 5 to Oct 11, 2026". The year shows once, or twice when the week crosses New Year. */
export function weekLabel(monday: string): string {
  const fmt = (day: string, withYear: boolean) => {
    const p = parseDay(day);
    if (!p) return day;
    return new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: withYear ? "numeric" : undefined,
      timeZone: "UTC",
    });
  };
  const sunday = addDays(monday, 6);
  const crosses = monday.slice(0, 4) !== sunday.slice(0, 4);
  return `${fmt(monday, crosses)} to ${fmt(sunday, true)}`;
}

/** "Mon" and "5" for a column heading. */
export function dayHeading(day: string): { weekday: string; date: string; long: string } {
  const p = parseDay(day);
  if (!p) return { weekday: day, date: "", long: day };
  const at = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return {
    weekday: at.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    date: String(p.d),
    long: at.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }),
  };
}

// ---------------------------------------------------------------- blocks

export type BlockKind = "own" | "pulse" | "plan" | "pending";

export type WeekBlock = {
  key: string;
  kind: BlockKind;
  title: string;
  /** ISO strings. The full span of the event, not clipped to the day. */
  start: string;
  end: string;
  important: boolean;
  /** True on a day after the one the block starts on. */
  continued: boolean;
  /** Short text under the title, for example "Waiting for your YES". */
  note: string;
  proposalId?: string;
};

export type WeekEventInput = { event_id: string; title: string; starts_at: string; ends_at: string; is_important: boolean };
export type WeekProposalInput = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  google_event_id: string | null;
};
export type WeekPlanInput = { day: string; items: PlanItem[] };

type RawBlock = Omit<WeekBlock, "continued">;

/**
 * Puts every block on each local day it touches and sorts each day by start time.
 * A cached event is dropped when a Pulse block already stands for the same Google event id.
 */
export function buildWeek(input: {
  monday: string;
  timeZone: string;
  events: WeekEventInput[];
  proposals: WeekProposalInput[];
  plans: WeekPlanInput[];
}): { day: string; blocks: WeekBlock[] }[] {
  const { monday, timeZone } = input;
  const pulseIds = new Set<string>();
  for (const p of input.proposals) if (p.google_event_id) pulseIds.add(p.google_event_id);
  for (const plan of input.plans) for (const i of plan.items) if (i.event_id) pulseIds.add(i.event_id);

  const raw: RawBlock[] = [];
  for (const e of input.events) {
    if (pulseIds.has(e.event_id)) continue;
    raw.push({
      key: `event-${e.event_id}`,
      kind: "own",
      title: e.title,
      start: e.starts_at,
      end: e.ends_at,
      important: e.is_important,
      note: e.is_important ? "Important" : "",
    });
  }
  for (const p of input.proposals) {
    if (p.status === "pending") {
      raw.push({
        key: `proposal-${p.id}`,
        kind: "pending",
        title: p.title,
        start: p.starts_at,
        end: p.ends_at,
        important: false,
        note: "Waiting for your YES",
        proposalId: p.id,
      });
    } else if (p.status === "applied" || p.status === "approved") {
      raw.push({
        key: `proposal-${p.id}`,
        kind: "pulse",
        title: p.title,
        start: p.starts_at,
        end: p.ends_at,
        important: false,
        note: p.status === "applied" ? "Pulse Health" : "Pulse Health, adding now",
        proposalId: p.id,
      });
    }
  }
  for (const plan of input.plans) {
    for (const i of plan.items) {
      raw.push({
        key: `plan-${plan.day}-${i.key}-${i.start}`,
        kind: "plan",
        title: i.title,
        start: i.start,
        end: i.end,
        important: false,
        note: "Pulse plan",
      });
    }
  }

  return weekDays(monday).map((day) => {
    const blocks: WeekBlock[] = [];
    for (const b of raw) {
      const startMs = new Date(b.start).getTime();
      const endMs = new Date(b.end).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
      const startDay = localDay(b.start, timeZone);
      // An event that ends at midnight sharp belongs to the day before.
      const endDay = localDay(new Date(Math.max(startMs, endMs - 1)), timeZone);
      if (day < startDay || day > endDay) continue;
      blocks.push({ ...b, continued: day !== startDay });
    }
    blocks.sort(
      (a, b) =>
        new Date(a.start).getTime() - new Date(b.start).getTime() ||
        new Date(a.end).getTime() - new Date(b.end).getTime(),
    );
    return { day, blocks };
  });
}

// ---------------------------------------------------------------- status

export type ProposalStatus = "pending" | "approved" | "applied" | "rejected" | "expired" | "failed";

const STATUS: Record<ProposalStatus, { label: string; meaning: string }> = {
  pending: { label: "Pending", meaning: "Waiting for your YES." },
  approved: { label: "Approved", meaning: "You said yes. Pulse is adding it to your calendar." },
  applied: { label: "Applied", meaning: "It is on your calendar." },
  rejected: { label: "Rejected", meaning: "You said no. Nothing changed." },
  expired: { label: "Expired", meaning: "No answer in time. Nothing changed." },
  failed: { label: "Failed", meaning: "You said yes, but the calendar write failed." },
};

export function isProposalStatus(value: string): value is ProposalStatus {
  return value in STATUS;
}

/** "applied" becomes "Applied". An unknown status is humanized, never hidden. */
export function statusLabel(status: string): string {
  return isProposalStatus(status) ? STATUS[status].label : humanize(status);
}

export function statusMeaning(status: string): string {
  return isProposalStatus(status) ? STATUS[status].meaning : "";
}

export function isDecidable(status: string): boolean {
  return status === "pending";
}
