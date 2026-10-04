// Seven-day trend charts for the dashboard. Pure helpers, so vitest can test them.
import { formatValue, METRICS, type DailyRow } from "@/lib/metrics";

export type TrendDef = { key: string; label: string; kind: "bars" | "line" };

/** Which numbers get a chart, and in what style. Totals read best as bars, steady measures as a line. */
export const TRENDS: TrendDef[] = [
  { key: "sleep_total_min", label: "Sleep", kind: "bars" },
  { key: "steps", label: "Steps", kind: "bars" },
  { key: "resting_heart_rate", label: "Resting heart rate", kind: "line" },
  { key: "hrv_sdnn", label: "Heart rate variability", kind: "line" },
  { key: "spo2", label: "Blood oxygen", kind: "line" },
];

export type Trend = {
  key: string;
  label: string;
  kind: "bars" | "line";
  unit: string;
  /** Oldest first, one per day that has data. */
  values: number[];
  latest: string | null;
  low: string | null;
  high: string | null;
};

export function buildTrends(rows: DailyRow[], hidden: string[]): Trend[] {
  return TRENDS.filter((t) => !hidden.includes(t.key)).map((def) => {
    const metric = METRICS.find((m) => m.key === def.key)!;
    const values = rows
      .filter((r) => r.metric === def.key)
      .map((r) => ({ day: r.day, v: metric.agg === "sum" ? r.sum : r.avg }))
      .filter((r): r is { day: string; v: number } => r.v !== null && Number.isFinite(r.v))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-7)
      .map((r) => r.v);
    return {
      key: def.key,
      label: def.label,
      kind: def.kind,
      unit: metric.unit,
      values,
      latest: values.length ? formatValue(def.key, values[values.length - 1]) : null,
      low: values.length ? formatValue(def.key, Math.min(...values)) : null,
      high: values.length ? formatValue(def.key, Math.max(...values)) : null,
    };
  });
}

/** SVG points for a line, scaled into a width by height box with a little padding. */
export function linePoints(values: number[], width: number, height: number, pad = 3): string {
  if (values.length === 0) return "";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = values.length > 1 ? pad + i * step : width / 2;
      const y = height - pad - ((v - lo) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
