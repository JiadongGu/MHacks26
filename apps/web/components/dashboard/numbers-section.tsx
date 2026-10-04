// Async Server Component. Compact side panel: one row per number the person has not hidden, with a tiny 7-day trend.
import Link from "next/link";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { DEFAULT_TIMEZONE, localDay } from "@/lib/briefing";
import { buildCards, cleanHidden } from "@/lib/metrics";
import { getDailyMetricRows } from "@/lib/queries";

function daysAgo(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function NumbersSection({
  userId,
  timeZone,
  hidden,
}: {
  userId: string;
  timeZone: string | null;
  hidden: string[] | null;
}) {
  const zone = timeZone || DEFAULT_TIMEZONE;
  const off = cleanHidden(hidden ?? []);
  let rows;
  try {
    rows = await getDailyMetricRows(userId, daysAgo(localDay(zone), 6));
  } catch (err) {
    console.error("NumbersSection failed", err);
    return <ErrorNote>Could not load your numbers. Reload the page to try again.</ErrorNote>;
  }
  const cards = buildCards(rows, off);
  if (cards.length === 0) {
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
  return (
    <>
      <ul className="divide-y divide-border">
        {cards.map((c) => {
          const max = Math.max(...c.trend, 1);
          return (
            <li key={c.key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">{c.label}</p>
                {c.value === null ? (
                  <p className="text-xs text-muted-foreground">No data yet</p>
                ) : (
                  <p className="font-mono text-base">
                    {c.value}
                    {c.unit && <span className="ml-1 text-xs text-muted-foreground">{c.unit}</span>}
                  </p>
                )}
              </div>
              {c.value !== null && (
                <div
                  className="flex h-6 shrink-0 items-end gap-0.5"
                  role="img"
                  aria-label={`${c.label}, last ${c.trend.length} days`}
                >
                  {c.trend.map((v, i) => (
                    <span
                      key={i}
                      className="w-1.5 rounded-sm bg-foreground/60"
                      style={{ height: `${Math.max(10, Math.round((v / max) * 100))}%` }}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Hide any in{" "}
        <Link href="/settings" className="underline underline-offset-4">
          settings
        </Link>
        .
      </p>
    </>
  );
}
