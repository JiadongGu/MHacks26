// Pure helpers for the "Today's plan" card. No I/O, so vitest can test them.

export type PlanLoad = "light" | "normal" | "packed";

export type PlanItem = {
  key: string;
  title: string;
  /** ISO 8601 with an offset. */
  start: string;
  end: string;
  why: string;
  /** Set when the item was written to the Pulse Health calendar. */
  event_id?: string;
  /** True once the person ticked it off. */
  done?: boolean;
};

export type PlanView = {
  day: string;
  load: PlanLoad;
  headline: string;
  /** "HH:MM" for the night that ends the planned day. */
  bed_time: string | null;
  wake_time: string | null;
  items: PlanItem[];
};

export type ItemState = "done" | "now" | "upcoming";

const HEADLINE: Record<PlanLoad, string> = {
  light: "Today looks open.",
  normal: "Today is a steady day.",
  packed: "Today is a busy one with few gaps.",
};

/** The card words the headline itself, so a plan made last night does not say "tomorrow" on the day. */
export function planHeadline(load: PlanLoad, when: "today" | "tomorrow" = "today"): string {
  const text = HEADLINE[load] ?? HEADLINE.normal;
  return when === "today" ? text : text.replace(/^Today/, "Tomorrow");
}

const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Keeps the well-formed items of the stored JSON, soonest first. Never throws on odd data. */
export function parseItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (!isString(o.key) || !isString(o.title) || !isString(o.start) || !isString(o.end)) continue;
    if (Number.isNaN(new Date(o.start).getTime()) || Number.isNaN(new Date(o.end).getTime())) continue;
    out.push({
      key: o.key,
      title: o.title,
      start: o.start,
      end: o.end,
      why: typeof o.why === "string" ? o.why : "",
      event_id: isString(o.event_id) ? o.event_id : undefined,
      done: o.done === true ? true : undefined,
    });
  }
  return out.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function clock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone })
    .format(new Date(iso))
    .replace(/ /g, " ");
}

/** "12:00 to 12:20 PM", or "11:40 AM to 12:10 PM" when the item crosses noon. */
export function timeRange(startIso: string, endIso: string, timeZone: string): string {
  const start = clock(startIso, timeZone);
  const end = clock(endIso, timeZone);
  const sameHalf = start.split(" ")[1] === end.split(" ")[1];
  return `${sameHalf ? start.split(" ")[0] : start} to ${end}`;
}

/** "00:00" becomes "12:00 am", "22:30" becomes "10:30 pm". Anything else gives null. */
export function bedtimeLabel(hhmm: string | null): string | null {
  const m = hhmm?.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
}

export function itemState(item: PlanItem, now: Date): ItemState {
  const t = now.getTime();
  if (new Date(item.end).getTime() <= t) return "done";
  return new Date(item.start).getTime() <= t ? "now" : "upcoming";
}

export function onCalendar(items: PlanItem[]): boolean {
  return items.some((i) => i.event_id !== undefined);
}
