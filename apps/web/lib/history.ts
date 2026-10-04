// Pure helpers for adding your own conditions, medications, and allergies in onboarding. No I/O.

export const MAX_ITEMS = 20;
export const MAX_LEN = 100;

/** Names the agent's risk rules recognise, so picking one tightens the right alert thresholds. */
export const CONDITION_SUGGESTIONS = [
  "Asthma",
  "Type 2 diabetes",
  "Type 1 diabetes",
  "Hypertension",
  "High cholesterol",
  "Atrial fibrillation",
  "Heart failure",
  "Chronic kidney disease",
  "Hypothyroidism",
  "Skin cancer (melanoma)",
  "Anxiety",
  "Depression",
  "ADHD",
  "Migraine",
  "Eczema",
  "Sleep apnea",
] as const;

export const ALLERGY_SUGGESTIONS = ["Penicillin", "Peanuts", "Tree nuts", "Shellfish", "Latex", "Pollen", "Dairy"] as const;

/** Adds `raw` to `list` unless it is empty, too long, a repeat (any case), or the list is full. */
export function addItem(list: string[], raw: string): string[] {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text === "" || text.length > MAX_LEN || list.length >= MAX_ITEMS) return list;
  if (list.some((x) => x.toLowerCase() === text.toLowerCase())) return list;
  return [...list, text];
}

export function removeItem(list: string[], text: string): string[] {
  return list.filter((x) => x !== text);
}

export type AddedHistory = { conditions: string[]; medications: string[]; allergies: string[] };

export const EMPTY_ADDED: AddedHistory = { conditions: [], medications: [], allergies: [] };

/** The `edits` object the agent's onboarding endpoint takes. */
export function buildEdits(removed: AddedHistory, added: AddedHistory) {
  return {
    conditions: { add: added.conditions.map((display) => ({ display })), remove: removed.conditions },
    medications: { add: added.medications.map((display) => ({ display })), remove: removed.medications },
    allergies: { add: added.allergies, remove: removed.allergies },
  };
}
