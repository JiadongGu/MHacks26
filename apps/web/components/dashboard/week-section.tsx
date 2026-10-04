// Async Server Component. Small seven-day charts (the full Trends page has the long ranges) of the numbers that move slowly: sleep, steps, resting heart
// rate and heart rate variability. Hidden numbers are left out, like in the side panel.
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { DEFAULT_TIMEZONE, localDay } from "@/lib/briefing";
import { cleanHidden } from "@/lib/metrics";
import { getDailyMetricRows } from "@/lib/queries";
import Link from "next/link";
import { buildTrends, linePoints } from "@/lib/week-charts";
import { CATEGORY_COLORS, categoryOf } from "@/lib/vitals-card";

function daysAgo(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const W = 160;
const H = 56;

export async function WeekSection({
  userId,
  timeZone,
  hidden,
}: {
  userId: string;
  timeZone: string | null;
  hidden: string[] | null;
}) {
  let rows;
  try {
    rows = await getDailyMetricRows(userId, daysAgo(localDay(timeZone || DEFAULT_TIMEZONE), 6));
  } catch (err) {
    console.error("WeekSection failed", err);
    return <ErrorNote>Could not load your trends. Reload the page to try again.</ErrorNote>;
  }
  const trends = buildTrends(rows, cleanHidden(hidden ?? [])).filter((t) => t.values.length > 0);
  if (trends.length === 0) {
    return <EmptyState title="No trends yet">Once your watch has a couple of days of data, charts appear here.</EmptyState>;
  }
  return (
    <>
    <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      {trends.map((t) => {
        const hi = Math.max(...t.values, 1);
        const { color, ink } = CATEGORY_COLORS[categoryOf(t.key)];
        return (
          <li key={t.key}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold" style={{ color: ink }}>
                {t.label}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {t.latest}
                {t.unit && <span className="ml-1 text-xs text-muted-foreground">{t.unit}</span>}
              </p>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="mt-2 h-14 w-full"
              role="img"
              aria-label={`${t.label}, last ${t.values.length} days. Latest ${t.latest}. Low ${t.low}, high ${t.high}.`}
            >
              {t.kind === "bars" ? (
                t.values.map((v, i) => {
                  const bw = W / 7 - 4;
                  const h = Math.max(3, (v / hi) * (H - 4));
                  return (
                    <rect
                      key={i}
                      x={i * (W / 7) + 2}
                      y={H - h}
                      width={bw}
                      height={h}
                      rx={2}
                      fill={color}
                      fillOpacity={i === t.values.length - 1 ? 1 : 0.55}
                    />
                  );
                })
              ) : (
                <polyline
                  points={linePoints(t.values, W, H)}
                  fill="none"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  stroke={color}
                />
              )}
            </svg>
            <p className="mt-1 text-xs text-muted-foreground">
              Low {t.low}, high {t.high}
            </p>
          </li>
        );
      })}
    </ul>
    <p className="mt-4 text-xs text-muted-foreground">
      <Link href="/trends" className="font-medium text-primary underline-offset-4 hover:underline">
        See longer trends
      </Link>
    </p>
    </>
  );
}
