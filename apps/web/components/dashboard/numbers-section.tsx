// Async Server Component. "Vitals today": one Apple Health style card per number the person has not hidden.
import Link from "next/link";
import { MetricCard } from "@/components/vitals/metric-card";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { DEFAULT_TIMEZONE, localDay } from "@/lib/briefing";
import { addDays } from "@/lib/calendar-week";
import { cleanHidden } from "@/lib/metrics";
import { getDailyMetricRows, getLatestTwin } from "@/lib/queries";
import { buildTrends } from "@/lib/trends";
import { readTwin } from "@/lib/twin";

const RANGE = 7;

export async function NumbersSection({
  userId,
  timeZone,
  hidden,
}: {
  userId: string;
  timeZone: string | null;
  hidden: string[] | null;
}) {
  const today = localDay(timeZone || DEFAULT_TIMEZONE);
  const off = cleanHidden(hidden ?? []);
  let trends;
  try {
    const [rows, twin] = await Promise.all([
      getDailyMetricRows(userId, addDays(today, -(2 * RANGE - 1))),
      getLatestTwin(userId).catch(() => null),
    ]);
    trends = buildTrends(rows, today, RANGE, twin ? readTwin(twin.model).baselines : {});
  } catch (err) {
    console.error("NumbersSection failed", err);
    return <ErrorNote>Could not load your numbers. Reload the page to try again.</ErrorNote>;
  }
  const visible = trends.filter((t) => !off.includes(t.key));
  // A metric with no data stays out of the grid. It returns when the watch sends data.
  const shown = visible.filter((t) => t.latest !== null);
  if (visible.length === 0) {
    return (
      <EmptyState title="All number cards are hidden">
        Turn them back on in{" "}
        <Link href="/settings" className="underline underline-offset-4">
          settings
        </Link>
        .
      </EmptyState>
    );
  }
  if (shown.length === 0) {
    return (
      <EmptyState title="No vitals yet">
        Connect a device or start the Apple Watch simulator. Your numbers show here.
      </EmptyState>
    );
  }
  return (
    <div className="@container">
      <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
        {shown.map((t, i) => (
          <MetricCard key={t.key} trend={t} range={RANGE} today={today} href={`/trends#${t.key}`} index={i} />
        ))}
      </ul>
    </div>
  );
}
