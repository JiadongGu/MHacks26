// Step 2 state and its seed. This file has no "use client", so a Server Component can import it.
import { readTwin, type TwinFamily, type TwinView } from "@/lib/twin";

export type HistoryState = {
  scenario: string | null;
  twin: TwinView | null;
  removed: { conditions: string[]; medications: string[]; allergies: string[] };
  family: TwinFamily[];
};

export const EMPTY_HISTORY: HistoryState = {
  scenario: null,
  twin: null,
  removed: { conditions: [], medications: [], allergies: [] },
  family: [],
};

/** True when the twin holds any history a user entered or imported. A profile-only twin does not count. */
export function hasHistory(twin: TwinView): boolean {
  return (
    twin.conditions.length +
      twin.medications.length +
      twin.allergies.length +
      twin.labs.length +
      twin.familyHistory.length >
    0
  );
}

/**
 * Step 2 state for a user who comes back to onboarding. It reads the saved twin model.
 * Returns the empty state when the twin has no history, so a new user still sees the import choice.
 * Removals are already applied to the saved twin, so `removed` stays empty.
 */
export function historySeed(model: unknown): HistoryState {
  if (model === null || model === undefined) return EMPTY_HISTORY;
  const twin = readTwin(model);
  if (!hasHistory(twin)) return EMPTY_HISTORY;
  return { ...EMPTY_HISTORY, twin, family: twin.familyHistory };
}
