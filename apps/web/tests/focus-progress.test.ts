import { describe, expect, it } from "vitest";
import { buildFocusRows } from "@/lib/focus-progress";
import type { PlanItem } from "@/lib/plan";

const today = "2026-10-04";
const item = (key: string, done = false): PlanItem => ({
  key,
  title: key,
  start: "2026-10-04T14:00:00+00:00",
  end: "2026-10-04T14:30:00+00:00",
  why: "",
  done: done || undefined,
});
const goals = [
  { metric: "sleep_total_min", target: 420, period: "day" as const, active: true },
  { metric: "steps", target: 7000, period: "day" as const, active: true },
  { metric: "active_minutes", target: 150, period: "week" as const, active: true },
];
const rows = [
  { day: today, metric: "sleep_total_min", avg: null, sum: 361 },
  { day: today, metric: "steps", avg: null, sum: 3500 },
  { day: "2026-10-03", metric: "active_minutes", avg: null, sum: 40 },
  { day: today, metric: "active_minutes", avg: null, sum: 35 },
];

describe("buildFocusRows", () => {
  it("measures sleep, steps and weekly active minutes against their goals", () => {
    const out = buildFocusRows({ picks: ["sleep", "steps", "workouts"], goals, rows, today, items: [] });
    expect(out[0]).toMatchObject({ key: "sleep", text: "6 h 1 min of 7 h today" });
    expect(Math.round(out[0].pct!)).toBe(86);
    expect(out[1]).toMatchObject({ pct: 50, text: "3,500 of 7,000 steps today" });
    expect(out[2]).toMatchObject({ text: "75 of 150 active min this week" });
  });
  it("counts habit areas from ticked plan items", () => {
    const out = buildFocusRows({
      picks: ["study"],
      goals,
      rows,
      today,
      items: [item("study", true), item("study"), item("study")],
    });
    expect(out[0]).toMatchObject({ text: "1 of 3 study blocks done today" });
    expect(Math.round(out[0].pct!)).toBe(33);
  });
  it("says so when nothing is planned or there is no goal or data", () => {
    expect(buildFocusRows({ picks: ["stress"], goals, rows, today, items: [] })[0]).toMatchObject({ pct: null, text: "Nothing planned today" });
    expect(buildFocusRows({ picks: ["steps"], goals: [], rows, today, items: [] })[0]).toMatchObject({ pct: null, text: "No goal set yet" });
    expect(buildFocusRows({ picks: ["sleep"], goals, rows: [], today, items: [] })[0].text).toContain("No data yet");
  });
  it("adds sun care when the plan has sun items even if it was not picked", () => {
    const out = buildFocusRows({ picks: ["sleep"], goals, rows, today, items: [item("sun"), item("sun_reapply")] });
    expect(out.map((r) => r.key)).toEqual(["sleep", "sun"]);
    expect(out[1].text).toBe("0 of 2 steps done today");
  });
  it("says a watch is needed instead of showing a zero when no device is connected", () => {
    const out = buildFocusRows({ picks: ["sleep", "study"], goals, rows: [], today, items: [item("study")], hasDevice: false });
    expect(out[0]).toMatchObject({ pct: null, text: "Connect a watch to track this" });
    expect(out[1]).toMatchObject({ text: "0 of 1 study blocks done today" });
  });
  it("ignores unknown keys", () => {
    expect(buildFocusRows({ picks: ["nope"], goals, rows, today, items: [] })).toEqual([]);
  });
});
