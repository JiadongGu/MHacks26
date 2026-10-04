import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckinsSection } from "@/components/dashboard/checkins-section";
import { FocusSection } from "@/components/dashboard/focus-section";
import { NumbersSection } from "@/components/dashboard/numbers-section";
import { WeekSection } from "@/components/dashboard/week-section";
import { PlanSection } from "@/components/dashboard/plan-section";
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

          <Section title="Check-ins" headingId="h-checkins">
            <Suspense fallback={<ListSkeleton rows={2} label="Loading check-ins" />}>
              <CheckinsSection userId={user.id} timeZone={profile.timezone} />
            </Suspense>
          </Section>

          <Section title="Today's plan" headingId="h-plan">
            <Suspense fallback={<ListSkeleton rows={2} label="Loading plan" />}>
              <PlanSection userId={user.id} timeZone={profile.timezone} />
            </Suspense>
          </Section>

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

          <Section title="This week" headingId="h-week">
            <Suspense fallback={<Skeleton role="status" aria-label="Loading trends" className="h-40" />}>
              <WeekSection userId={user.id} timeZone={profile.timezone} hidden={profile.hidden_metrics} />
            </Suspense>
          </Section>

          <Section title="Alerts" headingId="h-alerts">
            <Suspense fallback={<ListSkeleton label="Loading alerts" />}>
              <AlertsSection userId={user.id} />
            </Suspense>
          </Section>
        </div>

        <aside className="space-y-12" aria-label="Focus, numbers and calendar">
          <Section title="Your focus today" headingId="h-focus">
            <Suspense fallback={<Skeleton role="status" aria-label="Loading your focus" className="h-32" />}>
              <FocusSection userId={user.id} timeZone={profile.timezone} />
            </Suspense>
          </Section>

          <Section title="Your numbers" headingId="h-numbers">
            <Suspense fallback={<Skeleton role="status" aria-label="Loading your numbers" className="h-40" />}>
              <NumbersSection userId={user.id} timeZone={profile.timezone} hidden={profile.hidden_metrics} />
            </Suspense>
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
