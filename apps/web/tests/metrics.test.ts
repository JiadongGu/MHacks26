import { describe, expect, it } from "vitest";
import { buildCards, cleanHidden, METRIC_KEYS, type DailyRow } from "@/lib/metrics";

const rows: DailyRow[] = [
  { day: "2026-10-03", metric: "steps", avg: 5, sum: 8200 },
  { day: "2026-10-04", metric: "steps", avg: 5, sum: 1510 },
  { day: "2026-10-04", metric: "sleep_total_min", avg: null, sum: 435 },
  { day: "2026-10-04", metric: "resting_heart_rate", avg: 58.4, sum: null },
];

describe("buildCards", () => {
  it("shows every metric by default, with a placeholder for missing data", () => {
    const cards = buildCards(rows, []);
    expect(cards.map((c) => c.key)).toEqual(METRIC_KEYS);
    expect(cards.find((c) => c.key === "spo2")?.value).toBeNull();
  });
  it("uses the latest day and keeps the earlier days as the trend", () => {
    const steps = buildCards(rows, []).find((c) => c.key === "steps")!;
    expect(steps.value).toBe("1,510");
    expect(steps.trend).toEqual([8200, 1510]);
  });
  it("formats sleep as hours and an average as a rounded number", () => {
    const cards = buildCards(rows, []);
    expect(cards.find((c) => c.key === "sleep_total_min")?.value).toBe("7 h 15 min");
    expect(cards.find((c) => c.key === "resting_heart_rate")?.value).toBe("58");
  });
  it("leaves out hidden metrics", () => {
    const keys = buildCards(rows, ["steps", "spo2"]).map((c) => c.key);
    expect(keys).not.toContain("steps");
    expect(keys).not.toContain("spo2");
    expect(keys).toContain("sleep_total_min");
  });
});

describe("cleanHidden", () => {
  it("drops unknown keys and non-lists", () => {
    expect(cleanHidden(["steps", "nope", "steps"])).toEqual(["steps"]);
    expect(cleanHidden("steps")).toEqual([]);
    expect(cleanHidden(null)).toEqual([]);
  });
});
