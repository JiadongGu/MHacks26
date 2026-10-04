import { describe, expect, it } from "vitest";
import {
  RULE_KINDS,
  canExplain,
  formatDelta,
  formatValue,
  hasContent,
  metricLabel,
  parseExplain,
  rangeLabel,
  sourceLabel,
} from "@/lib/explain";

const GOOD = {
  rule: "high_bp",
  summary: "3 readings were at or above 130/80.",
  comparisons: [
    { label: "Highest systolic", today: 152, baseline_or_threshold: 130, unit: "mmHg", delta: 22, flagged: true },
  ],
  twin_rules: ["Hypertension on your record → blood pressure alert at 130/80"],
  data_used: [{ metric: "bp_systolic", window: "last 24 hours", source: "wearable" }],
  watch_next: "Pulse checks your next readings.",
};

describe("parseExplain", () => {
  it("reads a full explain object", () => {
    const e = parseExplain(GOOD);
    expect(e?.rule).toBe("high_bp");
    expect(e?.comparisons[0]).toMatchObject({ today: 152, delta: 22, flagged: true });
    expect(e?.twin_rules).toHaveLength(1);
    expect(e?.estimated).toBe(false);
    expect(parseExplain({ ...GOOD, estimated: true })?.estimated).toBe(true);
  });
  it("returns null for anything that is not an explain object", () => {
    for (const bad of [null, undefined, 3, "x", [], {}, { rule: "high_bp" }, { summary: "x" }]) {
      expect(parseExplain(bad)).toBeNull();
    }
  });
  it("drops malformed rows and keeps the rest", () => {
    const e = parseExplain({
      ...GOOD,
      comparisons: [null, { today: 1 }, { label: "Peak", today: "x", flagged: "yes", unit: 4 }],
      twin_rules: ["ok", 5, "  "],
      data_used: [{ window: "x" }, { metric: "spo2" }],
    });
    expect(e?.comparisons).toEqual([
      { label: "Peak", today: null, baseline_or_threshold: null, unit: "", delta: null, flagged: false },
    ]);
    expect(e?.twin_rules).toEqual(["ok"]);
    expect(e?.data_used).toEqual([{ metric: "spo2", window: "", source: "" }]);
  });
  it("accepts missing lists", () => {
    const e = parseExplain({ rule: "x", summary: "y" });
    expect(e).toMatchObject({ comparisons: [], twin_rules: [], data_used: [], watch_next: "" });
    expect(e && hasContent(e)).toBe(false);
  });
});

describe("formatValue and formatDelta", () => {
  it("adds the unit", () => {
    expect(formatValue(166, "bpm")).toBe("166 bpm");
    expect(formatValue(92, "%")).toBe("92%");
    expect(formatValue(38.4, "ms")).toBe("38.4 ms");
    expect(formatValue(38.0, "ms")).toBe("38 ms");
    expect(formatValue(5, "")).toBe("5");
    expect(formatValue(null, "bpm")).toBe("n/a");
  });
  it("signs the difference", () => {
    expect(formatDelta(31, "bpm")).toBe("+31 bpm");
    expect(formatDelta(-90, "min")).toBe("−90 min");
    expect(formatDelta(0, "bpm")).toBe("0 bpm");
    expect(formatDelta(-2.5, "%")).toBe("−2.5%");
    expect(formatDelta(null, "bpm")).toBe("n/a");
  });
});

describe("labels", () => {
  it("says in or out of range in words", () => {
    expect(rangeLabel({ flagged: true, today: 150 })).toBe("Out of range");
    expect(rangeLabel({ flagged: false, today: 150 })).toBe("In range");
    expect(rangeLabel({ flagged: true, today: null })).toBe("No reading");
  });
  it("names sources and metrics", () => {
    expect(sourceLabel("wearable")).toBe("Wearable");
    expect(sourceLabel("baseline")).toBe("Your baseline");
    expect(sourceLabel("health_record")).toBe("Health record");
    expect(sourceLabel("")).toBe("Unknown");
    expect(metricLabel("resting_heart_rate")).toBe("Resting heart rate");
    expect(metricLabel("")).toBe("Unknown");
  });
});

describe("canExplain", () => {
  it("is true for every rule kind", () => {
    expect(RULE_KINDS).toHaveLength(9);
    for (const k of RULE_KINDS) expect(canExplain(k, null)).toBe(true);
  });
  it("is false for a kind without a rule unless an explain is stored", () => {
    expect(canExplain("symptom_log", null)).toBe(false);
    expect(canExplain("morning_briefing", null)).toBe(false);
    expect(canExplain("morning_briefing", parseExplain(GOOD))).toBe(true);
  });
});
