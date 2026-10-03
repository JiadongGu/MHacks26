import { describe, expect, it } from "vitest";
import { audioErrorText, localDay, parseRange } from "@/lib/briefing";

describe("localDay", () => {
  const t = new Date("2026-10-03T02:30:00Z");

  it("uses the user's zone", () => {
    expect(localDay("America/Detroit", t)).toBe("2026-10-02");
    expect(localDay("Asia/Tokyo", t)).toBe("2026-10-03");
  });

  it("falls back to the default zone", () => {
    expect(localDay("Not/AZone", t)).toBe("2026-10-02");
    expect(localDay(null, t)).toBe("2026-10-02");
  });
});

describe("parseRange", () => {
  it("reads byte ranges", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });

  it("rejects bad ranges", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=9-3", 100)).toBe("invalid");
    expect(parseRange("bytes=-", 100)).toBe("invalid");
    expect(parseRange("bytes=-0", 100)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBe("invalid");
    expect(parseRange("bytes=0-1,5-6", 100)).toBe("invalid");
    expect(parseRange("bytes=0-1", 0)).toBe("invalid");
  });
});

describe("audioErrorText", () => {
  it("maps statuses to text", () => {
    expect(audioErrorText(503)).toMatch(/unavailable/);
    expect(audioErrorText(404)).toMatch(/Generate/);
    expect(audioErrorText(null)).toMatch(/Could not play/);
  });
});
