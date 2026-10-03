// Profile input checks. Pure code, shared by the onboarding and settings server actions and the forms.
import { isHHMM } from "@/lib/quiet-hours";

export const SEX_OPTIONS = ["female", "male", "intersex", "unspecified"] as const;
export type Sex = (typeof SEX_OPTIONS)[number];

export const E164_RE = /^\+[1-9]\d{6,14}$/;

export type ProfileInput = {
  display_name: string;
  dob: string;
  sex: string;
  height_cm: number | null;
  weight_kg: number | null;
  timezone: string;
  wake_time: string;
  bed_time: string;
  phone_e164: string;
};

export type FieldErrors = Partial<Record<keyof ProfileInput, string>>;

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Removes spaces, dashes, dots, and parentheses from a phone number. */
export function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-.()]/g, "");
}

/** `today` is a parameter so tests can fix it. Returns an error text or null. */
function checkDob(dob: string, today: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return "Enter a date of birth.";
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "Enter a real date.";
  if (d.getTime() > today.getTime()) return "Date of birth is in the future.";
  if (today.getUTCFullYear() - d.getUTCFullYear() > 120) return "Check the year.";
  return null;
}

/** Validates the profile step. Returns field errors, or an empty object when the input is fine. */
export function validateProfile(p: ProfileInput, today: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  if (p.display_name.trim().length < 1) errors.display_name = "Enter your name.";
  else if (p.display_name.trim().length > 100) errors.display_name = "Use 100 characters or fewer.";

  const dobError = checkDob(p.dob, today);
  if (dobError) errors.dob = dobError;

  if (!(SEX_OPTIONS as readonly string[]).includes(p.sex)) errors.sex = "Choose one option.";

  if (p.height_cm === null || !(p.height_cm >= 30 && p.height_cm <= 260)) {
    errors.height_cm = "Height must be 30 to 260 cm.";
  }
  if (p.weight_kg === null || !(p.weight_kg >= 2 && p.weight_kg <= 500)) {
    errors.weight_kg = "Weight must be 2 to 500 kg.";
  }
  if (!isValidTimeZone(p.timezone)) errors.timezone = "Enter a time zone such as America/Detroit.";
  if (!isHHMM(p.wake_time)) errors.wake_time = "Use HH:MM.";
  if (!isHHMM(p.bed_time)) errors.bed_time = "Use HH:MM.";
  if (p.phone_e164 !== "" && !E164_RE.test(cleanPhone(p.phone_e164))) {
    errors.phone_e164 = "Use the international format, for example +13135550123.";
  }
  return errors;
}
