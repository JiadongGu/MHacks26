import type { Metadata } from "next";
import { Suspense } from "react";
import { FocusSection } from "@/components/dashboard/focus-section";
import { GoalsManager } from "@/components/goals/goals-manager";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { getProfile, listGoals } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Goals" };
export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await requireUser();
  // If the read fails, the client component loads the list itself and shows the error state.
  const [initial, profile] = await Promise.all([
    listGoals(user.id).catch(() => undefined),
    getProfile(user.id).catch(() => null),
  ]);
  return (
    <>
      <PageHeader eyebrow="Targets" title="Goals">
        Pulse tracks each active goal and tells you where you stand.
      </PageHeader>
      <div className="max-w-3xl space-y-12">
        <Section title="Your focus areas" headingId="g-focus">
          <p className="mb-4 max-w-[60ch] text-sm text-muted-foreground">
            Everything you chose in setup. Sleep, steps and workouts are measured by your watch. The rest, like
            study and skin care, are counted from the plan items you tick off.
          </p>
          <Suspense fallback={<Skeleton role="status" aria-label="Loading your focus" className="h-32" />}>
            <FocusSection userId={user.id} timeZone={profile?.timezone ?? null} />
          </Suspense>
        </Section>
        <Section title="Numeric targets" headingId="g-targets">
          <GoalsManager initial={initial} />
        </Section>
      </div>
    </>
  );
}
