// "Why Pulse alerted you". Types and pure helpers for alerts.payload.explain. No I/O, so vitest can test them.
// The agent builds the object in services/agent/app/rules/explain.py.

export type ExplainSource = "wearable" | "baseline" | "goal" | "calendar";

export type ExplainComparison = {
  label: string;
  today: number | null;
  baseline_or_threshold: number | null;
  unit: string;
  delta: number | null;
  /** True when today is outside the range Pulse accepts. */
  flagged: boolean;
};

export type ExplainData = { metric: string; window: string; source: string };

export type Explain = {
  rule: string;
  summary: string;
  comparisons: ExplainComparison[];
  twin_rules: string[];
  data_used: ExplainData[];
  watch_next: string;
  /** True when the agent rebuilt the explanation from saved facts for an older alert. */
  estimated: boolean;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Reads an unknown value into an Explain. Returns null when it has no rule or no summary. */
export function parseExplain(raw: unknown): Explain | null {
  if (!isRecord(raw)) return null;
  const rule = text(raw.rule);
  const summary = text(raw.summary);
  if (!rule || !summary) return null;
  const comparisons: ExplainComparison[] = [];
  for (const c of Array.isArray(raw.comparisons) ? raw.comparisons : []) {
    if (!isRecord(c) || !text(c.label)) continue;
    comparisons.push({
      label: text(c.label),
      today: numOrNull(c.today),
      baseline_or_threshold: numOrNull(c.baseline_or_threshold),
      unit: text(c.unit),
      delta: numOrNull(c.delta),
      flagged: c.flagged === true,
    });
  }
  const data_used: ExplainData[] = [];
  for (const d of Array.isArray(raw.data_used) ? raw.data_used : []) {
    if (!isRecord(d) || !text(d.metric)) continue;
    data_used.push({ metric: text(d.metric), window: text(d.window), source: text(d.source) });
  }
  return {
    rule,
    summary,
    comparisons,
    twin_rules: (Array.isArray(raw.twin_rules) ? raw.twin_rules : []).filter(
      (s): s is string => typeof s === "string" && s.trim() !== "",
    ),
    data_used,
    watch_next: text(raw.watch_next),
    estimated: raw.estimated === true,
  };
}

const UNIT_SUFFIX: Record<string, string> = { "%": "%" };

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** "166 bpm", "92%", or "n/a". */
export function formatValue(value: number | null, unit: string): string {
  if (value === null) return "n/a";
  const suffix = UNIT_SUFFIX[unit];
  if (suffix !== undefined) return `${trimNumber(value)}${suffix}`;
  return unit ? `${trimNumber(value)} ${unit}` : trimNumber(value);
}

/** "+31 bpm", "-90 min", "0 bpm" (with a real minus sign), or "n/a". */
export function formatDelta(delta: number | null, unit: string): string {
  if (delta === null) return "n/a";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const body = formatValue(Math.abs(delta), unit);
  return `${sign}${body}`;
}

/** Text that goes with the icon, so color is never the only signal. */
export function rangeLabel(c: Pick<ExplainComparison, "flagged" | "today">): string {
  if (c.today === null) return "No reading";
  return c.flagged ? "Out of range" : "In range";
}

export const SOURCE_LABELS: Record<string, string> = {
  wearable: "Wearable",
  baseline: "Your baseline",
  goal: "Your goal",
  calendar: "Calendar",
};

export function sourceLabel(source: string): string {
  const known = SOURCE_LABELS[source];
  if (known) return known;
  const spaced = source.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Unknown";
}

const METRIC_NAMES: Record<string, string> = {
  spo2: "Blood oxygen",
  heart_rate: "Heart rate",
  hr: "Heart rate",
  resting_hr: "Resting heart rate",
  resting_heart_rate: "Resting heart rate",
  hrv: "Heart rate variability",
  hrv_sdnn: "Heart rate variability",
  sleep: "Sleep",
  sleep_min: "Sleep",
  sleep_total_min: "Sleep",
  steps: "Steps",
  active_minutes: "Active minutes",
  active_energy_kcal: "Calories burned",
  bp_systolic: "Systolic blood pressure",
  bp_diastolic: "Diastolic blood pressure",
};

/** "resting_hr baseline" becomes "Resting heart rate baseline"; unknown keys are spaced and capitalized. */
export function metricLabel(metric: string): string {
  const [head = "", ...rest] = metric.trim().split(/\s+/);
  const named = METRIC_NAMES[head.toLowerCase()];
  const spaced = named ? [named, ...rest].join(" ") : metric.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Unknown";
}

export function hasContent(e: Explain): boolean {
  return e.comparisons.length > 0 || e.twin_rules.length > 0 || e.data_used.length > 0;
}

/** Alert kinds that a rule in the agent writes. Other kinds, such as a briefing, have no rule to explain. */
export const RULE_KINDS: readonly string[] = [
  "workout_detected",
  "illness_onset",
  "low_spo2",
  "high_bp",
  "inactivity",
  "goal_pace",
  "sleep_debt",
  "recovery",
  "low_hr",
];

/** True when the alert has a stored explanation or comes from a rule. */
export function canExplain(kind: string, stored: Explain | null): boolean {
  return stored !== null || RULE_KINDS.includes(kind);
}
