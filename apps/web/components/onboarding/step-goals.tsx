"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNote } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import type { Goal } from "@/lib/contracts";
import {
  GOAL_PRESETS,
  formatMinutes,
  metricInfo,
  validateGoal,
  type GoalPreset,
} from "@/lib/goals";

type Row = { preset: GoalPreset; enabled: boolean; target: string; existing: boolean };

const keyOf = (g: { metric: string; period: string }) => `${g.metric}:${g.period}`;

export function StepGoals({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    agent<Goal[]>("/goals")
      .then((goals) => {
        if (!live) return;
        const have = new Set(goals.map(keyOf));
        setRows(
          GOAL_PRESETS.map((preset) => ({
            preset,
            enabled: !have.has(keyOf(preset)),
            target: String(preset.target),
            existing: have.has(keyOf(preset)),
          })),
        );
      })
      .catch((err) => {
        if (!live) return;
        const text = errorText(err);
        setLoadError(text);
        toast.error(`Could not load your goals: ${text}`);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...patch } : r)) : rs));
  }

  async function save() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.enabled && !r.existing);
    for (const r of chosen) {
      const problem = validateGoal({ metric: r.preset.metric, target: Number(r.target) });
      if (problem) {
        toast.error(`${metricInfo(r.preset.metric).label}: ${problem}`);
        return;
      }
    }
    setSaving(true);
    const results = await Promise.allSettled(
      chosen.map((r) =>
        agent<Goal>("/goals", {
          body: {
            metric: r.preset.metric,
            target: Number(r.target),
            period: r.preset.period,
            direction: r.preset.direction,
          },
        }),
      ),
    );
    setSaving(false);
    const failed = results.flatMap((res, i) => (res.status === "rejected" ? [{ i, res }] : []));
    if (failed.length > 0) {
      for (const { i, res } of failed) {
        toast.error(`${metricInfo(chosen[i].preset.metric).label}: ${errorText(res.reason)}`);
      }
      // Mark the saved ones as existing so a retry does not make duplicates.
      setRows(
        rows.map((r) => {
          const idx = chosen.indexOf(r);
          return idx >= 0 && results[idx].status === "fulfilled" ? { ...r, existing: true } : r;
        }),
      );
      return;
    }
    if (chosen.length > 0) toast.success("Goals saved.");
    onDone();
  }

  if (loadError && !rows) {
    return (
      <ErrorNote
        className="max-w-xl"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoadError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        }
      >
        Could not load your goals. {loadError}
      </ErrorNote>
    );
  }
  if (!rows) return <Skeleton role="status" aria-label="Loading goals" className="h-64 max-w-xl" />;

  return (
    <div className="max-w-xl space-y-8">
      <ul className="divide-y divide-border border-y border-border">
        {rows.map((r, i) => {
          const info = metricInfo(r.preset.metric);
          const id = `goal-${r.preset.metric}`;
          const n = Number(r.target);
          return (
            <li key={id} className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 py-4 sm:grid-cols-[auto_1fr_9rem]">
              <input
                id={`${id}-on`}
                type="checkbox"
                checked={r.enabled || r.existing}
                disabled={r.existing}
                onChange={(e) => update(i, { enabled: e.target.checked })}
                className="mt-1 size-4 accent-[var(--foreground)]"
              />
              <div className="min-w-0">
                <label htmlFor={`${id}-on`} className="text-base font-medium">
                  {info.label}
                </label>
                <p className="text-sm text-muted-foreground">
                  {r.preset.direction === "at_least" ? "At least" : "At most"} per {r.preset.period}
                  {r.existing && ". Already set."}
                </p>
              </div>
              <div className="col-start-2 sm:col-start-3">
                <label htmlFor={id} className="sr-only">
                  {info.label} target, {info.unit} per {r.preset.period}
                </label>
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={r.target}
                  disabled={!r.enabled || r.existing}
                  onChange={(e) => update(i, { target: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.preset.metric === "sleep_total_min" && Number.isFinite(n) && n > 0
                    ? `${formatMinutes(n)} per day`
                    : `${info.unit} per ${r.preset.period}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <Button size="lg" className="h-10 px-5" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving..." : "Save goals and continue"}
      </Button>
    </div>
  );
}
