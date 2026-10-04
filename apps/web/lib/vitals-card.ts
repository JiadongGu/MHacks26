// View math for the vitals cards, the status hero and the dashboard header. Pure helpers, so vitest can test them.
import { addDays } from "@/lib/calendar-week";
import { CATEGORIES, signed, statusOf, statusVsPrevious, type Band, type Status, type Trend } from "@/lib/trends";
import { formatValue } from "@/lib/metrics";
import { RULE_KINDS, sourceLabel, type Explain } from "@/lib/explain";

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** `color` is for icons and chart lines. `ink` is the darker shade for text, which meets 4.5 to 1 on white. */
export const CATEGORY_COLORS: Record<CategoryId, { color: string; ink: string }> = {
  heart: { color: "#FF2D55", ink: "#D70040" },
  sleep: { color: "#5E5CE6", ink: "#5E5CE6" },
  activity: { color: "#FF9500", ink: "#A85A00" },
  respiratory: { color: "#32ADE6", ink: "#0B76A8" },
};

export function categoryOf(key: string): CategoryId {
  return CATEGORIES.find((c) => (c.metrics as readonly string[]).includes(key))?.id ?? "heart";
}

export type Tone = "normal" | "borderline" | "out";
export type CardStatus = { tone: Tone; word: "Normal" | "Borderline" | "Out of range"; direction: "above" | "below" | null };

export const TONE_WORD: Record<Tone, CardStatus["word"]> = {
  normal: "Normal",
  borderline: "Borderline",
  out: "Out of range",
};

/** Status colors. `ink` is for text on white or on the tint. */
export const TONE_COLORS: Record<Tone, { color: string; ink: string; tint: string }> = {
  normal: { color: "#34C759", ink: "#1F7A35", tint: "#E9F8EE" },
  borderline: { color: "#FF9500", ink: "#A85A00", tint: "#FFF3E0" },
  out: { color: "#FF3B30", ink: "#D70015", tint: "#FFEBEA" },
};

/** Today's activity total is partial, so a card compares its average. Other metrics compare the latest value. */
function partial(trend: Trend): boolean {
  return trend.agg === "sum" && trend.key !== "sleep_total_min";
}

export function subjectValue(trend: Trend): number | null {
  return partial(trend) ? trend.avg : trend.latest;
}

export function compareDelta(trend: Trend): number | null {
  const v = subjectValue(trend);
  return v !== null && trend.ref ? v - trend.ref.value : null;
}

/** "+10 bpm vs your baseline", "-1 h 5 min vs the previous 7 days". Null without a reference. */
export function compareLine(trend: Trend, range: number): string | null {
  const delta = compareDelta(trend);
  if (delta === null || !trend.ref) return null;
  const amount = signed(delta, (n) => formatValue(trend.key, n));
  const unit = trend.unit && trend.key !== "sleep_total_min" ? ` ${trend.unit}` : "";
  const against = trend.ref.kind === "baseline" ? "your baseline" : `the previous ${range} days`;
  return `${amount}${unit} vs ${against}`;
}

const OUT_BAND_WIDTHS = 0.5;
const OUT_RATIO = 0.25;

/** Normal inside the usual range. Borderline just outside it. Out of range when well outside it. */
export function cardStatus(trend: Trend): CardStatus | null {
  const v = subjectValue(trend);
  if (v === null) return null;
  let status: Status | null = null;
  let far = false;
  if (trend.band) {
    const [lo, hi] = trend.band;
    status = statusOf(v, trend.band);
    far = status !== "in_range" && (status === "below" ? lo - v : v - hi) > (hi - lo) * OUT_BAND_WIDTHS;
  } else if (trend.ref) {
    status = statusVsPrevious(v, trend.ref.value);
    far = status !== "in_range" && trend.ref.value !== 0 && Math.abs(v - trend.ref.value) / trend.ref.value > OUT_RATIO;
  }
  if (!status) return null;
  const tone: Tone = status === "in_range" ? "normal" : far ? "out" : "borderline";
  return { tone, word: TONE_WORD[tone], direction: status === "in_range" ? null : status };
}

/** "Today", "Yesterday", or the weekday of a YYYY-MM-DD day. */
export function dayLabel(day: string | null, today: string): string {
  if (!day) return "";
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export type ValuePart = { text: string; unit: string };

/** The big number split from its unit. Sleep reads "7 h 30 min", so it has two parts. */
export function valueParts(key: string, value: number, unit: string): ValuePart[] {
  if (key === "sleep_total_min") {
    const total = Math.max(0, Math.round(value));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h === 0 ? [{ text: String(m), unit: "min" }] : [{ text: String(h), unit: "h" }, { text: String(m), unit: "min" }];
  }
  return [{ text: formatValue(key, value), unit }];
}

export type SparkGeometry = {
  w: number;
  h: number;
  /** SVG path data. Empty when no run of two days has data. */
  line: string;
  last: { x: number; y: number } | null;
  band: { y: number; height: number } | null;
};

const fix = (n: number) => n.toFixed(1);

/** A smooth path through points. Control points stay between the neighbours' heights, so the curve never overshoots. */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M${fix(pts[0].x)} ${fix(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const lo = Math.min(p1.y, p2.y);
    const hi = Math.max(p1.y, p2.y);
    const clamp = (y: number) => Math.min(hi, Math.max(lo, y));
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: clamp(p1.y + (p2.y - p0.y) / 6) };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: clamp(p2.y - (p3.y - p1.y) / 6) };
    d += `C${fix(c1.x)} ${fix(c1.y)} ${fix(c2.x)} ${fix(c2.y)} ${fix(p2.x)} ${fix(p2.y)}`;
  }
  return d;
}

