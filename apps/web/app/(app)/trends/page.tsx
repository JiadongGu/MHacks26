import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/trends/metric-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { GroupSection } from "@/components/dashboard/rise";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { localDay } from "@/lib/briefing";
import { addDays, zoneOrDefault } from "@/lib/calendar-week";
import { getDailyMetricRows, getLatestTwin } from "@/lib/queries";
import { requireOnboarded } from "@/lib/session";
import { CATEGORIES, RANGES, buildTrends, parseRange, type Trend } from "@/lib/trends";
import { readTwin } from "@/lib/twin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Trends" };
export const dynamic = "force-dynamic";

type Params = Promise<{ range?: string | string[] }>;

export default async function TrendsPage({ searchParams }: { searchParams: Params }) {
  const { user, profile } = await requireOnboarded();
  const range = parseRange((await searchParams).range);
  const today = localDay(zoneOrDefault(profile.timezone));

  let trends: Trend[] | undefined;
  try {
    const [rows, twin] = await Promise.all([
      getDailyMetricRows(user.id, addDays(today, -(2 * range - 1))),
      getLatestTwin(user.id),
    ]);
    trends = buildTrends(rows, today, range, twin ? readTwin(twin.model).baselines : {});
  } catch (err) {
    console.error("TrendsPage failed", err);
  }

  return (
    <>
      <PageHeader eyebrow="Vitals" title="Trends" className="mb-8">
        Daily values from your wearable. The shaded band is your usual range.
      </PageHeader>

      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Time range" className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/trends?range=${r}`}
              scroll={false}
              aria-current={r === range ? "page" : undefined}
              className={cn(
                "inline-flex h-7 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none",
                "hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/70",
                r === range && "bg-muted text-foreground",
              )}
            >
              {r} days
            </Link>
          ))}
        </nav>
        <Button asChild variant="outline">
          <Link href="/share">Share with clinician</Link>
        </Button>
      </div>

      {!trends && (
        <ErrorNote className="max-w-[60ch]">Could not load your trends. Reload the page to try again.</ErrorNote>
      )}

      {trends && trends.every((t) => t.latest === null) && (
        <EmptyState title="No vitals yet">
          Connect a device or start the Apple Watch simulator. Your daily values show here.
        </EmptyState>
      )}

      {trends && trends.some((t) => t.latest !== null) && (
        <div className="space-y-6">
          {CATEGORIES.map((c) => {
            // A metric with no data in the range stays out. A category with none left loses its heading.
            const have = c.metrics.flatMap((key) => {
              const t = trends.find((x) => x.key === key);
              return t && t.latest !== null ? [t] : [];
            });
            if (have.length === 0) return null;
            return (
              <GroupSection key={c.id} title={c.title} headingId={`tr-${c.id}`}>
                <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {have.map((trend, i) => (
                    <MetricCard key={trend.key} trend={trend} color={c.color} range={range} today={today} index={i} />
                  ))}
                </ul>
              </GroupSection>
            );
          })}
        </div>
      )}
    </>
  );
}
