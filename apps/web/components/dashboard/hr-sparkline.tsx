"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { me } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import {
  DEFAULT_HOURS,
  isOlderThan,
  summarizeSeries,
  type VitalTile,
  type VitalsPayload,
} from "@/lib/vitals-math";

const REFRESH_MS = 15_000;
const STALE_MINUTES = 10;

function clock(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const load = () => me<VitalsPayload>(`/vitals?metric=heart_rate&hours=${DEFAULT_HOURS}`);

/**
 * Heart rate panel. The server render gives `initial`. The panel then reloads every 15 seconds.
 * Without `initial` (the server read failed) it loads on mount.
 */
export function HrSparkline({ initial }: { initial?: VitalsPayload }) {
  const { data, error, loading, refresh } = usePolling(load, {
    label: "Heart rate",
    intervalMs: REFRESH_MS,
    initial,
  });

  if (!data) {
    if (error) {
      return (
        <ErrorNote
          action={
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          }
        >
          Could not load heart rate. {error}
        </ErrorNote>
      );
    }
    if (loading) {
      return <Skeleton role="status" aria-label="Loading heart rate" className="h-40" />;
    }
  }

  const series = data?.series ?? [];
  const summary = summarizeSeries(series);

  if (!summary) {
    return (
      <EmptyState title="Waiting for your first vitals">
        Connect a device or start the Apple Watch simulator. Your heart rate for the last {DEFAULT_HOURS}{" "}
        hours shows here.
      </EmptyState>
    );
  }

  const { current, min, max } = summary;
  const stale = isOlderThan(current.ts, new Date(), STALE_MINUTES);

  return (
    <div>
      {error && (
        <ErrorNote
          className="mb-4"
          action={
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          }
        >
          Could not refresh. Showing the last reading. {error}
        </ErrorNote>
      )}
      <figure>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="font-mono text-3xl">{Math.round(current.value)}</p>
          <p className="text-sm text-muted-foreground">
            bpm at {clock(current.ts)}
            {stale ? ", no newer reading" : ""}
          </p>
        </div>
        <div
          className="mt-3 h-32 w-full"
          role="img"
          aria-label={`Heart rate, last ${DEFAULT_HOURS} hours. Latest ${Math.round(current.value)} bpm. Low ${Math.round(min)}, high ${Math.round(max)}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="ts" hide />
              <YAxis domain={[Math.floor(min - 5), Math.ceil(max + 5)]} hide />
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
          Low {Math.round(min)} bpm, high {Math.round(max)} bpm, last {DEFAULT_HOURS} hours. Updates every 15
          seconds.
        </figcaption>
      </figure>
      {data && data.tiles.length > 0 && <Tiles tiles={data.tiles} />}
    </div>
  );
}

function Tiles({ tiles }: { tiles: VitalTile[] }) {
  return (
    <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-t border-border pt-4">
      {tiles.map((t) => (
        <div key={t.key}>
          <dt className="text-xs text-muted-foreground">{t.label}</dt>
          <dd className="mt-1 font-mono text-xl">
            {t.text}
            {t.unit && <span className="ml-1 text-sm text-muted-foreground">{t.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
