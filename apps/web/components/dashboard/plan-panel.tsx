"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import {
  bedtimeLabel,
  itemState,
  onCalendar,
  planHeadline,
  timeRange,
  type PlanView,
} from "@/lib/plan";
import { cn } from "@/lib/utils";

/** Today's plan: the things Pulse fitted into the free time on the calendar. */
export function PlanPanel({
  plan,
  timeZone,
  nowIso,
}: {
  plan: PlanView | null;
  timeZone: string;
  /** The server's clock, so the first render matches the browser's. */
  nowIso: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  // Ticks the person made this visit, by item start, so the box responds before the save comes back.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  async function tick(start: string, done: boolean) {
    setTicked((t) => ({ ...t, [start]: done }));
    try {
      await agent("/plan/done", { body: { day: plan?.day, start, done } });
      startRefresh(() => router.refresh());
    } catch (err) {
      setTicked((t) => ({ ...t, [start]: !done }));
      toast.error(`Could not save that: ${errorText(err)}`);
    }
  }

  async function replan() {
    setBusy(true);
    try {
      await agent("/plan/rebuild?day=today", { method: "POST", body: {} });
      toast.success("Plan updated.");
      startRefresh(() => router.refresh());
    } catch (err) {
      toast.error(`Could not update the plan: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const button = (label: string) => (
    <Button variant="outline" size="sm" onClick={() => void replan()} disabled={busy || refreshing}>
      {busy || refreshing ? "Planning..." : label}
    </Button>
  );

  if (!plan) {
    return (
      <EmptyState title="No plan for today yet" action={button("Make today's plan")}>
        Pulse builds a plan each morning from your calendar and the areas you chose to focus on.
      </EmptyState>
    );
  }

  const now = new Date(nowIso);
  const bed = bedtimeLabel(plan.bed_time);
  return (
    <div className="max-w-xl">
      <p className="text-base">{planHeadline(plan.load)}</p>

      {plan.items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing to schedule. Choose what to focus on in setup and Pulse will fit it in.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border border-y border-border">
          {plan.items.map((item) => {
            const state = itemState(item, now);
            const done = ticked[item.start] ?? item.done === true;
            return (
              <li key={`${item.key}-${item.start}`} className="flex gap-4 py-3">
                <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                  {timeRange(item.start, item.end, timeZone)}
                </span>
                <div className={cn("min-w-0", done && "text-muted-foreground")}>
                  <label className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(e) => void tick(item.start, e.target.checked)}
                      className="size-4 accent-[var(--foreground)]"
                    />
                    <span className={cn(done && "line-through")}>{item.title}</span>
                    {state === "now" && (
                      <span className="rounded-full bg-foreground px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-background">
                        Now
                      </span>
                    )}
                  </label>
                  {item.why && <p className="text-xs text-muted-foreground">{item.why}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {bed && <p>Aim for lights out by {bed}.</p>}
          {onCalendar(plan.items) && (
            <p className="mt-1 flex items-center gap-1.5 text-xs">
              <CalendarCheck className="size-3.5" aria-hidden="true" />
              On your Pulse Health calendar
            </p>
          )}
        </div>
        {button("Replan now")}
      </div>
    </div>
  );
}
