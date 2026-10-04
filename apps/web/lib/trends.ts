// Math for the trends page and the clinician summary. Pure helpers, so vitest can test them.
import { addDays } from "@/lib/calendar-week";
import { METRICS, type DailyRow, type MetricDef } from "@/lib/metrics";

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = 30;

export function parseRange(value: string | string[] | undefined): Range {
  const v = Number(Array.isArray(value) ? value[0] : value);
  return RANGES.find((r) => r === v) ?? DEFAULT_RANGE;
}

export const CATEGORIES = [
  { id: "heart", title: "Heart", color: "#FF2D55", metrics: ["resting_heart_rate", "hrv_sdnn"] },
  { id: "sleep", title: "Sleep", color: "#5E5CE6", metrics: ["sleep_total_min"] },
  { id: "activity", title: "Activity", color: "#FF9500", metrics: ["steps", "active_minutes", "active_energy_kcal"] },
  { id: "respiratory", title: "Respiratory", color: "#32ADE6", metrics: ["spo2"] },
] as const;

/** Metric key in daily_summary -> key in digital_twin.model.baselines. */
const BASELINE_KEY: Record<string, string> = {
  resting_heart_rate: "resting_hr",
  hrv_sdnn: "hrv_sdnn",
  sleep_total_min: "sleep_min",
  steps: "steps",
};

export function baselineFor(key: string, baselines: Record<string, unknown>): number | null {
  const bk = BASELINE_KEY[key];
  const v = bk ? baselines[bk] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export type Point = { day: string; value: number | null };
export type Band = [number, number];
export type Status = "in_range" | "above" | "below";

export const STATUS_LABEL: Record<Status, string> = {
  in_range: "In range",
  above: "Above usual",
  below: "Below usual",
};

const PREVIOUS_TOLERANCE = 0.1;

export function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/** The shaded normal range. A metric without a baseline and without a fixed range has none. */
export function normalBand(key: string, baseline: number | null): Band | null {
  switch (key) {
    case "resting_heart_rate":
      return baseline === null ? null : [baseline - 5, baseline + 5];
    case "hrv_sdnn":
      return baseline === null ? null : [baseline * 0.8, baseline * 1.2];
    case "steps":
      return baseline === null ? null : [baseline * 0.75, baseline * 1.25];
    case "spo2":
      return [95, 100];
    case "sleep_total_min":
      return [420, 540];
    default:
      return null;
  }
}

export function statusOf(value: number, band: Band): Status {
  if (value < band[0]) return "below";
  return value > band[1] ? "above" : "in_range";
}

/** Without a band, a value within 10 percent of the previous period counts as in range. */
export function statusVsPrevious(value: number, previous: number): Status {
  return statusOf(value, [previous * (1 - PREVIOUS_TOLERANCE), previous * (1 + PREVIOUS_TOLERANCE)]);
}

/** One value per day, oldest first, for the days from `from` to `to`. A day with no data has a null value. */
export function fillDays(points: Point[], from: string, to: string): Point[] {
  const byDay = new Map(points.map((p) => [p.day, p.value]));
  const out: Point[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, value: byDay.get(d) ?? null });
  return out;
}

function valueOf(def: MetricDef, row: DailyRow): number | null {
  const v = def.agg === "sum" ? row.sum : row.avg;
  return v === null || !Number.isFinite(v) ? null : v;
}

export type Trend = {
  key: string;
  label: string;
  unit: string;
  agg: "sum" | "avg";
  /** The latest day with data. */
  latest: number | null;
  latestDay: string | null;
  /** Average of the days in the range. */
  avg: number | null;
  /** What `avg` is compared with: the twin baseline, else the previous period of the same length. */
  ref: { value: number; kind: "baseline" | "previous" } | null;
  delta: number | null;
  status: Status | null;
  baseline: number | null;
  band: Band | null;
  points: Point[];
};

/**
 * One metric over `range` days ending on `today`. `rows` should reach back 2 x range days.
 * Today's activity total is partial, so it stays out of the average while other days exist.
 */
export function buildTrend(
  def: MetricDef,
  rows: DailyRow[],
  today: string,
  range: number,
  baselines: Record<string, unknown> = {},
): Trend {
  const from = addDays(today, -(range - 1));
  const prevFrom = addDays(today, -(2 * range - 1));
  const mine = rows
    .filter((r) => r.metric === def.key)
    .map((r) => ({ day: r.day, value: valueOf(def, r) }))
    .filter((r): r is { day: string; value: number } => r.value !== null)
    .sort((a, b) => a.day.localeCompare(b.day));
  const current = mine.filter((p) => p.day >= from && p.day <= today);
  const previous = mine.filter((p) => p.day >= prevFrom && p.day < from);
  const partialToday = def.agg === "sum" && def.key !== "sleep_total_min";
  const counted = (list: { day: string; value: number }[]) => {
    const full = partialToday ? list.filter((p) => p.day !== today) : list;
    return (full.length > 0 ? full : list).map((p) => p.value);
  };
  const avg = average(counted(current));
  const prevAvg = average(counted(previous));
  const baseline = baselineFor(def.key, baselines);
  const band = normalBand(def.key, baseline);
  const ref =
    avg === null
      ? null
      : baseline !== null
        ? { value: baseline, kind: "baseline" as const }
        : prevAvg !== null
          ? { value: prevAvg, kind: "previous" as const }
          : null;
  const status =
    avg === null ? null : band ? statusOf(avg, band) : prevAvg !== null ? statusVsPrevious(avg, prevAvg) : null;
  const last = current[current.length - 1];
  return {
    key: def.key,
    label: def.label,
    unit: def.unit,
    agg: def.agg,
    latest: last?.value ?? null,
    latestDay: last?.day ?? null,
    avg,
    ref,
    delta: avg !== null && ref ? avg - ref.value : null,
    status,
    baseline,
    band,
    points: fillDays(current, from, today),
  };
}

export function buildTrends(
  rows: DailyRow[],
  today: string,
  range: number,
  baselines: Record<string, unknown> = {},
): Trend[] {
  return METRICS.map((def) => buildTrend(def, rows, today, range, baselines));
}

/** "+4", "-12", "0". The caller supplies the formatter for the size of the change. */
export function signed(delta: number, format: (abs: number) => string): string {
  const text = format(Math.abs(delta));
  if (text === format(0)) return text;
  return `${delta > 0 ? "+" : "-"}${text}`;
}
