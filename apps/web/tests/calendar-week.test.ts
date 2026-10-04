import { describe, expect, it } from "vitest";
import {
  addDays,
  buildWeek,
  dayHeading,
  isDecidable,
  localDay,
  mondayOf,
  resolveWeek,
  startOfDay,
  statusLabel,
  weekDays,
  weekLabel,
  weekRange,
  zoneOrDefault,
} from "@/lib/calendar-week";

const DET = "America/Detroit";

describe("week math", () => {
  it("finds the Monday of any day in the week", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(mondayOf("2026-10-07")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("lists seven days from Monday to Sunday", () => {
    const days = weekDays("2026-10-05");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-10-05");
    expect(days[6]).toBe("2026-10-11");
  });
  it("uses the week param when it is a real date and falls back to today otherwise", () => {
    expect(resolveWeek("2026-10-14", "2026-10-03")).toBe("2026-10-12");
    expect(resolveWeek(undefined, "2026-10-03")).toBe("2026-09-28");
    expect(resolveWeek("not-a-date", "2026-10-03")).toBe("2026-09-28");
    expect(resolveWeek("2026-02-31", "2026-10-03")).toBe("2026-09-28");
  });
  it("labels a week and shows both years when it crosses New Year", () => {
    expect(weekLabel("2026-10-05")).toBe("Oct 5 to Oct 11, 2026");
    expect(weekLabel("2026-12-28")).toBe("Dec 28, 2026 to Jan 3, 2027");
  });
  it("gives a column heading", () => {
    expect(dayHeading("2026-10-05")).toMatchObject({ weekday: "Mon", date: "5", long: "Monday, October 5" });
  });
});

describe("time zones", () => {
  it("finds the local day of an instant", () => {
    expect(localDay("2026-10-06T02:30:00Z", DET)).toBe("2026-10-05");
    expect(localDay("2026-10-06T02:30:00Z", "Asia/Tokyo")).toBe("2026-10-06");
  });
  it("finds the start of a local day", () => {
    expect(startOfDay("2026-10-05", DET).toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(startOfDay("2026-01-05", DET).toISOString()).toBe("2026-01-05T05:00:00.000Z");
  });
  it("gives a 7 day range that is 169 hours when the clocks go back", () => {
    const { from, to } = weekRange("2026-10-26", DET); // DST ends Nov 1
    expect(from.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
  it("falls back to America/Detroit for a missing or bad zone", () => {
    expect(zoneOrDefault(null)).toBe(DET);
    expect(zoneOrDefault("Mars/Base")).toBe(DET);
    expect(zoneOrDefault("Asia/Tokyo")).toBe("Asia/Tokyo");
  });
});

const ev = (id: string, start: string, end: string, important = false) => ({
  event_id: id,
  title: id,
  starts_at: start,
  ends_at: end,
  is_important: important,
});
const prop = (id: string, status: string, start: string, end: string, google: string | null = null) => ({
  id,
  title: id,
  starts_at: start,
  ends_at: end,
  status,
  google_event_id: google,
});

describe("buildWeek", () => {
  const base = { monday: "2026-10-05", timeZone: DET };

  it("puts each block on its local day, sorted by start", () => {
    const week = buildWeek({
      ...base,
      events: [ev("late", "2026-10-06T20:00:00Z", "2026-10-06T21:00:00Z"), ev("early", "2026-10-06T14:00:00Z", "2026-10-06T15:00:00Z", true)],
      proposals: [],
      plans: [],
    });
    expect(week).toHaveLength(7);
    const tue = week[1];
    expect(tue.day).toBe("2026-10-06");
    expect(tue.blocks.map((b) => b.key)).toEqual(["event-early", "event-late"]);
    expect(tue.blocks[0].important).toBe(true);
    expect(week[0].blocks).toEqual([]);
  });

  it("uses the local day, not the UTC day", () => {
    const week = buildWeek({
      ...base,
      events: [ev("night", "2026-10-06T02:30:00Z", "2026-10-06T03:30:00Z")], // Mon 10:30 pm in Detroit
      proposals: [],
      plans: [],
    });
    expect(week[0].blocks.map((b) => b.key)).toEqual(["event-night"]);
    expect(week[1].blocks).toEqual([]);
  });

  it("repeats a multi-day event and marks the later days as continued", () => {
    const week = buildWeek({
      ...base,
      events: [ev("trip", "2026-10-07T14:00:00Z", "2026-10-09T14:00:00Z")],
      proposals: [],
      plans: [],
    });
    expect(week[2].blocks[0].continued).toBe(false);
    expect(week[3].blocks[0].continued).toBe(true);
    expect(week[4].blocks[0].continued).toBe(true);
    expect(week[5].blocks).toEqual([]);
  });

  it("keeps an event that ends at midnight sharp on its own day", () => {
    const week = buildWeek({
      ...base,
      events: [ev("late", "2026-10-06T02:00:00Z", "2026-10-06T04:00:00Z")], // ends Tue 00:00 Detroit
      proposals: [],
      plans: [],
    });
    expect(week[0].blocks).toHaveLength(1);
    expect(week[1].blocks).toHaveLength(0);
  });

  it("shows pending, approved, and applied proposals as Pulse blocks, and skips the rest", () => {
    const t = ["2026-10-07T14:00:00Z", "2026-10-07T15:00:00Z"] as const;
    const week = buildWeek({
      ...base,
      events: [],
      proposals: [
        prop("p1", "pending", ...t),
        prop("p2", "applied", ...t),
        prop("p3", "approved", ...t),
        prop("p4", "rejected", ...t),
        prop("p5", "expired", ...t),
        prop("p6", "failed", ...t),
      ],
      plans: [],
    });
    const blocks = week[2].blocks;
    expect(blocks.map((b) => [b.proposalId, b.kind])).toEqual([
      ["p1", "pending"],
      ["p2", "pulse"],
      ["p3", "pulse"],
    ]);
    expect(blocks[0].note).toBe("Waiting for your YES");
    expect(blocks[1].note).toBe("Pulse Health");
  });

  it("adds daily plan items as plan blocks", () => {
    const week = buildWeek({
      ...base,
      events: [],
      proposals: [],
      plans: [
        {
          day: "2026-10-08",
          items: [{ key: "steps", title: "Walk", start: "2026-10-08T16:00:00Z", end: "2026-10-08T16:20:00Z", why: "" }],
        },
      ],
    });
    expect(week[3].blocks.map((b) => [b.title, b.kind])).toEqual([["Walk", "plan"]]);
  });

  it("drops a cached event that Pulse already wrote", () => {
    const week = buildWeek({
      ...base,
      events: [ev("g1", "2026-10-07T14:00:00Z", "2026-10-07T15:00:00Z"), ev("g2", "2026-10-07T16:00:00Z", "2026-10-07T17:00:00Z")],
      proposals: [prop("p1", "applied", "2026-10-07T14:00:00Z", "2026-10-07T15:00:00Z", "g1")],
      plans: [],
    });
    expect(week[2].blocks.map((b) => b.key)).toEqual(["proposal-p1", "event-g2"]);
  });

  it("ignores a block with a bad date", () => {
    const week = buildWeek({ ...base, events: [ev("bad", "nope", "nope")], proposals: [], plans: [] });
    expect(week.every((d) => d.blocks.length === 0)).toBe(true);
  });
});

describe("status labels", () => {
  it("names every status", () => {
    expect(["pending", "approved", "applied", "rejected", "expired", "failed"].map(statusLabel)).toEqual([
      "Pending",
      "Approved",
      "Applied",
      "Rejected",
      "Expired",
      "Failed",
    ]);
  });
  it("humanizes an unknown status instead of hiding it", () => {
    expect(statusLabel("on_hold")).toBe("On hold");
  });
  it("lets only a pending proposal be decided", () => {
    expect(isDecidable("pending")).toBe(true);
    expect(isDecidable("applied")).toBe(false);
    expect(isDecidable("failed")).toBe(false);
  });
});