/** Geometry for a sparkline. A null value is a gap. The normal band widens the vertical range so it stays visible. */
export function sparkGeometry(
  values: (number | null)[],
  band: Band | null,
  w = 200,
  h = 56,
  padX = 4,
  padY = 8,
): SparkGeometry {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (real.length === 0) return { w, h, line: "", last: null, band: null };
  let lo = Math.min(...real);
  let hi = Math.max(...real);
  if (band) {
    lo = Math.min(lo, band[0]);
    hi = Math.max(hi, band[1]);
  }
  const span = hi - lo || 1;
  const yOf = (v: number) => padY + (1 - (v - lo) / span) * (h - padY * 2);
  const n = values.length;
  const xOf = (i: number) => (n > 1 ? padX + (i * (w - padX * 2)) / (n - 1) : w / 2);
  const runs: { x: number; y: number }[][] = [];
  let lastPoint: { x: number; y: number } | null = null;
  let run: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    lastPoint = { x: xOf(i), y: yOf(v) };
    run.push(lastPoint);
  });
  if (run.length) runs.push(run);
  return {
    w,
    h,
    line: runs.map(smoothPath).join(""),
    last: lastPoint,
    band: band ? { y: yOf(band[1]), height: Math.max(2, yOf(band[0]) - yOf(band[1])) } : null,
  };
}

/** "Good morning", "Good afternoon" or "Good evening" for the hour in the person's zone. */
export function greeting(now: Date, timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now),
  );
  if (hour >= 5 && hour < 12) return "Good morning";
  return hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";
}

/** "Sunday, October 4" and "2:15 PM" in the person's zone. */
export function headerDate(now: Date, timeZone: string): { date: string; time: string } {
  return {
    date: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(now),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(now),
  };
}

/** The first sentence of a text, cut at a word when it is longer than `max`. */
export function firstSentence(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  const s = end === -1 ? flat : flat.slice(0, end + 1);
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

const CHIP_LABEL: Record<string, string> = {
  resting_heart_rate: "Resting HR",
  hrv_sdnn: "HRV",
  sleep_total_min: "Sleep",
  spo2: "SpO2",
  steps: "Steps",
};
const CHIP_ORDER = ["resting_heart_rate", "sleep_total_min", "hrv_sdnn", "spo2", "steps"];

export type Chip = { text: string; tone: Tone };

/** Up to `max` chips for the hero: metrics outside their usual range first, then resting heart rate and sleep. */
export function signalChips(trends: Trend[], max = 3): Chip[] {
  const items = CHIP_ORDER.flatMap((key) => {
    const t = trends.find((x) => x.key === key);
    const v = t ? subjectValue(t) : null;
    if (!t || v === null) return [];
    const status = cardStatus(t);
    const value =
      key === "sleep_total_min" ? `${(v / 60).toFixed(1)} h` : `${formatValue(key, v)}${t.unit ? ` ${t.unit}` : ""}`;
    const delta = compareDelta(t);
    const diff =
      delta !== null && key !== "sleep_total_min" ? ` · ${signed(delta, (n) => formatValue(key, n))}` : "";
    return [{ text: `${CHIP_LABEL[key]} ${value}${diff}`, tone: status?.tone ?? "normal", key }];
  });
  const flagged = items.filter((i) => i.tone !== "normal");
  const calm = items.filter((i) => i.tone === "normal" && (i.key === "resting_heart_rate" || i.key === "sleep_total_min"));
  return [...flagged, ...calm].slice(0, max).map(({ text, tone }) => ({ text, tone }));
}

/** Chips for a proposal: the flagged readings an alert saved with its explanation. */
export function explainChips(explain: Explain | null, max = 3): string[] {
  if (!explain) return [];
  return explain.comparisons
    .filter((c) => c.today !== null)
    .slice(0, max)
    .map((c) => `${c.label} ${formatExplainValue(c.today as number, c.unit)}`);
}

function formatExplainValue(value: number, unit: string): string {
  const n = Math.round(value * 10) / 10;
  return `${n.toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`;
}

/** The clock time of an ISO moment in a zone, for example "7:30 AM". */
export function clockLabel(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

/** The origin of an alert, for its source chip: the first data source it used, else rule or agent. */
export function alertSource(kind: string, explain: Explain | null): string {
  const first = explain?.data_used[0]?.source;
  if (first) return sourceLabel(first);
  return RULE_KINDS.includes(kind) ? "Rule" : "Agent";
}

/** Whole minutes between two ISO moments. */
export function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000));
}

/** "30 min", "1 h", "1 h 15 min". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
