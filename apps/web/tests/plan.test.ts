import { describe, expect, it } from "vitest";
import {
  CATEGORY_STYLE,
  bedtimeLabel,
  categoriesIn,
  itemState,
  onCalendar,
  parseItems,
  planHeadline,
  timeRange,
  type PlanItem,
} from "@/lib/plan";

const DET = "America/Detroit";
const item = (start: string, end: string, extra: Partial<PlanItem> = {}): PlanItem => ({
  key: "steps",
  title: "Walk",
  start,
  end,
  why: "",
  ...extra,
});

describe("parseItems", () => {
  it("keeps good items, drops bad ones, and sorts soonest first", () => {
    const parsed = parseItems([
      { key: "study", title: "Study block", start: "2026-10-04T18:10:00+00:00", end: "2026-10-04T18:55:00+00:00", why: "Focus." },
      { key: "steps", title: "Walk", start: "2026-10-04T16:00:00+00:00", end: "2026-10-04T16:20:00+00:00", event_id: "abc" },
      { key: "x", title: "No end", start: "2026-10-04T16:00:00+00:00" },
      { key: "y", title: "Bad date", start: "nope", end: "also nope" },
      null,
      "text",
    ]);
    expect(parsed.map((p) => p.title)).toEqual(["Walk", "Study block"]);
    expect(parsed[0].event_id).toBe("abc");
    expect(parsed[1].why).toBe("Focus.");
  });
  it("returns an empty list for anything that is not an array", () => {
    expect(parseItems(null)).toEqual([]);
    expect(parseItems({})).toEqual([]);
    expect(parseItems("[]")).toEqual([]);
  });
});

describe("timeRange", () => {
  it("shows the half of the day once when start and end share it", () => {
    expect(timeRange("2026-10-04T16:00:00Z", "2026-10-04T16:20:00Z", DET)).toBe("12:00 to 12:20 PM");
  });
  it("shows both halves when the item crosses noon", () => {
    expect(timeRange("2026-10-04T15:40:00Z", "2026-10-04T16:10:00Z", DET)).toBe("11:40 AM to 12:10 PM");
  });
  it("uses the given time zone, not the server's", () => {
    expect(timeRange("2026-10-04T16:00:00Z", "2026-10-04T16:20:00Z", "America/Los_Angeles")).toBe("9:00 to 9:20 AM");
  });
});

describe("bedtimeLabel", () => {
  it("formats 24 hour times as 12 hour times", () => {
    expect(bedtimeLabel("00:00")).toBe("12:00 am");
    expect(bedtimeLabel("12:15")).toBe("12:15 pm");
    expect(bedtimeLabel("22:30")).toBe("10:30 pm");
    expect(bedtimeLabel("09:05")).toBe("9:05 am");
  });
  it("gives null for missing or malformed values", () => {
    expect(bedtimeLabel(null)).toBeNull();
    expect(bedtimeLabel("")).toBeNull();
    expect(bedtimeLabel("25:00")).toBeNull();
    expect(bedtimeLabel("7pm")).toBeNull();
  });
});

describe("itemState", () => {
  const walk = item("2026-10-04T16:00:00Z", "2026-10-04T16:20:00Z");
  it("is upcoming before the start, now during, and done after the end", () => {
    expect(itemState(walk, new Date("2026-10-04T15:59:00Z"))).toBe("upcoming");
    expect(itemState(walk, new Date("2026-10-04T16:00:00Z"))).toBe("now");
    expect(itemState(walk, new Date("2026-10-04T16:19:59Z"))).toBe("now");
    expect(itemState(walk, new Date("2026-10-04T16:20:00Z"))).toBe("done");
  });
});

describe("onCalendar", () => {
  it("is true only when an item has a calendar event", () => {
    expect(onCalendar([item("2026-10-04T16:00:00Z", "2026-10-04T16:20:00Z")])).toBe(false);
    expect(onCalendar([item("2026-10-04T16:00:00Z", "2026-10-04T16:20:00Z", { event_id: "e" })])).toBe(true);
    expect(onCalendar([])).toBe(false);
  });
});

describe("planHeadline", () => {
  it("always speaks about today and matches the day's load", () => {
    expect(planHeadline("light")).toBe("Today looks open.");
    expect(planHeadline("normal")).toBe("Today is a steady day.");
    expect(planHeadline("packed")).toBe("Today is a busy one with few gaps.");
  });
  it("can speak about tomorrow", () => {
    expect(planHeadline("light", "tomorrow")).toBe("Tomorrow looks open.");
    expect(planHeadline("packed", "tomorrow")).toBe("Tomorrow is a busy one with few gaps.");
  });
  it("falls back to the steady wording for an unknown load", () => {
    expect(planHeadline("weird" as never)).toBe("Today is a steady day.");
  });
});

describe("categories", () => {
  it("keeps a known category from stored items and drops an unknown one", () => {
    const base = { title: "x", start: "2026-10-04T14:00:00+00:00", end: "2026-10-04T14:30:00+00:00" };
    const parsed = parseItems([
      { ...base, key: "study", category: "mental" },
      { ...base, key: "odd", category: "nope" },
      { ...base, key: "old" },
    ]);
    expect(parsed.map((i) => i.category)).toEqual(["mental", undefined, undefined]);
  });
  it("lists the categories in use in a fixed order for the legend", () => {
    const mk = (category: string) => ({ key: "k", title: "t", start: "", end: "", why: "", category });
    expect(categoriesIn([mk("health"), mk("mental"), mk("mental")])).toEqual(["mental", "health"]);
    expect(categoriesIn([])).toEqual([]);
  });
  it("never uses yellow", () => {
    for (const c of Object.values(CATEGORY_STYLE)) expect(c.hex).not.toBe("#fbd75b");
  });
});
