import { describe, expect, it } from "vitest";
import { ageOn } from "@/lib/format";
import { METRICS, type DailyRow } from "@/lib/metrics";
import {
  average,
  baselineFor,
  buildTrend,
  fillDays,
  normalBand,
  parseRange,
  signed,
  statusOf,
  statusVsPrevious,
} from "@/lib/trends";

const def = (key: string) => METRICS.find((m) => m.key === key)!;
const rhr = (day: string, avg: number): DailyRow => ({ day, metric: "resting_heart_rate", avg, sum: null });
const steps = (day: string, sum: number): DailyRow => ({ day, metric: "steps", avg: null, sum });

describe("parseRange", () => {
  it("accepts 7, 30 and 90 and falls back to 30", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange(["90", "7"])).toBe(90);
    expect(parseRange("14")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });
});

describe("average", () => {
  it("is null for no values", () => {
    expect(average([])).toBeNull();
    expect(average([2, 4])).toBe(3);
  });
});

describe("baselineFor", () => {
  it("maps metric keys to twin baseline keys", () => {
    const b = { resting_hr: 60, hrv_sdnn: 50, sleep_min: 430, steps: 7000 };
    expect(baselineFor("resting_heart_rate", b)).toBe(60);
    expect(baselineFor("sleep_total_min", b)).toBe(430);
    expect(baselineFor("spo2", b)).toBeNull();
    expect(baselineFor("steps", { steps: "x" })).toBeNull();
  });
});

describe("normalBand and statusOf", () => {
  it("builds the band for each metric", () => {
    expect(normalBand("resting_heart_rate", 60)).toEqual([55, 65]);
    expect(normalBand("hrv_sdnn", 50)).toEqual([40, 60]);
    expect(normalBand("spo2", null)).toEqual([95, 100]);
    expect(normalBand("sleep_total_min", null)).toEqual([420, 540]);
    expect(normalBand("resting_heart_rate", null)).toBeNull();
    expect(normalBand("active_minutes", 30)).toBeNull();
  });
  it("classifies against a band", () => {
    expect(statusOf(54, [55, 65])).toBe("below");
    expect(statusOf(55, [55, 65])).toBe("in_range");
    expect(statusOf(66, [55, 65])).toBe("above");
  });
  it("classifies against the previous period within 10 percent", () => {
    expect(statusVsPrevious(105, 100)).toBe("in_range");
    expect(statusVsPrevious(120, 100)).toBe("above");
    expect(statusVsPrevious(80, 100)).toBe("below");
  });
});

describe("fillDays", () => {
  it("adds a null for each missing day", () => {
    expect(fillDays([{ day: "2026-10-02", value: 5 }], "2026-10-01", "2026-10-03")).toEqual([
      { day: "2026-10-01", value: null },
      { day: "2026-10-02", value: 5 },
      { day: "2026-10-03", value: null },
    ]);
  });
});

describe("buildTrend", () => {
  const today = "2026-10-10";
  it("compares the average with the baseline and reads the latest day", () => {
    const rows = [rhr("2026-10-08", 64), rhr("2026-10-09", 66), rhr("2026-10-10", 68)];
    const t = buildTrend(def("resting_heart_rate"), rows, today, 7, { resting_hr: 60 });
    expect(t.latest).toBe(68);
    expect(t.avg).toBe(66);
    expect(t.ref).toEqual({ value: 60, kind: "baseline" });
    expect(t.delta).toBe(6);
    expect(t.status).toBe("above");
    expect(t.points).toHaveLength(7);
  });
  it("falls back to the previous period when there is no baseline", () => {
    const rows = [steps("2026-10-01", 4000), steps("2026-10-08", 6000), steps("2026-10-09", 8000)];
    const t = buildTrend(def("steps"), rows, today, 7, {});
    expect(t.avg).toBe(7000);
    expect(t.ref).toEqual({ value: 4000, kind: "previous" });
    expect(t.delta).toBe(3000);
    expect(t.status).toBe("above");
    expect(t.band).toBeNull();
  });
  it("leaves today's partial activity total out of the average", () => {
    const rows = [steps("2026-10-09", 8000), steps("2026-10-10", 200)];
    const t = buildTrend(def("steps"), rows, today, 7, {});
    expect(t.latest).toBe(200);
    expect(t.avg).toBe(8000);
  });
  it("has no values and no status when there is no data", () => {
    const t = buildTrend(def("spo2"), [], today, 30, {});
    expect(t.latest).toBeNull();
    expect(t.avg).toBeNull();
    expect(t.status).toBeNull();
    expect(t.delta).toBeNull();
  });
  it("ignores days outside the range", () => {
    const t = buildTrend(def("resting_heart_rate"), [rhr("2026-09-01", 99)], today, 7, {});
    expect(t.latest).toBeNull();
  });
});

describe("signed", () => {
  it("adds a sign and drops it for zero", () => {
    const f = (n: number) => String(Math.round(n));
    expect(signed(4, f)).toBe("+4");
    expect(signed(-12, f)).toBe("-12");
    expect(signed(0.2, f)).toBe("0");
  });
});

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("1990-10-11", "2026-10-10")).toBe(35);
    expect(ageOn("1990-10-10", "2026-10-10")).toBe(36);
    expect(ageOn("bad", "2026-10-10")).toBeNull();
    expect(ageOn(null, "2026-10-10")).toBeNull();
  });
});
