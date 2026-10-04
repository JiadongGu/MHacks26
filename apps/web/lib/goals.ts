// Goal metadata, presets, and ring math. Pure code. No I/O.

export type GoalPeriod = "day" | "week";
export type GoalDirection = "at_least" | "at_most";

export type GoalMetric = {
  metric: string;
  label: string;
  unit: string;
  /** Word after the number in the goal sentence, for example "steps". */
  noun: string;
};

export const GOAL_METRICS: GoalMetric[] = [
  { metric: "steps", label: "Steps", unit: "steps", noun: "steps" },
  { metric: "sleep_total_min", label: "Sleep", unit: "min", noun: "" },
  { metric: "active_minutes", label: "Active minutes", unit: "min", noun: "active minutes" },
  { metric: "workout", label: "Workouts", unit: "workouts", noun: "workouts" },
  { metric: "resting_heart_rate", label: "Resting heart rate", unit: "bpm", noun: "bpm" },
];

export type GoalPreset = {
  metric: string;
  target: number;
  period: GoalPeriod;
  direction: GoalDirection;
};

export const GOAL_PRESETS: GoalPreset[] = [
  { metric: "steps", target: 8000, period: "day", direction: "at_least" },
  { metric: "sleep_total_min", target: 450, period: "day", direction: "at_least" },
  { metric: "active_minutes", target: 150, period: "week", direction: "at_least" },
  { metric: "workout", target: 3, period: "week", direction: "at_least" },
];

export function metricInfo(metric: string): GoalMetric {
  return (
    GOAL_METRICS.find((m) => m.metric === metric) ?? {
      metric,
      label: metric.replace(/_/g, " "),
      unit: "",
      noun: "",
    }
  );
}

/** Formats minutes as "7 h 30 min". */
export function formatMinutes(total: number): string {
  const rounded = Math.round(total);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Formats a metric value for display. Sleep shows hours and minutes. */
export function formatMetricValue(metric: string, value: number): string {
  if (metric === "sleep_total_min") return formatMinutes(value);
  return Math.round(value).toLocaleString("en-US");
}

/** One sentence for a goal, for example "At least 8,000 steps per day". */
export function describeGoal(g: GoalPreset): string {
  const info = metricInfo(g.metric);
  const dir = g.direction === "at_least" ? "At least" : "At most";
  const per = g.period === "day" ? "per day" : "per week";
  const amount = formatMetricValue(g.metric, g.target);
  return [dir, amount, info.noun, per].filter(Boolean).join(" ");
}

/** Clamps a percent to 0..100. A value that is not finite gives 0. */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

export type RingGeometry = {
  radius: number;
  circumference: number;
  /** stroke-dashoffset for the filled arc. */
  offset: number;
  pct: number;
};

/** Geometry for an SVG progress ring. `pct` is 0..100 and is clamped. */
export function ringGeometry(pct: number, radius = 36): RingGeometry {
  const clamped = clampPct(pct);
  const circumference = 2 * Math.PI * radius;
  return {
    radius,
    circumference,
    offset: circumference * (1 - clamped / 100),
    pct: clamped,
  };
}

/** Validates a goal draft. Returns an error text, or null when the draft is fine. */
export function validateGoal(draft: { metric: string; target: number }): string | null {
  if (!draft.metric) return "Choose a metric.";
  if (!Number.isFinite(draft.target) || draft.target <= 0) {
    return "Target must be greater than 0.";
  }
  if (draft.target > 1_000_000) return "Target must be 1,000,000 or less.";
  return null;
}
