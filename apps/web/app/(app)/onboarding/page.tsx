import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/flow";
import { LAST_STEP } from "@/components/onboarding/types";
import type { ProfileInput } from "@/lib/profile";
import { getProfile, hasLinkedChannel } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  const [profile, imessageLinked] = await Promise.all([
    getProfile(user.id),
    hasLinkedChannel(user.id),
  ]);

  const stored = profile?.onboarding_step ?? 0;
  const complete = stored >= LAST_STEP;
  const seed: ProfileInput = {
    display_name: profile?.display_name ?? user.name ?? "",
    dob: profile?.dob ?? "",
    sex: profile?.sex ?? "",
    height_cm: profile?.height_cm ?? null,
    weight_kg: profile?.weight_kg ?? null,
    timezone: profile?.timezone ?? "",
    wake_time: profile?.wake_time?.slice(0, 5) ?? "07:00",
    bed_time: profile?.bed_time?.slice(0, 5) ?? "23:00",
    phone_e164: profile?.phone_e164 ?? "",
  };

  return (
    <OnboardingFlow
      initialStep={complete ? 1 : Math.max(1, stored)}
      highestStep={complete ? LAST_STEP : Math.max(1, stored)}
      complete={complete}
      profile={seed}
      photonNumber={process.env.PHOTON_NUMBER_DISPLAY?.trim() || null}
      imessageLinked={imessageLinked}
    />
  );
}
