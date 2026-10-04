"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState, ErrorNote, ListSkeleton } from "@/components/ui-bits";
import { agent, errorText, me } from "@/lib/api-client";
import type { Goal } from "@/lib/contracts";
import {
  GOAL_METRICS,
  describeGoal,
  metricInfo,
  validateGoal,
  type GoalDirection,
  type GoalPeriod,
} from "@/lib/goals";
import type { GoalView } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Draft = { target: string; period: GoalPeriod; direction: GoalDirection };

const toView = (g: Goal): GoalView => ({
  id: g.id,
  metric: g.metric,
  target: g.target,
  period: g.period,
  direction: g.direction,
  active: g.active ?? true,
});

export function GoalsManager({ initial }: { initial?: GoalView[] }) {
  const [goals, setGoals] = useState<GoalView[] | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initial === undefined);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(async () => {
    try {
      const list = await agent<Goal[]>("/goals?include_inactive=true");
      setGoals(list.map(toView));
      setError(null);
    } catch (err) {
      const text = errorText(err);
      setError(text);
      toast.error(`Could not load goals: ${text}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial !== undefined) return;
    let live = true;
    agent<Goal[]>("/goals?include_inactive=true")
      .then((list) => {
        if (!live) return;
        setGoals(list.map(toView));
        setLoading(false);
      })
      .catch((err) => {
        if (!live) return;
        const text = errorText(err);
        setError(text);
        setLoading(false);
        toast.error(`Could not load goals: ${text}`);
      });
    return () => {
      live = false;
    };
  }, [initial, attempt]);

  async function patch(id: string, body: Record<string, unknown>, done: string) {
    setBusy(id);
    try {
      await me(`/goals/${id}`, { method: "PATCH", body });
      toast.success(done);
      setEditing(null);
      await reload();
    } catch (err) {
      toast.error(`Could not update the goal: ${errorText(err)}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <ListSkeleton label="Loading goals" />;
  if (error && !goals) {
    return (
      <ErrorNote
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        }
      >
        Could not load your goals. {error}
      </ErrorNote>
    );
  }

  const list = goals ?? [];
  const active = list.filter((g) => g.active);
  const inactive = list.filter((g) => !g.active);

  return (
    <div className="space-y-8">
      <div>
        {list.length === 0 ? (
          <EmptyState title="No goals yet">
            A goal is a target Pulse tracks for you, like 8,000 steps a day. Add your first one below.
          </EmptyState>
        ) : (
          <>
            <GoalList
              label="Active goals"
              goals={active}
              editing={editing}
              busy={busy}
              onEdit={setEditing}
              onSave={(g, d) =>
                void patch(g.id, { target: Number(d.target), period: d.period, direction: d.direction }, "Goal updated.")
              }
              onToggle={(g) =>
                void patch(g.id, { active: !g.active }, g.active ? "Goal turned off." : "Goal turned on.")
              }
            />
            {inactive.length > 0 && (
              <div className="mt-6">
                <GoalList
                  label="Turned off"
                  goals={inactive}
                  editing={editing}
                  busy={busy}
                  onEdit={setEditing}
                  onSave={(g, d) =>
                    void patch(g.id, { target: Number(d.target), period: d.period, direction: d.direction }, "Goal updated.")
                  }
                  onToggle={(g) => void patch(g.id, { active: true }, "Goal turned on.")}
                />
              </div>
            )}
          </>
        )}
      </div>
      <AddGoal onAdded={reload} />
    </div>
  );
}

function GoalList({
  label,
  goals,
  editing,
  busy,
  onEdit,
  onSave,
  onToggle,
}: {
  label: string;
  goals: GoalView[];
  editing: string | null;
  busy: string | null;
  onEdit: (id: string | null) => void;
  onSave: (g: GoalView, d: Draft) => void;
  onToggle: (g: GoalView) => void;
}) {
  if (goals.length === 0) return null;
  return (
    <section aria-label={label}>
      <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</h3>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {goals.map((g) => (
          <GoalRow
            key={`${g.id}-${g.target}-${g.period}-${g.direction}`}
            goal={g}
            editing={editing === g.id}
            busy={busy === g.id}
            onEdit={onEdit}
            onSave={onSave}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </section>
  );
}

function GoalRow({
  goal,
  editing,
  busy,
  onEdit,
  onSave,
  onToggle,
}: {
  goal: GoalView;
  editing: boolean;
  busy: boolean;
  onEdit: (id: string | null) => void;
  onSave: (g: GoalView, d: Draft) => void;
  onToggle: (g: GoalView) => void;
}) {
  const info = metricInfo(goal.metric);
  const [draft, setDraft] = useState<Draft>({
    target: String(goal.target),
    period: goal.period,
    direction: goal.direction,
  });
  const problem = validateGoal({ metric: goal.metric, target: Number(draft.target) });

  return (
    <li className="reveal px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className={cn("text-base font-medium", !goal.active && "text-muted-foreground")}>{info.label}</p>
          <p className="num text-sm text-muted-foreground">
            {describeGoal(goal)}
            {!goal.active && " (off)"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-expanded={editing}
            aria-label={`${editing ? "Close editor for" : "Edit"} ${info.label} goal`}
            onClick={() => onEdit(editing ? null : goal.id)}
          >
            {editing ? "Close" : "Edit"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={`${goal.active ? "Turn off" : "Turn on"} ${info.label} goal`}
            onClick={() => onToggle(goal)}
          >
            {goal.active ? "Turn off" : "Turn on"}
          </Button>
        </div>
      </div>
      {editing && (
        <form
          className="mt-4 grid items-end gap-3 sm:grid-cols-[8rem_8rem_8rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) onSave(goal, draft);
          }}
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={`t-${goal.id}`} className="text-sm font-medium">
              Target ({info.unit})
            </label>
            <Input
              id={`t-${goal.id}`}
              type="number"
              min={1}
              value={draft.target}
              aria-invalid={problem ? true : undefined}
              onChange={(e) => setDraft({ ...draft, target: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`p-${goal.id}`} className="text-sm font-medium">
              Period
            </label>
            <NativeSelect
              id={`p-${goal.id}`}
              value={draft.period}
              onChange={(e) => setDraft({ ...draft, period: e.target.value as GoalPeriod })}
            >
              <option value="day">Per day</option>
              <option value="week">Per week</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`d-${goal.id}`} className="text-sm font-medium">
              Direction
            </label>
            <NativeSelect
              id={`d-${goal.id}`}
              value={draft.direction}
              onChange={(e) => setDraft({ ...draft, direction: e.target.value as GoalDirection })}
            >
              <option value="at_least">At least</option>
              <option value="at_most">At most</option>
            </NativeSelect>
          </div>
          <Button type="submit" disabled={busy || problem !== null}>
            {busy ? "Saving..." : "Save"}
          </Button>
          {problem && <p className="text-xs text-destructive sm:col-span-4">{problem}</p>}
        </form>
      )}
    </li>
  );
}

function AddGoal({ onAdded }: { onAdded: () => Promise<void> }) {
  const [metric, setMetric] = useState(GOAL_METRICS[0].metric);
  const [target, setTarget] = useState("");
  const [period, setPeriod] = useState<GoalPeriod>("day");
  const [direction, setDirection] = useState<GoalDirection>("at_least");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const problem = validateGoal({ metric, target: Number(target) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    setBusy(true);
    try {
      await agent("/goals", { body: { metric, target: Number(target), period, direction } });
      toast.success("Goal added.");
      setTarget("");
      setTouched(false);
      await onAdded();
    } catch (err) {
      toast.error(`Could not add the goal: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="add-goal" className="rounded-lg border border-border bg-card p-4 md:p-5">
      <h2 id="add-goal" className="mb-4 text-xl">
        Add a goal
      </h2>
      <form onSubmit={submit} noValidate className="grid items-start gap-4 sm:grid-cols-[1fr_8rem_8rem_8rem_auto]">
        <div className="flex flex-col gap-2">
          <label htmlFor="g-metric" className="text-sm font-medium">
            Metric
          </label>
          <NativeSelect id="g-metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
            {GOAL_METRICS.map((m) => (
              <option key={m.metric} value={m.metric}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="g-target" className="text-sm font-medium">
            Target ({metricInfo(metric).unit})
          </label>
          <Input
            id="g-target"
            type="number"
            inputMode="decimal"
            min={1}
            value={target}
            aria-invalid={touched && problem ? true : undefined}
            aria-describedby={touched && problem ? "g-target-error" : undefined}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="g-period" className="text-sm font-medium">
            Period
          </label>
          <NativeSelect id="g-period" value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)}>
            <option value="day">Per day</option>
            <option value="week">Per week</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="g-direction" className="text-sm font-medium">
            Direction
          </label>
          <NativeSelect
            id="g-direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as GoalDirection)}
          >
            <option value="at_least">At least</option>
            <option value="at_most">At most</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <span aria-hidden="true" className="hidden h-[14px] sm:block" />
          <Button type="submit" disabled={busy}>
            <Plus aria-hidden="true" />
            {busy ? "Adding..." : "Add goal"}
          </Button>
        </div>
        {touched && problem && (
          <p id="g-target-error" className="text-xs text-destructive sm:col-span-5">
            {problem}
          </p>
        )}
      </form>
    </section>
  );
}
