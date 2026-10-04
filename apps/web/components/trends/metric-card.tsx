import { CircleCheck, TrendingDown, TrendingUp } from "lucide-react";
import { TrendChart } from "@/components/trends/trend-chart";
import { formatValue } from "@/lib/metrics";
import { STATUS_LABEL, signed, type Status, type Trend } from "@/lib/trends";

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

function Value({ trend, value }: { trend: Trend; value: number }) {
  return (
    <>
      {formatValue(trend.key, value)}
      {trend.unit && <span className="ml-1 text-sm text-muted-foreground">{trend.unit}</span>}
    </>
  );
}

export function MetricCard({ trend, color, range }: { trend: Trend; color: string; range: number }) {
  const { ref, delta } = trend;
  return (
    <li className="rounded-lg border border-border bg-card p-4 print:break-inside-avoid">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: color }} />
          {trend.label}
        </h3>
        {trend.status && <StatusChip status={trend.status} />}
      </div>

      {trend.latest === null || trend.avg === null ? (
        <p className="mt-4 text-sm text-muted-foreground">No data in the last {range} days.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <dt className="text-xs text-muted-foreground">Latest</dt>
              <dd className="font-mono text-2xl">
                <Value trend={trend} value={trend.latest} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{range}-day average</dt>
              <dd className="font-mono text-2xl">
                <Value trend={trend} value={trend.avg} />
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-muted-foreground">
            {ref && delta !== null
              ? `${signed(delta, (n) => formatValue(trend.key, n))}${trend.unit && trend.key !== "sleep_total_min" ? ` ${trend.unit}` : ""} vs ${
                  ref.kind === "baseline" ? "your baseline" : `the previous ${range} days`
                }`
              : "Not enough earlier data to compare."}
          </p>
          <div className="mt-4">
            <TrendChart
              metricKey={trend.key}
              label={trend.label}
              unit={trend.unit}
              color={color}
              kind={trend.agg === "sum" ? "bar" : "line"}
              points={trend.points}
              band={trend.band}
            />
          </div>
        </>
      )}
    </li>
  );
}
