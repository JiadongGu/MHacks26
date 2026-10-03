import type { Metadata } from "next";
import { Suspense } from "react";
import { GoalRings } from "@/components/dashboard/goal-rings";
import {
  AgentSeen,
  AlertsSection,
  HrPanel,
  ProposalsSection,
  StatusHero,
  UpcomingEvents,
} from "@/components/dashboard/server-panels";
import { PageHeader } from "@/components/page-header";
import { ListSkeleton, Section } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // A user who has not finished onboarding goes back to /onboarding.
  const { user, profile } = await requireOnboarded();
  const first = profile.display_name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader eyebrow="Today" title={first ? `Hello, ${first}` : "Dashboard"} className="mb-8" />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-16">
        <div className="space-y-12">
          <Suspense fallback={<Skeleton role="status" aria-label="Loading status" className="h-40" />}>
            <StatusHero userId={user.id} />
          </Suspense>

          <Section title="Waiting on you" headingId="h-proposals">
            <Suspense fallback={<ListSkeleton rows={1} label="Loading proposals" />}>
              <ProposalsSection userId={user.id} />
            </Suspense>
          </Section>

          <Section title="Heart rate" headingId="h-hr">
            <Suspense fallback={<Skeleton role="status" aria-label="Loading heart rate" className="h-40" />}>
              <HrPanel userId={user.id} />
            </Suspense>
          </Section>

          <Section title="Alerts" headingId="h-alerts">
            <Suspense fallback={<ListSkeleton label="Loading alerts" />}>
              <AlertsSection userId={user.id} />
            </Suspense>
          </Section>
        </div>

        <aside className="space-y-12" aria-label="Goals and calendar">
          <Section title="Goals" headingId="h-goals">
            <GoalRings />
          </Section>

          <Section title="Next 48 hours" headingId="h-events">
            <Suspense fallback={<ListSkeleton rows={2} label="Loading events" />}>
              <UpcomingEvents userId={user.id} />
            </Suspense>
          </Section>

          <Suspense fallback={null}>
            <AgentSeen />
          </Suspense>
        </aside>
      </div>
    </>
  );
}
