import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/server";
import { getProfile } from "@/lib/queries";

export const ONBOARDING_DONE_STEP = 7;

/** Returns the signed-in user. Sends a visitor without a session to sign-in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/auth/sign-in");
  return user;
}

/** Same as requireUser, and sends a user who has not finished onboarding to /onboarding. */
export async function requireOnboarded(): Promise<{
  user: SessionUser;
  profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>;
}> {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile || profile.onboarding_step < ONBOARDING_DONE_STEP) redirect("/onboarding");
  return { user, profile };
}
