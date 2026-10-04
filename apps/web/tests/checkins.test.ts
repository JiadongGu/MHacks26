import { describe, expect, it } from "vitest";
import { orderCheckins } from "@/components/dashboard/checkins-section";

const morning = (createdAt: string | null) => ({ kind: "morning" as const, text: createdAt ? "m" : null, createdAt });
const evening = (createdAt: string | null) => ({ kind: "evening" as const, text: createdAt ? "e" : null, createdAt });

describe("orderCheckins", () => {
  it("puts the more recent check-in first", () => {
    expect(orderCheckins([morning("2026-10-04T11:00:00Z"), evening("2026-10-04T01:00:00Z")]).map((i) => i.kind)).toEqual([
      "morning",
      "evening",
    ]);
    expect(orderCheckins([morning("2026-10-04T11:00:00Z"), evening("2026-10-04T23:00:00Z")]).map((i) => i.kind)).toEqual([
      "evening",
      "morning",
    ]);
  });
  it("puts one that has not run yet last", () => {
    expect(orderCheckins([morning(null), evening("2026-10-04T01:00:00Z")]).map((i) => i.kind)).toEqual(["evening", "morning"]);
    expect(orderCheckins([morning(null), evening(null)]).map((i) => i.kind)).toEqual(["morning", "evening"]);
  });
});
