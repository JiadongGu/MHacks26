"use server";

import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";
import { isValidTimeZone } from "@/lib/profile";
import { isHHMM, validateQuietHours } from "@/lib/quiet-hours";

export type SettingsInput = {
  timezone: string;
  wake_time: string;
  bed_time: string;
  quiet_start: string;
  quiet_end: string;
};

export type SettingsResult =
  | { ok: true }
  | { ok: false; error: string };

/** Saves timezone, wake and bed time, and quiet hours to the session user's profile row. */
export async function saveSettingsAction(input: SettingsInput): Promise<SettingsResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (!isValidTimeZone(input.timezone)) {
    return { ok: false, error: "Enter a time zone such as America/Detroit." };
  }
  if (!isHHMM(input.wake_time) || !isHHMM(input.bed_time)) {
    return { ok: false, error: "Wake and bed time use the format HH:MM." };
  }
  const quiet = validateQuietHours(input.quiet_start, input.quiet_end);
  if (!quiet.ok) return { ok: false, error: quiet.error };

  try {
    const updated = await db
      .update(schema.profiles)
      .set({
        timezone: input.timezone,
        wake_time: input.wake_time,
        bed_time: input.bed_time,
        quiet_hours: quiet.value,
      })
      .where(eq(schema.profiles.user_id, user.id))
      .returning({ id: schema.profiles.user_id });
    if (updated.length === 0) {
      return { ok: false, error: "Finish step 1 of setup first. No profile exists yet." };
    }
  } catch (err) {
    console.error("saveSettingsAction failed", err);
    return { ok: false, error: "Could not save settings. Try again." };
  }
  return { ok: true };
}
