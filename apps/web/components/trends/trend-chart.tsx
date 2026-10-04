"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatValue } from "@/lib/metrics";
import type { Band, Point } from "@/lib/trends";

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

/** Daily values as a line (averages) or bars (totals), with the normal band shaded behind them. */
export function TrendChart({
  metricKey,
  label,
  unit,
  color,
  kind,
  points,
  band,
}: {
  metricKey: string;
  label: string;
  unit: string;
  color: string;
  kind: "line" | "bar";
  points: Point[];
  band: Band | null;
}) {
  const yTick = (v: number) => (metricKey === "sleep_total_min" ? `${Math.round(v / 60)} h` : formatValue(metricKey, v));
  const domain = ([lo, hi]: readonly [number, number]): [number, number] => {
    const min = band ? Math.min(lo, band[0]) : lo;
    const max = band ? Math.max(hi, band[1]) : hi;
    return kind === "bar" ? [0, Math.ceil(max)] : [Math.floor(min), Math.ceil(max)];
  };
  const common = { data: points, margin: { top: 4, right: 4, bottom: 0, left: 0 } };
  const parts = [
    <CartesianGrid key="grid" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />,
    <XAxis
      key="x"
      dataKey="day"
      tickFormatter={dayLabel}
      tick={axis}
      tickLine={false}
      axisLine={false}
      minTickGap={32}
      interval="preserveStartEnd"
    />,
    <YAxis key="y" width={44} domain={domain} tickFormatter={yTick} tick={axis} tickLine={false} axisLine={false} />,
    band && (
      <ReferenceArea
        key="band"
        y1={band[0]}
        y2={band[1]}
        fill="var(--muted-foreground)"
        fillOpacity={0.14}
        ifOverflow="extendDomain"
      />
    ),
    <Tooltip
      key="tip"
      formatter={(v) => [`${formatValue(metricKey, Number(v))}${unit ? ` ${unit}` : ""}`, label]}
      labelFormatter={(l) => dayLabel(String(l))}
      cursor={{ stroke: "var(--border)" }}
      contentStyle={{
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        color: "var(--popover-foreground)",
        fontSize: 12,
      }}
    />,
  ];
  return (
    <div className="h-40 w-full print:h-32" role="img" aria-label={`${label}, daily values with the usual range shaded.`}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart {...common}>
            {parts}
            <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart {...common}>
            {parts}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
