// Async Server Component. Reads the last week of daily numbers and shows one card per metric the person has not hidden.
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
      <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
        {cards.map((c) => {
          const max = Math.max(...c.trend, 1);
          return (
            <li key={c.key}>
              <p className="text-sm text-muted-foreground">{c.label}</p>
              {c.value === null ? (
                <p className="mt-1 text-sm text-muted-foreground">No data yet</p>
              ) : (
                <>
                  <p className="mt-1 font-mono text-2xl">
                    {c.value}
                    {c.unit && <span className="ml-1 text-sm text-muted-foreground">{c.unit}</span>}
                  </p>
                  <div className="mt-2 flex h-6 items-end gap-1" role="img" aria-label={`${c.label}, last ${c.trend.length} days`}>
                    {c.trend.map((v, i) => (
                      <span
                        key={i}
                        className="w-2 rounded-sm bg-foreground/70"
                        style={{ height: `${Math.max(8, Math.round((v / max) * 100))}%` }}
                      />
                    ))}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-xs text-muted-foreground">
        Hide any of these in{" "}
        <Link href="/settings" className="underline underline-offset-4">
          settings
        </Link>
        .
      </p>
    </>
  );
}
