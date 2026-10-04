import type { Metadata } from "next";
import { Suspense } from "react";
import { HistorySection, WeekSection } from "@/components/calendar/sections";
import { PageHeader } from "@/components/page-header";
import { ListSkeleton, Section } from "@/components/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { localDay as todayIn } from "@/lib/briefing";
import { resolveWeek, zoneOrDefault } from "@/lib/calendar-week";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: "Calendar & approvals" };
export const dynamic = "force-dynamic";

type Params = Promise<{ week?: string | string[] }>;

export default async function CalendarPage({ searchParams }: { searchParams: Params }) {
  const { user, profile } = await requireOnboarded();
  const { week } = await searchParams;
  const timeZone = zoneOrDefault(profile.timezone);
  const today = todayIn(timeZone);
  const monday = resolveWeek(Array.isArray(week) ? week[0] : week, today);

  return (
    <>
      <PageHeader eyebrow="Schedule" title="Calendar & approvals" className="mb-8">
        Pulse only changes your schedule after you reply YES. Routine daily plans go into your separate Pulse Health
        calendar.
      </PageHeader>

      <div className="space-y-6">
        <Section title="This week" headingId="h-week">
          <Suspense
            key={monday}
            fallback={<Skeleton role="status" aria-label="Loading the week" className="h-96 w-full" />}
          >
            <WeekSection userId={user.id} monday={monday} today={today} timeZone={timeZone} />
          </Suspense>
        </Section>

        <Section title="Approval history" headingId="h-history" className="max-w-3xl">
          <Suspense fallback={<ListSkeleton rows={3} label="Loading approval history" />}>
            <HistorySection userId={user.id} timeZone={timeZone} />
          </Suspense>
        </Section>
      </div>
    </>
  );
}
