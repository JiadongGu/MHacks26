"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import { bedtimeLabel, itemState, onCalendar, planHeadline, type PlanItem, type PlanView } from "@/lib/plan";
import { clockLabel, durationLabel, minutesBetween } from "@/lib/vitals-card";
import { cn } from "@/lib/utils";

/** Today's plan as a timeline: the things Pulse fitted into the free time on the calendar. */
export function PlanPanel({
  plan,
  timeZone,
  nowIso,
  when = "today",
}: {
  plan: PlanView | null;
  timeZone: string;
  /** Which day this card shows. Tomorrow's card has no ticks to make yet, only a replan. */
  when?: "today" | "tomorrow";
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
      await agent(`/plan/rebuild?day=${when}`, { method: "POST", body: {} });
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
      <EmptyState title={`No plan for ${when} yet`} action={button(`Make ${when}'s plan`)}>
        Pulse builds a plan each morning from your calendar and the areas you chose to focus on.
      </EmptyState>
    );
  }

  const now = new Date(nowIso);
  const bed = bedtimeLabel(plan.bed_time);
  return (
    <div>
      <p className="text-sm text-muted-foreground">{planHeadline(plan.load, when)}</p>

      {plan.items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing to schedule. Choose what to focus on in setup and Pulse will fit it in.
        </p>
      ) : (
        <ol className="mt-4">
          {plan.items.map((item, i) => (
            <TimelineRow
              key={`${item.key}-${item.start}`}
              item={item}
              last={i === plan.items.length - 1}
              timeZone={timeZone}
              state={itemState(item, now)}
              done={ticked[item.start] ?? item.done === true}
              onTick={(done) => void tick(item.start, done)}
            />
          ))}
        </ol>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
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

function TimelineRow({
  item,
  last,
  timeZone,
  state,
  done,
  onTick,
}: {
  item: PlanItem;
  last: boolean;
  timeZone: string;
  state: "done" | "now" | "upcoming";
  done: boolean;
  onTick: (done: boolean) => void;
}) {
  const id = useId();
  const now = state === "now" && !done;
  return (
    <li className="grid grid-cols-[3.5rem_1.25rem_minmax(0,1fr)] gap-x-2.5">
      <span className="pt-0.5 text-right text-xs font-semibold tabular-nums text-muted-foreground">
        {clockLabel(item.start, timeZone)}
      </span>

      <div className="flex flex-col items-center">
        <input
          id={id}
          type="checkbox"
          checked={done}
          onChange={(e) => onTick(e.target.checked)}
          className="peer sr-only"
        />
        <label
          htmlFor={id}
          className={cn(
            "grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border-2 bg-card transition-colors outline-none motion-reduce:transition-none",
            "peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
            done && "border-[#1F7A35] bg-[#1F7A35] text-white",
            !done && now && "border-primary",
            !done && !now && "border-[#C7C7CC] hover:border-muted-foreground",
          )}
        >
          {done ? (
            <Check className="size-3" strokeWidth={3} aria-hidden="true" />
          ) : now ? (
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          ) : null}
          <span className="sr-only">Mark done: {item.title}</span>
        </label>
        {!last && <span className={cn("w-0.5 flex-1", done ? "bg-[#1F7A35]/40" : "bg-border")} aria-hidden="true" />}
      </div>

      <div className={cn("min-w-0 pb-4", last && "pb-2")}>
        <div className={cn(now && "-mt-1 rounded-lg bg-sidebar-accent px-3 py-2")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className={cn(
                "text-sm font-medium",
                done && "text-muted-foreground line-through decoration-muted-foreground/60",
              )}
            >
              {item.title}
            </p>
            {now && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[0.6875rem] leading-4 font-semibold text-primary-foreground">
                Now
              </span>
            )}
            {item.event_id !== undefined && (
              <span title="On your Pulse Health calendar">
                <CalendarCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">On your Pulse Health calendar</span>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {durationLabel(minutesBetween(item.start, item.end))}
          </p>
          {item.why && <p className="mt-1 text-xs text-muted-foreground">{item.why}</p>}
        </div>
      </div>
    </li>
  );
}
