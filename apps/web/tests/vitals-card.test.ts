import { describe, expect, it } from "vitest";
import { METRICS, type DailyRow } from "@/lib/metrics";
import { buildTrend } from "@/lib/trends";
import {
  cardStatus,
  categoryOf,
  compareLine,
  dayLabel,
  durationLabel,
  explainChips,
  firstSentence,
  greeting,
  signalChips,
  smoothPath,
  sparkGeometry,
  valueParts,
} from "@/lib/vitals-card";

const def = (key: string) => METRICS.find((m) => m.key === key)!;
const rhr = (day: string, avg: number): DailyRow => ({ day, metric: "resting_heart_rate", avg, sum: null });
const sleep = (day: string, sum: number): DailyRow => ({ day, metric: "sleep_total_min", avg: null, sum });
const TODAY = "2026-10-04";

function hr(values: number[], baseline = 74) {
  const rows = values.map((v, i) => rhr(`2026-10-${String(4 - (values.length - 1 - i)).padStart(2, "0")}`, v));
  return buildTrend(def("resting_heart_rate"), rows, TODAY, 7, { resting_hr: baseline });
}

describe("categoryOf", () => {
  it("maps metrics to their category", () => {
    expect(categoryOf("hrv_sdnn")).toBe("heart");
    expect(categoryOf("sleep_total_min")).toBe("sleep");
    expect(categoryOf("steps")).toBe("activity");
    expect(categoryOf("spo2")).toBe("respiratory");
  });
});

describe("cardStatus", () => {
  it("is normal inside the band", () => {
    expect(cardStatus(hr([74, 75, 76]))).toMatchObject({ tone: "normal", word: "Normal", direction: null });
  });
  it("is borderline just outside the band", () => {
    expect(cardStatus(hr([74, 80]))).toMatchObject({ tone: "borderline", direction: "above" });
  });
  it("is out of range far outside the band", () => {
    expect(cardStatus(hr([74, 90]))).toMatchObject({ tone: "out", word: "Out of range", direction: "above" });
  });
  it("is null without data", () => {
    expect(cardStatus(hr([]))).toBeNull();
  });
});

describe("compareLine", () => {
  it("compares the latest value with the baseline", () => {
    expect(compareLine(hr([74, 84]), 7)).toBe("+10 bpm vs your baseline");
  });
  it("words a sleep difference in hours", () => {
    const t = buildTrend(def("sleep_total_min"), [sleep(TODAY, 300)], TODAY, 7, { sleep_min: 420 });
    expect(compareLine(t, 7)).toBe("-2 h vs your baseline");
  });
  it("is null without a reference", () => {
    expect(compareLine(buildTrend(def("spo2"), [], TODAY, 7), 7)).toBeNull();
  });
});

describe("dayLabel", () => {
  it("names today, yesterday and older days", () => {
    expect(dayLabel(TODAY, TODAY)).toBe("Today");
    expect(dayLabel("2026-10-03", TODAY)).toBe("Yesterday");
    expect(dayLabel("2026-10-01", TODAY)).toBe("Thu");
    expect(dayLabel(null, TODAY)).toBe("");
  });
});

describe("valueParts", () => {
  it("splits sleep into hours and minutes", () => {
    expect(valueParts("sleep_total_min", 330, "")).toEqual([
      { text: "5", unit: "h" },
      { text: "30", unit: "min" },
    ]);
    expect(valueParts("sleep_total_min", 45, "")).toEqual([{ text: "45", unit: "min" }]);
  });
  it("keeps one part with the unit for other metrics", () => {
    expect(valueParts("steps", 7412, "steps")).toEqual([{ text: "7,412", unit: "steps" }]);
  });
});

describe("sparkGeometry", () => {
  it("gives a path, a last point and a band", () => {
    const g = sparkGeometry([70, 72, 71, 75], [68, 76]);
    expect(g.line.startsWith("M")).toBe(true);
    expect(g.line.match(/C/g)).toHaveLength(3);
    expect(g.last?.x).toBeCloseTo(196);
    expect(g.band).not.toBeNull();
  });
  it("has no line for one point, but still a dot", () => {
    const g = sparkGeometry([70], null);
    expect(g.line).toBe("");
    expect(g.last).not.toBeNull();
  });
  it("breaks the path at a gap", () => {
    const g = sparkGeometry([70, 71, null, 73, 74], null);
    expect(g.line.match(/M/g)).toHaveLength(2);
  });
  it("is empty without data", () => {
    expect(sparkGeometry([null, null], null)).toMatchObject({ line: "", last: null, band: null });
  });
  it("keeps the curve between neighbour heights", () => {
    const d = smoothPath([
      { x: 0, y: 10 },
      { x: 10, y: 50 },
      { x: 20, y: 50 },
      { x: 30, y: 10 },
    ]);
    const ys = [...d.matchAll(/C[\d.]+ ([\d.]+) [\d.]+ ([\d.]+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
  });
});

describe("greeting", () => {
  it("follows the hour in the zone", () => {
    const at = (iso: string) => new Date(iso);
    expect(greeting(at("2026-10-04T14:00:00Z"), "America/Detroit")).toBe("Good morning");
    expect(greeting(at("2026-10-04T18:00:00Z"), "America/Detroit")).toBe("Good afternoon");
    expect(greeting(at("2026-10-05T01:00:00Z"), "America/Detroit")).toBe("Good evening");
    expect(greeting(at("2026-10-04T14:00:00Z"), "Asia/Tokyo")).toBe("Good evening");
  });
});

describe("firstSentence", () => {
  it("cuts at the first sentence", () => {
    expect(firstSentence("Your resting heart rate is high. Sleep was short.")).toBe("Your resting heart rate is high.");
  });
  it("cuts a long sentence at a word", () => {
    const s = firstSentence(`${"word ".repeat(60)}end.`, 50);
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("signalChips", () => {
  it("lists flagged metrics first and keeps resting heart rate and sleep otherwise", () => {
    const sleepTrend = buildTrend(def("sleep_total_min"), [sleep(TODAY, 300)], TODAY, 7, { sleep_min: 420 });
    const chips = signalChips([hr([74, 84]), sleepTrend]);
    expect(chips.map((c) => c.text)).toEqual(["Resting HR 84 bpm · +10", "Sleep 5.0 h"]);
    expect(chips[0].tone).not.toBe("normal");
  });
  it("is empty without data", () => {
    expect(signalChips([])).toEqual([]);
  });
});

describe("explainChips", () => {
  it("turns saved readings into short chips", () => {
    const explain = {
      rule: "r",
      summary: "s",
      comparisons: [
        { label: "Resting HR", today: 84, baseline_or_threshold: 74, unit: "bpm", delta: 10, flagged: true },
        { label: "SpO2", today: null, baseline_or_threshold: 95, unit: "%", delta: null, flagged: false },
      ],
      twin_rules: [],
      data_used: [],
      watch_next: "",
      estimated: false,
    };
    expect(explainChips(explain)).toEqual(["Resting HR 84 bpm"]);
    expect(explainChips(null)).toEqual([]);
  });
});

describe("durationLabel", () => {
  it("words minutes", () => {
    expect(durationLabel(30)).toBe("30 min");
    expect(durationLabel(60)).toBe("1 h");
    expect(durationLabel(75)).toBe("1 h 15 min");
  });
});
