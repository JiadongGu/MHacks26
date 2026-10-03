"use client";

import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { agent } from "@/lib/api-client";
import type { Goal, GoalProgress } from "@/lib/contracts";
import { formatMetricValue, metricInfo, ringGeometry } from "@/lib/goals";
import { usePolling } from "@/lib/use-polling";

type Loaded = { goals: Goal[]; progress: GoalProgress[] };

async function load(): Promise<Loaded> {
  const [goals, progress] = await Promise.all([
    agent<Goal[]>("/goals"),
    agent<GoalProgress[]>("/goals/progress"),
  ]);
  return { goals, progress };
}

export function Ring({ pct, size = 88, label }: { pct: number; size?: number; label: string }) {
  const g = ringGeometry(pct, 36);
  return (
    <svg
      viewBox="0 0 88 88"
      width={size}
      height={size}
      role="img"
      aria-label={`${label}: ${Math.round(g.pct)} percent`}
      className="shrink-0 -rotate-90"
    >
      <circle cx="44" cy="44" r={g.radius} fill="none" strokeWidth="7" className="stroke-muted" />
      <circle
        cx="44"
        cy="44"
        r={g.radius}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={g.circumference}
        strokeDashoffset={g.offset}
        className="stroke-foreground motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500"
      />
      <text
        x="44"
        y="44"
        textAnchor="middle"
        dominantBaseline="central"
        transform="rotate(90 44 44)"
        className="fill-foreground font-mono text-[18px]"
      >
        {Math.round(g.pct)}%
      </text>
    </svg>
  );
}

export function GoalRings() {
  const { data, error, loading, refresh } = usePolling(load, {
    label: "Goal progress",
    intervalMs: 60_000,
  });

  if (loading) {
    return (
      <div role="status" aria-label="Loading goal progress" className="grid grid-cols-2 gap-4">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <ErrorNote
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        }
      >
        Could not load goal progress. {error}
      </ErrorNote>
    );
  }

  const byId = new Map((data?.goals ?? []).map((g) => [g.id, g]));
  const rows = (data?.progress ?? []).flatMap((p) => {
    const goal = byId.get(p.goal_id);
    return goal ? [{ goal, p }] : [];
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No goals to track"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/goals">Set a goal</Link>
          </Button>
        }
      >
        Add a goal and its progress shows here.
      </EmptyState>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6">
      {rows.map(({ goal, p }) => {
        const info = metricInfo(goal.metric);
        return (
          <li key={goal.id} className="flex flex-col items-start gap-2">
            <Ring pct={p.pct} label={info.label} />
            <div>
              <p className="text-sm font-medium">{info.label}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatMetricValue(goal.metric, p.current)} of{" "}
                {formatMetricValue(goal.metric, goal.target)}
                {goal.period === "week" ? " this week" : " today"}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs">
                {p.on_track ? (
                  <>
                    <Check className="size-3" aria-hidden="true" /> On track
                  </>
                ) : (
                  <>
                    <Clock className="size-3" aria-hidden="true" /> Behind
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
