// The number cards on the dashboard. Pure helpers, so vitest can test them.
import { formatMinutes } from "@/lib/goals";

export type MetricDef = {
  key: string;
  label: string;
  unit: string;
  /** daily_summary column that holds the day's value: a total (sum) or an average. */
  agg: "sum" | "avg";
  /** One short line shown in settings. */
  hint: string;
};

export const METRICS: MetricDef[] = [
  { key: "sleep_total_min", label: "Sleep", unit: "", agg: "sum", hint: "Hours slept last night." },
  { key: "steps", label: "Steps", unit: "steps", agg: "sum", hint: "Steps so far today." },
  { key: "active_minutes", label: "Active minutes", unit: "min", agg: "sum", hint: "Minutes of movement today." },
  { key: "resting_heart_rate", label: "Resting heart rate", unit: "bpm", agg: "avg", hint: "Your calm heart rate." },
  { key: "hrv_sdnn", label: "Heart rate variability", unit: "ms", agg: "avg", hint: "How relaxed your body is." },
  { key: "spo2", label: "Blood oxygen", unit: "%", agg: "avg", hint: "Oxygen level in your blood." },
  { key: "active_energy_kcal", label: "Calories burned", unit: "kcal", agg: "sum", hint: "Active calories today." },
];

export const METRIC_KEYS = METRICS.map((m) => m.key);

export type DailyRow = { day: string; metric: string; avg: number | null; sum: number | null };

export type MetricCard = {
  key: string;
  label: string;
  unit: string;
  /** The latest day's value, formatted, or null when there is no data. */
  value: string | null;
  /** Day (YYYY-MM-DD) the value belongs to. */
  day: string | null;
  /** Up to 7 values, oldest first, for the small bars. */
  trend: number[];
};

export function formatValue(key: string, value: number): string {
  if (key === "sleep_total_min") return formatMinutes(value);
  return Math.round(value).toLocaleString("en-US");
}

function valueOf(def: MetricDef, row: DailyRow): number | null {
  const v = def.agg === "sum" ? row.sum : row.avg;
  return v === null || !Number.isFinite(v) ? null : v;
}

/** One card per metric that is not hidden, in catalog order. Hidden keys that are unknown are ignored. */
export function buildCards(rows: DailyRow[], hidden: string[]): MetricCard[] {
  return METRICS.filter((m) => !hidden.includes(m.key)).map((def) => {
    const mine = rows
      .filter((r) => r.metric === def.key)
      .map((r) => ({ day: r.day, v: valueOf(def, r) }))
      .filter((r): r is { day: string; v: number } => r.v !== null)
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-7);
    const last = mine[mine.length - 1];
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      value: last ? formatValue(def.key, last.v) : null,
      day: last?.day ?? null,
      trend: mine.map((r) => r.v),
    };
  });
}

/** Keeps only known metric keys, once each. */
export function cleanHidden(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return METRIC_KEYS.filter((k) => keys.includes(k));
}
