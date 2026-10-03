"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui-bits";
import type { VitalPoint } from "@/lib/vitals";

function clock(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function HrSparkline({ series }: { series: VitalPoint[] }) {
  if (series.length === 0) {
    return (
      <EmptyState title="Waiting for your first vitals">
        Connect a device or start the Apple Watch simulator. Your heart rate for the last 3 hours
        shows here.
      </EmptyState>
    );
  }

  const latest = series[series.length - 1];
  const values = series.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  return (
    <figure>
      <div className="flex items-baseline gap-3">
        <p className="font-mono text-3xl">{Math.round(latest.value)}</p>
        <p className="text-sm text-muted-foreground">bpm at {clock(latest.ts)}</p>
      </div>
      <div
        className="mt-3 h-32 w-full"
        role="img"
        aria-label={`Heart rate, last 3 hours. Latest ${Math.round(latest.value)} bpm. Low ${Math.round(lo)}, high ${Math.round(hi)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="ts" hide />
            <YAxis domain={[Math.floor(lo - 5), Math.ceil(hi + 5)]} hide />
            <Tooltip
              formatter={(v) => [`${Math.round(Number(v))} bpm`, "Heart rate"]}
              labelFormatter={(l) => clock(String(l))}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--foreground)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-xs text-muted-foreground">
        Low {Math.round(lo)} bpm, high {Math.round(hi)} bpm
      </figcaption>
    </figure>
  );
}
