// Focus areas the person can pick in onboarding. The catalog itself lives in the agent (GET /focus/catalog).

export type FocusArea = "body" | "mind" | "habits";

export type FocusItem = {
  key: string;
  label: string;
  blurb: string;
  area: FocusArea;
  measurable: boolean;
};

export type FocusCatalog = { max_picks: number; items: FocusItem[] };

export const AREA_LABEL: Record<FocusArea, string> = {
  body: "Body",
  mind: "Mind",
  habits: "Habits",
};

export const AREA_ORDER: FocusArea[] = ["body", "mind", "habits"];

/** Adds the key if there is room, removes it if it is already picked. Never grows past `max`. */
export function toggleFocus(selected: string[], key: string, max: number): string[] {
  if (selected.includes(key)) return selected.filter((k) => k !== key);
  return selected.length >= max ? selected : [...selected, key];
}

/** Items grouped by area, in display order, skipping empty areas. */
export function groupByArea(items: FocusItem[]): { area: FocusArea; items: FocusItem[] }[] {
  return AREA_ORDER.map((area) => ({ area, items: items.filter((i) => i.area === area) })).filter(
    (g) => g.items.length > 0,
  );
}
