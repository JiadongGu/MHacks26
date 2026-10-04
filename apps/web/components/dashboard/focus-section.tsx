// Async Server Component. One row per focus area: a bar for how far along today is, and a line saying how.
import Link from "next/link";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { DEFAULT_TIMEZONE, localDay } from "@/lib/briefing";
import { buildFocusRows } from "@/lib/focus-progress";
import { getDailyMetricRows, getDailyPlan, getFocusPicks, listGoals } from "@/lib/queries";

function daysAgo(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function FocusSection({ userId, timeZone }: { userId: string; timeZone: string | null }) {
  const today = localDay(timeZone || DEFAULT_TIMEZONE);
  let picks, goals, rows, plan;
  try {
    [picks, goals, rows, plan] = await Promise.all([
      getFocusPicks(userId),
      listGoals(userId),
      getDailyMetricRows(userId, daysAgo(today, 6)),
      getDailyPlan(userId, today),
    ]);
  } catch (err) {
    console.error("FocusSection failed", err);
    return <ErrorNote>Could not load your focus progress. Reload the page to try again.</ErrorNote>;
  }
  const out = buildFocusRows({ picks, goals, rows, today, items: plan?.items ?? [] });
  if (out.length === 0) {
    return (
      <EmptyState title="No focus areas yet">
        Pick up to three in{" "}
        <Link href="/onboarding" className="underline underline-offset-4">
          setup
        </Link>{" "}
        and Pulse will track them here.
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-5">
      {out.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium">{r.label}</p>
            {r.pct !== null && <p className="text-xs font-semibold tabular-nums">{Math.round(r.pct)}%</p>}
          </div>
          {r.pct !== null && (
            <div
              role="progressbar"
              aria-label={r.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(r.pct)}
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-foreground transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.round(r.pct)}%` }} />
            </div>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">{r.text}</p>
        </li>
      ))}
    </ul>
  );
}
