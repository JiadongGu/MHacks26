import { describe, expect, it } from "vitest";
import { groupByArea, toggleFocus, type FocusItem } from "@/lib/focus";

describe("toggleFocus", () => {
  it("adds a key while there is room", () => {
    expect(toggleFocus([], "sleep", 3)).toEqual(["sleep"]);
    expect(toggleFocus(["sleep"], "steps", 3)).toEqual(["sleep", "steps"]);
  });
  it("removes a key that is already picked", () => {
    expect(toggleFocus(["sleep", "steps"], "sleep", 3)).toEqual(["steps"]);
  });
  it("never grows past the limit, but still lets a pick be removed when full", () => {
    const full = ["sleep", "steps", "study"];
    expect(toggleFocus(full, "stress", 3)).toEqual(full);
    expect(toggleFocus(full, "steps", 3)).toEqual(["sleep", "study"]);
  });
  it("does not change the array it was given", () => {
    const picks = ["sleep"];
    toggleFocus(picks, "steps", 3);
    expect(picks).toEqual(["sleep"]);
  });
});

describe("groupByArea", () => {
  const item = (key: string, area: FocusItem["area"]): FocusItem => ({
    key,
    label: key,
    blurb: "",
    area,
    measurable: false,
  });
  it("orders groups body, mind, habits and keeps each group's order", () => {
    const groups = groupByArea([item("study", "habits"), item("sleep", "body"), item("stress", "mind"), item("steps", "body")]);
    expect(groups.map((g) => g.area)).toEqual(["body", "mind", "habits"]);
    expect(groups[0].items.map((i) => i.key)).toEqual(["sleep", "steps"]);
  });
  it("skips an area with no items", () => {
    expect(groupByArea([item("sleep", "body")]).map((g) => g.area)).toEqual(["body"]);
  });
});
