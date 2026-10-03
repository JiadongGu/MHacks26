import { describe, expect, it } from "vitest";
import { buildAgentPath } from "@/lib/agent-proxy";
import { validateProfile } from "@/lib/profile";
import { LINK_CODE_ALPHABET, generateLinkCode, isLinkCode } from "@/lib/link-code";
import {
  clampPct,
  describeGoal,
  formatMinutes,
  ringGeometry,
  validateGoal,
} from "@/lib/goals";
import {
  parseQuietHours,
  quietWindowMinutes,
  validateQuietHours,
} from "@/lib/quiet-hours";

const ME = "11111111-1111-4111-8111-111111111111";

describe("buildAgentPath me segment", () => {
  it("replaces me with the session user id", () => {
    expect(buildAgentPath(["twin", "me", "onboarding"], ME)).toEqual({
      ok: true,
      path: `/twin/${ME}/onboarding`,
    });
  });
});

describe("generateLinkCode", () => {
  it("matches PULSE-XXXXXX", () => {
    for (let i = 0; i < 200; i++) expect(isLinkCode(generateLinkCode())).toBe(true);
  });
  it("uses the random source and stays inside the alphabet", () => {
    expect(generateLinkCode(() => 0)).toBe(`PULSE-${LINK_CODE_ALPHABET[0].repeat(6)}`);
    const last = LINK_CODE_ALPHABET[LINK_CODE_ALPHABET.length - 1];
    expect(generateLinkCode(() => 0.999999999)).toBe(`PULSE-${last.repeat(6)}`);
    expect(generateLinkCode(() => 1)).toBe(`PULSE-${last.repeat(6)}`);
  });
  it("rejects bad codes", () => {
    expect(isLinkCode("PULSE-abcdef")).toBe(false);
    expect(isLinkCode("PULSE-ABCD")).toBe(false);
    expect(isLinkCode("PULSE-ABC")).toBe(false);
    expect(isLinkCode("pulse-ABCDEF")).toBe(false);
  });
});

describe("ring math", () => {
  it("clamps percent", () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(140)).toBe(100);
    expect(clampPct(NaN)).toBe(0);
    expect(clampPct(42)).toBe(42);
  });
  it("computes the dash offset", () => {
    const empty = ringGeometry(0, 10);
    expect(empty.offset).toBeCloseTo(empty.circumference);
    const half = ringGeometry(50, 10);
    expect(half.offset).toBeCloseTo(half.circumference / 2);
    const full = ringGeometry(250, 10);
    expect(full.offset).toBeCloseTo(0);
    expect(full.pct).toBe(100);
  });
});

describe("goal text and validation", () => {
  it("formats minutes", () => {
    expect(formatMinutes(450)).toBe("7 h 30 min");
    expect(formatMinutes(480)).toBe("8 h");
    expect(formatMinutes(45)).toBe("45 min");
  });
  it("describes a goal", () => {
    expect(
      describeGoal({ metric: "steps", target: 8000, period: "day", direction: "at_least" }),
    ).toBe("At least 8,000 steps per day");
    expect(
      describeGoal({ metric: "sleep_total_min", target: 450, period: "day", direction: "at_least" }),
    ).toBe("At least 7 h 30 min per day");
  });
  it("validates a draft", () => {
    expect(validateGoal({ metric: "steps", target: 8000 })).toBeNull();
    expect(validateGoal({ metric: "steps", target: 0 })).not.toBeNull();
    expect(validateGoal({ metric: "", target: 5 })).not.toBeNull();
    expect(validateGoal({ metric: "steps", target: 2_000_000 })).not.toBeNull();
  });
});

describe("quiet hours", () => {
  it("accepts a window that crosses midnight", () => {
    expect(validateQuietHours("22:00", "07:00")).toEqual({
      ok: true,
      value: { start: "22:00", end: "07:00" },
    });
    expect(quietWindowMinutes({ start: "22:00", end: "07:00" })).toBe(9 * 60);
    expect(quietWindowMinutes({ start: "13:00", end: "14:30" })).toBe(90);
  });
  it("turns off on two empty values", () => {
    expect(validateQuietHours("", "")).toEqual({ ok: true, value: null });
    expect(validateQuietHours(null, undefined)).toEqual({ ok: true, value: null });
  });
  it("rejects bad input", () => {
    expect(validateQuietHours("22:00", "")).toMatchObject({ ok: false });
    expect(validateQuietHours("25:00", "07:00")).toMatchObject({ ok: false });
    expect(validateQuietHours("7:00", "08:00")).toMatchObject({ ok: false });
    expect(validateQuietHours("08:00", "08:00")).toMatchObject({ ok: false });
  });
  it("parses the database value", () => {
    expect(parseQuietHours({ start: "22:00:00", end: "07:00" })).toEqual({
      start: "22:00",
      end: "07:00",
    });
    expect(parseQuietHours({ start: "x" })).toBeNull();
    expect(parseQuietHours(null)).toBeNull();
  });
});

describe("validateProfile", () => {
  const good = {
    display_name: "Morgan Rivera",
    dob: "1988-04-17",
    sex: "female",
    height_cm: 168,
    weight_kg: 71,
    timezone: "America/Detroit",
    wake_time: "07:00",
    bed_time: "23:00",
    phone_e164: "+13135550123",
  };
  const today = new Date("2026-10-03T12:00:00Z");

  it("accepts a good profile", () => {
    expect(validateProfile(good, today)).toEqual({});
    expect(validateProfile({ ...good, phone_e164: "" }, today)).toEqual({});
    expect(validateProfile({ ...good, phone_e164: "+1 (313) 555-0123" }, today)).toEqual({});
  });
  it("flags bad fields", () => {
    const errors = validateProfile(
      {
        ...good,
        display_name: " ",
        dob: "2099-01-01",
        sex: "",
        height_cm: 10,
        weight_kg: null,
        timezone: "Mars/Base",
        wake_time: "7am",
        phone_e164: "3135550123",
      },
      today,
    );
    expect(Object.keys(errors).sort()).toEqual([
      "display_name",
      "dob",
      "height_cm",
      "phone_e164",
      "sex",
      "timezone",
      "wake_time",
      "weight_kg",
    ]);
  });
});
