// Progress for each focus area, in one list. Pure helpers, so vitest can test them.
import { formatMinutes } from "@/lib/goals";
import type { PlanItem } from "@/lib/plan";
import type { DailyRow } from "@/lib/metrics";

export type GoalLite = { metric: string; target: number; period: "day" | "week"; active: boolean };

type Def = {
  label: string;
  /** Measured by the watch against a goal. */
  metric?: { key: string; period: "day" | "week"; unit: string };
  /** Habit areas are counted from the plan items with these keys. */
  planKeys?: string[];
  noun?: string;
};

export const FOCUS_DEFS: Record<string, Def> = {
  sleep: { label: "Sleep better", metric: { key: "sleep_total_min", period: "day", unit: "" } },
  steps: { label: "Move more", metric: { key: "steps", period: "day", unit: "steps" } },
  workouts: { label: "Work out more", metric: { key: "active_minutes", period: "week", unit: "active min" } },
  heart: { label: "Look after my heart", planKeys: ["heart"], noun: "walks" },
  stress: { label: "Feel less stressed", planKeys: ["stress"], noun: "breaks" },
  unplug: { label: "Wind down at night", planKeys: ["wind_down"], noun: "wind-downs" },
  study: { label: "Build better study habits", planKeys: ["study"], noun: "study blocks" },
  balance: { label: "Balance work and rest", planKeys: ["balance"], noun: "breaks" },
  routine: { label: "Keep a steady routine", planKeys: ["wind_down"], noun: "wind-downs" },
  hydration: { label: "Drink more water", planKeys: ["hydration"], noun: "reminders" },
  sun: { label: "Protect my skin", planKeys: ["sun", "sun_reapply", "skin_check"], noun: "steps" },
};

export type FocusRow = {
  key: string;
  label: string;
  /** 0 to 100, or null when there is nothing to measure yet. */
  pct: number | null;
  text: string;
};

function pctOf(value: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, (value / target) * 100));
}

function fmt(metric: string, value: number): string {
  return metric === "sleep_total_min" ? formatMinutes(value) : Math.round(value).toLocaleString("en-US");
}

/** Today's value (day goals) or the last seven days' total (week goals) for one metric. */
function measured(rows: DailyRow[], metric: string, period: "day" | "week", today: string): number | null {
  const mine = rows.filter((r) => r.metric === metric && r.sum !== null);
  if (period === "day") {
    const row = mine.find((r) => r.day === today);
    return row ? (row.sum as number) : null;
  }
  return mine.length ? mine.reduce((total, r) => total + (r.sum as number), 0) : null;
}

/**
 * One row per picked focus area, in pick order. Sun care is added when the plan holds sun items even if it was
 * not picked, because a skin cancer history turns it on by itself.
 */
export function buildFocusRows(args: {
  picks: string[];
  goals: GoalLite[];
  rows: DailyRow[];
  today: string;
  items: PlanItem[];
  /** False when no watch is connected: measured areas then say so instead of showing a zero. */
  hasDevice?: boolean;
}): FocusRow[] {
  const { goals, rows, today, items, hasDevice = true } = args;
  const keys = args.picks.filter((k) => k in FOCUS_DEFS);
  const hasSun = items.some((i) => FOCUS_DEFS.sun.planKeys?.includes(i.key));
  if (hasSun && !keys.includes("sun")) keys.push("sun");

  return keys.map((key) => {
    const def = FOCUS_DEFS[key];
    if (def.metric) {
      if (!hasDevice) return { key, label: def.label, pct: null, text: "Connect a watch to track this" };
      const goal = goals.find((g) => g.active && g.metric === def.metric!.key && g.period === def.metric!.period);
      const value = measured(rows, def.metric.key, def.metric.period, today);
      if (!goal) return { key, label: def.label, pct: null, text: "No goal set yet" };
      const per = def.metric.period === "week" ? " this week" : " today";
      const unit = def.metric.unit ? ` ${def.metric.unit}` : "";
      if (value === null) {
        return { key, label: def.label, pct: 0, text: `No data yet. Goal ${fmt(goal.metric, goal.target)}${unit}${per}` };
      }
      return {
        key,
        label: def.label,
        pct: pctOf(value, goal.target),
        text: `${fmt(goal.metric, value)} of ${fmt(goal.metric, goal.target)}${unit}${per}`,
      };
    }
    const mine = items.filter((i) => def.planKeys?.includes(i.key));
    if (mine.length === 0) return { key, label: def.label, pct: null, text: "Nothing planned today" };
    const done = mine.filter((i) => i.done).length;
    return { key, label: def.label, pct: pctOf(done, mine.length), text: `${done} of ${mine.length} ${def.noun ?? "done"} done today` };
  });
}
