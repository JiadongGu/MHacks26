"use server";

import { and, eq, gt, lte, sql } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";
import { LINK_CODE_TTL_MS, generateLinkCode, isLinkChannel, type LinkChannel } from "@/lib/link-code";
import { getProfile } from "@/lib/queries";
import {
  cleanPhone,
  profileSeed,
  validateProfile,
  type FieldErrors,
  type ProfileInput,
} from "@/lib/profile";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fields?: FieldErrors };

const LAST_STEP = 7;

/** Raises onboarding_step to `step`. The stored step never goes down. */
function raiseStep(step: number) {
  return sql`greatest(${schema.profiles.onboarding_step}, ${step})`;
}

/**
 * Step 1. Reads the saved profile fresh. The form calls it on mount, so a page that came from the
 * browser cache (the back button) still shows the saved values. It returns null when no row exists.
 */
export async function loadProfileAction(): Promise<ActionResult<{ profile: ProfileInput | null }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };
  try {
    const row = await getProfile(user.id);
    return { ok: true, profile: row ? profileSeed(row, user.name ?? "") : null };
  } catch (err) {
    console.error("loadProfileAction failed", err);
    return { ok: false, error: "Could not read your profile." };
  }
}

/** Step 1. Validates the profile, upserts the profiles row, and moves the stepper to step 2. */
export async function saveProfileAction(input: ProfileInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const fields = validateProfile(input);
  if (Object.keys(fields).length > 0) {
    return { ok: false, error: "Fix the marked fields.", fields };
  }

  const values = {
    display_name: input.display_name.trim(),
    dob: input.dob,
    sex: input.sex,
    height_cm: input.height_cm,
    weight_kg: input.weight_kg,
    timezone: input.timezone,
    wake_time: input.wake_time,
    bed_time: input.bed_time,
    phone_e164: input.phone_e164 === "" ? null : cleanPhone(input.phone_e164),
  };
  try {
    await db
      .insert(schema.profiles)
      .values({ user_id: user.id, ...values, onboarding_step: 2 })
      .onConflictDoUpdate({
        target: schema.profiles.user_id,
        set: { ...values, onboarding_step: raiseStep(2) },
      });
  } catch (err) {
    console.error("saveProfileAction failed", err);
    return { ok: false, error: "Could not save your profile. Try again." };
  }
  return { ok: true };
}

/** Saves the step the user has reached. Creates the profiles row when it does not exist. */
export async function advanceStepAction(step: number): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!Number.isInteger(step) || step < 1 || step > LAST_STEP) {
    return { ok: false, error: "Bad step." };
  }
  try {
    await db
      .insert(schema.profiles)
      .values({ user_id: user.id, onboarding_step: step })
      .onConflictDoUpdate({
        target: schema.profiles.user_id,
        set: { onboarding_step: raiseStep(step) },
      });
  } catch (err) {
    console.error("advanceStepAction failed", err);
    return { ok: false, error: "Could not save your progress. Try again." };
  }
  return { ok: true };
}

/** Step 6. Returns the user's unexpired pending link code for a channel. It makes one when none exists. */
export async function createLinkCodeAction(
  channel: LinkChannel = "imessage",
): Promise<ActionResult<{ code: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!isLinkChannel(channel)) return { ok: false, error: "Unknown channel." };
  try {
    const cutoff = new Date(Date.now() - LINK_CODE_TTL_MS);
    const mine = and(
      eq(schema.channel_links.user_id, user.id),
      eq(schema.channel_links.channel, channel),
      eq(schema.channel_links.status, "pending"),
    );
    const existing = await db
      .select({ code: schema.channel_links.link_code })
      .from(schema.channel_links)
      .where(and(mine, gt(schema.channel_links.created_at, cutoff)))
      .limit(1);
    if (existing[0]?.code) return { ok: true, code: existing[0].code };
    await db.delete(schema.channel_links).where(and(mine, lte(schema.channel_links.created_at, cutoff)));

    // The unique index on link_code can reject a code. Try a few new ones.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateLinkCode();
      const rows = await db
        .insert(schema.channel_links)
        .values({ user_id: user.id, channel, link_code: code, status: "pending" })
        .onConflictDoNothing()
        .returning({ code: schema.channel_links.link_code });
      if (rows[0]?.code) return { ok: true, code: rows[0].code };
    }
    return { ok: false, error: "Could not make a link code. Try again." };
  } catch (err) {
    console.error("createLinkCodeAction failed", err);
    return { ok: false, error: "Could not make a link code. Try again." };
  }
}
