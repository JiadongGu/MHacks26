import type { ProfileInput } from "@/lib/profile";

export const STEPS = [
  { id: 1, label: "Profile" },
  { id: 2, label: "Health history" },
  { id: 3, label: "Connect" },
  { id: 4, label: "Focus" },
  { id: 5, label: "Finish" },
] as const;

export const LAST_STEP = STEPS.length;

export type StepNav = {
  /** Saves the next step number and moves forward. */
  next: () => void;
  back: () => void;
  /** True while the stepper saves its position. */
  saving: boolean;
};

export type { ProfileInput };

/** Profile fields that go to the twin. */
export function twinProfile(p: ProfileInput) {
  return {
    dob: p.dob || undefined,
    sex: p.sex || undefined,
    height_cm: p.height_cm ?? undefined,
    weight_kg: p.weight_kg ?? undefined,
    timezone: p.timezone || undefined,
  };
}
