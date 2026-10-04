import { CircleCheck, TrendingDown, TrendingUp } from "lucide-react";
import { MetricCard as VitalCard } from "@/components/vitals/metric-card";
import { TrendChart } from "@/components/trends/trend-chart";
import { STATUS_LABEL, type Status, type Trend } from "@/lib/trends";

const STATUS_ICON = { in_range: CircleCheck, above: TrendingUp, below: TrendingDown } as const;

export function StatusChip({ status }: { status: Status }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-md border border-border px-1.5 text-xs font-medium">
      <Icon className="size-3" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** The shared vitals card with the long chart in place of the sparkline. */
export function MetricCard({
  trend,
  color,
  range,
  today,
  index,
}: {
  trend: Trend;
  color: string;
  range: number;
  today: string;
  index?: number;
}) {
  return (
    <VitalCard
      trend={trend}
      range={range}
      today={today}
      average
      index={index}
      chart={
        <TrendChart
          metricKey={trend.key}
          label={trend.label}
          unit={trend.unit}
          color={color}
          kind={trend.agg === "sum" ? "bar" : "line"}
          points={trend.points}
          band={trend.band}
        />
      }
    />
  );
}
