import { describe, expect, it } from "vitest";
import { MAX_ITEMS, MAX_LEN, addItem, buildEdits, removeItem } from "@/lib/history";

describe("addItem", () => {
  it("adds trimmed text with single spaces", () => {
    expect(addItem([], "  type   2  diabetes ")).toEqual(["type 2 diabetes"]);
  });
  it("ignores empty text, repeats in any case, and text that is too long", () => {
    expect(addItem(["Asthma"], "   ")).toEqual(["Asthma"]);
    expect(addItem(["Asthma"], "asthma")).toEqual(["Asthma"]);
    expect(addItem([], "x".repeat(MAX_LEN + 1))).toEqual([]);
    expect(addItem([], "x".repeat(MAX_LEN))).toHaveLength(1);
  });
  it("stops at the limit", () => {
    const full = Array.from({ length: MAX_ITEMS }, (_, i) => `item ${i}`);
    expect(addItem(full, "one more")).toEqual(full);
  });
  it("does not change the list it was given", () => {
    const list = ["Asthma"];
    addItem(list, "Migraine");
    expect(list).toEqual(["Asthma"]);
  });
});

describe("removeItem", () => {
  it("removes only the exact entry", () => {
    expect(removeItem(["Asthma", "Migraine"], "Asthma")).toEqual(["Migraine"]);
    expect(removeItem(["Asthma"], "asthma")).toEqual(["Asthma"]);
  });
});

describe("buildEdits", () => {
  it("shapes additions the way the agent expects and keeps the removals", () => {
    const edits = buildEdits(
      { conditions: ["38341003"], medications: [], allergies: ["penicillin"] },
      { conditions: ["Asthma"], medications: ["Albuterol inhaler"], allergies: ["peanuts"] },
    );
    expect(edits).toEqual({
      conditions: { add: [{ display: "Asthma" }], remove: ["38341003"] },
      medications: { add: [{ display: "Albuterol inhaler" }], remove: [] },
      allergies: { add: ["peanuts"], remove: ["penicillin"] },
    });
  });
});
