import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/flow";
import { historySeed } from "@/components/onboarding/history-seed";
import { LAST_STEP } from "@/components/onboarding/types";
import { profileSeed } from "@/lib/profile";
import { getLatestTwin, getProfile, hasLinkedChannel } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  const [profile, imessageLinked, twin] = await Promise.all([
    getProfile(user.id),
    hasLinkedChannel(user.id),
    // The twin only seeds step 2. A failed read leaves that step empty.
    getLatestTwin(user.id).catch(() => null),
  ]);

  const stored = profile?.onboarding_step ?? 0;
  const complete = stored >= LAST_STEP;

  return (
    <OnboardingFlow
      initialStep={complete ? 1 : Math.max(1, stored)}
      highestStep={complete ? LAST_STEP : Math.max(1, stored)}
      complete={complete}
      profile={profileSeed(profile, user.name ?? "")}
      initialHistory={historySeed(twin?.model)}
      photonNumber={process.env.PHOTON_NUMBER_DISPLAY?.trim() || null}
      imessageLinked={imessageLinked}
    />
  );
}
