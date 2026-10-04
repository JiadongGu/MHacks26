import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckinsSection } from "@/components/dashboard/checkins-section";
import { FocusSection } from "@/components/dashboard/focus-section";
import { NumbersSection } from "@/components/dashboard/numbers-section";
import { WeekSection } from "@/components/dashboard/week-section";
import { PlanSection } from "@/components/dashboard/plan-section";
import { GroupSection, Rise } from "@/components/dashboard/rise";
import {
  AgentSeen,
  AlertsSection,
  HrPanel,
  ProposalsSection,
  StatusHero,
  UpcomingEvents,
} from "@/components/dashboard/server-panels";
import { ListSkeleton, Section } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_TIMEZONE } from "@/lib/briefing";
import { requireOnboarded } from "@/lib/session";
import { greeting, headerDate } from "@/lib/vitals-card";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // A user who has not finished onboarding goes back to /onboarding.
  const { user, profile } = await requireOnboarded();
  const first = profile.display_name?.trim().split(/\s+/)[0];
  const zone = profile.timezone || DEFAULT_TIMEZONE;
  const now = new Date();
  const { date, time } = headerDate(now, zone);

  // On a phone the columns dissolve into one list, and `order` sets the sequence. From lg up the two columns take over.
  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            {date} <span aria-hidden="true">&middot;</span> {time}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {greeting(now, zone)}
            {first ? `, ${first}` : ""}
          </h1>
        </div>
        <Suspense fallback={null}>
          <AgentSeen />
        </Suspense>
      </header>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="max-lg:contents lg:space-y-6">
          <Rise i={0} className="order-1 lg:order-none">
            <Suspense fallback={<Skeleton role="status" aria-label="Loading status" className="h-56" />}>
              <StatusHero userId={user.id} timeZone={profile.timezone} />
            </Suspense>
          </Rise>

          <Rise i={1} className="order-2 lg:order-none">
            <GroupSection title="Waiting on you" headingId="h-proposals">
              <Suspense fallback={<ListSkeleton rows={1} label="Loading proposals" />}>
                <ProposalsSection userId={user.id} />
              </Suspense>
            </GroupSection>
          </Rise>

          <Rise i={2} className="order-4 lg:order-none">
            <GroupSection
              title="Vitals today"
              headingId="h-numbers"
              action={
                <Link
                  href="/settings"
                  className="rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Choose cards
                </Link>
              }
            >
              <Suspense
                fallback={
                  <div role="status" aria-label="Loading your numbers" className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className="h-44" />
                    ))}
                  </div>
                }
              >
                <NumbersSection userId={user.id} timeZone={profile.timezone} hidden={profile.hidden_metrics} />
              </Suspense>
            </GroupSection>
          </Rise>

          <Rise i={3} className="order-6 lg:order-none">
            <GroupSection title="Check-ins" headingId="h-checkins">
              <Suspense fallback={<ListSkeleton rows={2} label="Loading check-ins" />}>
                <CheckinsSection userId={user.id} timeZone={profile.timezone} />
              </Suspense>
            </GroupSection>
          </Rise>

          <Rise i={4} className="order-7 lg:order-none">
            <Section title="Heart rate" headingId="h-hr">
              <Suspense fallback={<Skeleton role="status" aria-label="Loading heart rate" className="h-40" />}>
                <HrPanel userId={user.id} />
              </Suspense>
            </Section>
          </Rise>

          <Rise i={5} className="order-9 lg:order-none">
            <Section title="This week" headingId="h-week">
              <Suspense fallback={<Skeleton role="status" aria-label="Loading trends" className="h-40" />}>
                <WeekSection userId={user.id} timeZone={profile.timezone} hidden={profile.hidden_metrics} />
              </Suspense>
            </Section>
          </Rise>

          <Rise i={6} className="order-8 lg:order-none">
            <GroupSection title="Alerts" headingId="h-alerts">
              <Suspense fallback={<ListSkeleton label="Loading alerts" />}>
                <AlertsSection userId={user.id} />
              </Suspense>
            </GroupSection>
          </Rise>
        </div>

        <aside className="max-lg:contents lg:space-y-6" aria-label="Plan, focus and calendar">
          <Rise i={2} className="order-3 lg:order-none">
            <Section title="Today's plan" headingId="h-plan">
              <Suspense fallback={<ListSkeleton rows={2} label="Loading plan" />}>
                <PlanSection userId={user.id} timeZone={profile.timezone} />
              </Suspense>
            </Section>
          </Rise>

          <Rise i={3} className="order-5 lg:order-none">
            <Section title="Your focus today" headingId="h-focus">
              <Suspense fallback={<Skeleton role="status" aria-label="Loading your focus" className="h-32" />}>
                <FocusSection userId={user.id} timeZone={profile.timezone} />
              </Suspense>
            </Section>
          </Rise>

          <Rise i={4} className="order-10 lg:order-none">
            <Section title="Next 48 hours" headingId="h-events">
              <Suspense fallback={<ListSkeleton rows={2} label="Loading events" />}>
                <UpcomingEvents userId={user.id} timeZone={profile.timezone} />
              </Suspense>
            </Section>
          </Rise>
        </aside>
      </div>
    </>
  );
}
