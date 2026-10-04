import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { BedDouble, ChevronRight, Flame, Footprints, Heart, HeartPulse, Timer, Wind, type LucideIcon } from "lucide-react";
import { CountUp } from "@/components/vitals/count-up";
import { Sparkline } from "@/components/vitals/sparkline";
import { StatusPill } from "@/components/vitals/status-pill";
import { formatValue } from "@/lib/metrics";
import type { Trend } from "@/lib/trends";
import { CATEGORY_COLORS, cardStatus, categoryOf, compareLine, dayLabel } from "@/lib/vitals-card";
import { cn } from "@/lib/utils";
import "./vitals.css";

export const METRIC_ICON: Record<string, LucideIcon> = {
  resting_heart_rate: Heart,
  hrv_sdnn: HeartPulse,
  sleep_total_min: BedDouble,
  steps: Footprints,
  active_minutes: Timer,
  spo2: Wind,
  active_energy_kcal: Flame,
};

/**
 * One vitals card in the Apple Health style. With `href` the whole card is a link.
 * `chart` replaces the sparkline, for the Trends page.
 */
export function MetricCard({
  trend,
  range,
  today,
  href,
  chart,
  average = false,
  index = 0,
  className,
}: {
  trend: Trend;
  range: number;
  today: string;
  href?: string;
  chart?: ReactNode;
  /** Adds a line with the average of the range. */
  average?: boolean;
  /** Position in the grid, for the staggered entrance. */
  index?: number;
  className?: string;
}) {
  const Icon = METRIC_ICON[trend.key] ?? Heart;
  const { color, ink } = CATEGORY_COLORS[categoryOf(trend.key)];
  const latest = trend.latest;
  const status = cardStatus(trend);
  const delta = compareLine(trend, range);
  const empty = latest === null;
  const nums = trend.points.map((p) => p.value).filter((v): v is number => v !== null);
  const label = nums.length
    ? `${trend.label}, last ${trend.points.length} days. Low ${formatValue(trend.key, Math.min(...nums))}, high ${formatValue(trend.key, Math.max(...nums))}${trend.unit ? ` ${trend.unit}` : ""}.`
    : undefined;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold" style={{ color: ink }}>
          <Icon className="size-4 shrink-0" style={{ color }} aria-hidden="true" />
          <span className="truncate">{trend.label}</span>
        </h3>
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
          {!empty && <span className="max-sm:hidden">{dayLabel(trend.latestDay, today)}</span>}
          {href && <ChevronRight className="size-3.5" aria-hidden="true" />}
        </span>
      </div>

      {empty ? (
        <>
          <p className="mt-3 text-[1.75rem] leading-8 font-bold text-muted-foreground" aria-hidden="true">
            &mdash;
          </p>
          <p className="mt-1 text-xs text-muted-foreground">No data in the last {range} days.</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-[1.75rem] leading-8 font-bold tracking-tight">
            <CountUp metricKey={trend.key} value={latest} unit={trend.unit} />
          </p>
          <p className="mt-1 min-h-4 text-xs text-muted-foreground">
            {delta ?? "Not enough earlier data to compare."}
          </p>
          {average && trend.avg !== null && (
            <p className="text-xs text-muted-foreground">
              {range}-day average {formatValue(trend.key, trend.avg)}
              {trend.unit && trend.key !== "sleep_total_min" ? ` ${trend.unit}` : ""}
            </p>
          )}
          <div className="mt-2 min-h-5">{status && <StatusPill tone={status.tone} direction={status.direction} />}</div>
          <div className="mt-3">
            {chart ?? <Sparkline values={trend.points.map((p) => p.value)} band={trend.band} color={color} label={label} />}
          </div>
        </>
      )}
    </>
  );

  return (
    <li id={trend.key} className="pulse-rise scroll-mt-6 print:break-inside-avoid" style={{ "--i": index } as CSSProperties}>
      <div
        className={cn(
          "h-full rounded-lg border border-border bg-card transition-[transform,border-color] duration-150",
          href && "hover:-translate-y-px hover:border-[#C7C7CC] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          className,
        )}
      >
        {href ? (
          <Link
            href={href}
            className="block h-full rounded-lg p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {body}
          </Link>
        ) : (
          <div className="p-4">{body}</div>
        )}
      </div>
    </li>
  );
}
