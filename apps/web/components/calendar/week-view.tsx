// The week grid. A Server Component: it only draws what the page read from Neon.
// Wide screens show seven columns. Narrow screens show one row per day.
import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, HeartPulse, ListChecks, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dayHeading, type BlockKind, type WeekBlock } from "@/lib/calendar-week";
import { timeRange } from "@/lib/plan";
import { cn } from "@/lib/utils";

const KIND_CLASS: Record<BlockKind, string> = {
  own: "border border-border bg-card",
  pulse: "border border-border border-l-4 border-l-foreground bg-secondary",
  plan: "border border-transparent bg-muted",
  pending: "border border-dashed border-foreground/60 bg-background",
};

const KIND_LEGEND: { kind: BlockKind; label: string }[] = [
  { kind: "own", label: "Your calendar" },
  { kind: "pulse", label: "Pulse Health" },
  { kind: "plan", label: "Pulse plan" },
  { kind: "pending", label: "Waiting for your YES" },
];

function KindIcon({ block }: { block: WeekBlock }) {
  const cls = "mt-0.5 size-3.5 shrink-0";
  if (block.kind === "pulse") return <HeartPulse className={cls} aria-hidden="true" />;
  if (block.kind === "plan") return <ListChecks className={cls} aria-hidden="true" />;
  if (block.kind === "pending") return <CalendarCheck className={cls} aria-hidden="true" />;
  if (block.important) return <Star className={cls} aria-hidden="true" />;
  return null;
}

function Block({ block, timeZone }: { block: WeekBlock; timeZone: string }) {
  const inner = (
    <div className={cn("flex gap-2 rounded-md px-2 py-2", KIND_CLASS[block.kind])}>
      <KindIcon block={block} />
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{block.title}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {block.continued ? "Continued" : timeRange(block.start, block.end, timeZone)}
        </p>
        {block.note && <p className="text-xs text-muted-foreground">{block.note}</p>}
      </div>
    </div>
  );
  if (block.kind === "pending" && block.proposalId) {
    return (
      <Link
        href={`#proposal-${block.proposalId}`}
        className="block rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`${block.title}, waiting for your YES. Go to the approval list.`}
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

export function WeekNav({
  prev,
  next,
  thisWeek,
  label,
  isCurrent,
}: {
  prev: string;
  next: string;
  thisWeek: string;
  label: string;
  isCurrent: boolean;
}) {
  return (
    <nav aria-label="Week" className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="icon" aria-label="Previous week">
        <Link href={`/calendar?week=${prev}`} scroll={false}>
          <ChevronLeft aria-hidden="true" />
        </Link>
      </Button>
      <Button asChild variant="outline" size="icon" aria-label="Next week">
        <Link href={`/calendar?week=${next}`} scroll={false}>
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
      {!isCurrent && (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/calendar?week=${thisWeek}`} scroll={false}>
            This week
          </Link>
        </Button>
      )}
      <p className="ml-2 text-sm text-muted-foreground">{label}</p>
    </nav>
  );
}

export function WeekView({
  days,
  today,
  timeZone,
}: {
  days: { day: string; blocks: WeekBlock[] }[];
  today: string;
  timeZone: string;
}) {
  const total = days.reduce((n, d) => n + d.blocks.length, 0);
  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {KIND_LEGEND.map((l) => (
          <li key={l.kind} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("inline-block h-3 w-5 rounded-sm", KIND_CLASS[l.kind])} />
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <Star className="size-3" aria-hidden="true" />
          Important event
        </li>
      </ul>

      {total === 0 && (
        <p className="mb-4 max-w-[60ch] rounded-lg border border-dashed border-border px-4 py-3 text-sm">
          Nothing on the calendar this week. Events appear here after Google Calendar syncs. Pulse blocks appear when
          you approve a proposal or when the morning plan runs.
        </p>
      )}

      <ol className="grid gap-4 xl:grid-cols-7 xl:gap-2">
        {days.map(({ day, blocks }) => {
          const h = dayHeading(day);
          const isToday = day === today;
          return (
            <li
              key={day}
              aria-current={isToday ? "date" : undefined}
              className="grid gap-2 border-t border-border pt-2 md:grid-cols-[6rem_minmax(0,1fr)] xl:grid-cols-1 xl:content-start"
            >
              <h3 className="flex items-baseline gap-2 text-sm font-medium xl:min-h-8">
                <span className="sr-only">{h.long}</span>
                <span aria-hidden="true">
                  {h.weekday} <span className="font-mono">{h.date}</span>
                </span>
                {isToday && (
                  <span className="rounded-md border border-foreground px-1.5 text-xs font-medium">Today</span>
                )}
              </h3>
              {blocks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Free</p>
              ) : (
                <ul className="space-y-2">
                  {blocks.map((b) => (
                    <li key={`${day}-${b.key}`}>
                      <Block block={b} timeZone={timeZone} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
