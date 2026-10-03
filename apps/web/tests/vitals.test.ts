import { describe, expect, it } from "vitest";
import { historySeed } from "@/components/onboarding/history-seed";
import { profileSeed } from "@/lib/profile";
import {
  bucketFor,
  buildTiles,
  cleanSeries,
  isOlderThan,
  parseHours,
  summarizeSeries,
  windowRange,
} from "@/lib/vitals-math";

describe("summarizeSeries", () => {
  it("returns null for an empty series", () => {
    expect(summarizeSeries([])).toBeNull();
  });

  it("gives the newest point, the low, and the high", () => {
    const s = summarizeSeries([
      { ts: "2026-10-03T10:00:00Z", value: 70 },
      { ts: "2026-10-03T10:02:00Z", value: 91.5 },
      { ts: "2026-10-03T10:01:00Z", value: 58 },
    ]);
    expect(s?.current).toEqual({ ts: "2026-10-03T10:02:00Z", value: 91.5 });
    expect(s?.min).toBe(58);
    expect(s?.max).toBe(91.5);
    expect(s?.count).toBe(3);
  });

  it("handles one point", () => {
    const s = summarizeSeries([{ ts: "2026-10-03T10:00:00Z", value: 64 }]);
    expect(s).toMatchObject({ min: 64, max: 64 });
  });
});

describe("parseHours", () => {
  it("uses the default for missing or bad input", () => {
    expect(parseHours(null)).toBe(3);
    expect(parseHours("")).toBe(3);
    expect(parseHours("abc")).toBe(3);
  });

  it("clamps to 1 through 48 and drops fractions", () => {
    expect(parseHours("0")).toBe(1);
    expect(parseHours("-5")).toBe(1);
    expect(parseHours("2.9")).toBe(2);
    expect(parseHours("500")).toBe(48);
  });
});

describe("windowRange", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");

  it("ends at now and starts the given hours earlier", () => {
    expect(windowRange(now, 3)).toEqual({
      from: "2026-10-03T09:00:00.000Z",
      to: "2026-10-03T12:00:00.000Z",
    });
  });

  it("never exceeds the 48 hour retention", () => {
    expect(windowRange(now, 100).from).toBe("2026-10-01T12:00:00.000Z");
  });
});

describe("bucketFor", () => {
  it("maps minutes to the agent bucket", () => {
    expect(bucketFor(1)).toBe("1m");
    expect(bucketFor(60)).toBe("1h");
    expect(bucketFor(1440)).toBe("1d");
  });
});

describe("cleanSeries", () => {
  it("drops bad points and sorts oldest first", () => {
    const out = cleanSeries([
      { ts: "2026-10-03T10:01:00Z", value: 2 },
      { ts: "bad", value: 3 },
      { ts: "2026-10-03T10:00:00Z", value: 1 },
      { ts: "2026-10-03T10:02:00Z", value: "x" },
      null,
    ]);
    expect(out.map((p) => p.value)).toEqual([1, 2]);
  });

  it("returns [] for a non-array", () => {
    expect(cleanSeries({ detail: "no" })).toEqual([]);
  });
});

describe("buildTiles", () => {
  it("returns no tiles when nothing exists", () => {
    expect(buildTiles(null, null)).toEqual([]);
    expect(buildTiles({}, [])).toEqual([]);
  });

  it("builds steps from the daily sum and the others from the latest reading", () => {
    const tiles = buildTiles(
      {
        spo2: { ts: "2026-10-03T10:00:00Z", value: 97.4 },
        resting_heart_rate: { ts: "2026-10-03T06:00:00Z", value: 58 },
      },
      [{ day: "2026-10-03", metric: "steps", avg: 3, sum: 7412, n: 120 }],
    );
    expect(tiles.map((t) => [t.key, t.text])).toEqual([
      ["steps", "7,412"],
      ["spo2", "97"],
      ["resting_heart_rate", "58"],
    ]);
  });

  it("falls back to the daily resting heart rate average", () => {
    const tiles = buildTiles({}, [{ day: "2026-10-03", metric: "resting_heart_rate", avg: 61.2, sum: 61.2, n: 1 }]);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ key: "resting_heart_rate", text: "61" });
  });

  it("skips a zero step total", () => {
    expect(buildTiles(null, [{ day: "2026-10-03", metric: "steps", avg: 0, sum: 0, n: 5 }])).toEqual([]);
  });
});

describe("isOlderThan", () => {
  it("compares against the minute limit", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    expect(isOlderThan("2026-10-03T11:45:00Z", now, 10)).toBe(true);
    expect(isOlderThan("2026-10-03T11:55:00Z", now, 10)).toBe(false);
  });
});

describe("profileSeed", () => {
  it("fills every field from the saved row", () => {
    const seed = profileSeed(
      {
        display_name: "Ana Diaz",
        dob: "1999-04-02",
        sex: "female",
        height_cm: 168,
        weight_kg: 61.5,
        timezone: "America/Detroit",
        wake_time: "06:30:00",
        bed_time: "22:45:00",
        phone_e164: "+13135550123",
      },
      "Sign In Name",
    );
    expect(seed).toEqual({
      display_name: "Ana Diaz",
      dob: "1999-04-02",
      sex: "female",
      height_cm: 168,
      weight_kg: 61.5,
      timezone: "America/Detroit",
      wake_time: "06:30",
      bed_time: "22:45",
      phone_e164: "+13135550123",
    });
  });

  it("uses the sign-in name and the defaults when there is no row", () => {
    const seed = profileSeed(null, "Sign In Name");
    expect(seed.display_name).toBe("Sign In Name");
    expect(seed.timezone).toBe("");
    expect(seed.wake_time).toBe("07:00");
    expect(seed.bed_time).toBe("23:00");
    expect(seed.height_cm).toBeNull();
  });

  it("keeps a saved name over the sign-in name", () => {
    expect(profileSeed({ display_name: "Saved" }, "Other").display_name).toBe("Saved");
  });
});

describe("historySeed", () => {
  it("is empty when the twin has only a profile", () => {
    expect(historySeed({ profile: { sex: "female" } }).twin).toBeNull();
    expect(historySeed(undefined).twin).toBeNull();
  });

  it("restores saved conditions and family history", () => {
    const state = historySeed({
      conditions: [{ display: "Asthma" }],
      family_history: [{ relation: "mother", condition: "type 2 diabetes", source: "self_reported" }],
    });
    expect(state.twin?.conditions).toHaveLength(1);
    expect(state.family).toEqual([
      { relation: "mother", condition: "type 2 diabetes", source: "self_reported" },
    ]);
    expect(state.removed.conditions).toEqual([]);
  });
});
