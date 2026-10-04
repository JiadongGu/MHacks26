import { describe, expect, it } from "vitest";
import { buildTrends, linePoints } from "@/lib/week-charts";

const rows = [
  { day: "2026-10-02", metric: "steps", avg: null, sum: 8000 },
  { day: "2026-10-03", metric: "steps", avg: null, sum: 2000 },
  { day: "2026-10-02", metric: "resting_heart_rate", avg: 60, sum: null },
  { day: "2026-10-03", metric: "resting_heart_rate", avg: 64.2, sum: null },
  { day: "2026-10-03", metric: "sleep_total_min", avg: null, sum: 361 },
];

describe("buildTrends", () => {
  it("gives one trend per chart with oldest-first values and a formatted latest", () => {
    const t = buildTrends(rows, []);
    expect(t.map((x) => x.key)).toEqual(["sleep_total_min", "steps", "resting_heart_rate", "hrv_sdnn", "spo2"]);
    const steps = t.find((x) => x.key === "steps")!;
    expect(steps.values).toEqual([8000, 2000]);
    expect([steps.latest, steps.low, steps.high]).toEqual(["2,000", "2,000", "8,000"]);
    expect(t.find((x) => x.key === "sleep_total_min")!.latest).toBe("6 h 1 min");
    expect(t.find((x) => x.key === "hrv_sdnn")!.values).toEqual([]);
  });
  it("leaves out hidden numbers", () => {
    expect(buildTrends(rows, ["steps"]).map((x) => x.key)).not.toContain("steps");
  });
});

describe("linePoints", () => {
  it("scales values into the box with the highest value at the top", () => {
    const pts = linePoints([10, 20], 100, 50, 0).split(" ");
    expect(pts).toEqual(["0.0,50.0", "100.0,0.0"]);
  });
  it("handles one point, a flat line and nothing", () => {
    expect(linePoints([5], 100, 50)).toBe("50.0,47.0");
    expect(linePoints([5, 5], 100, 50, 0)).toBe("0.0,50.0 100.0,50.0");
    expect(linePoints([], 100, 50)).toBe("");
  });
});
