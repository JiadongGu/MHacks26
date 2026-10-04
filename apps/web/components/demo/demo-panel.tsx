"use client";

import { useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Armchair,
  Dumbbell,
  LoaderCircle,
  Moon,
  Play,
  RefreshCw,
  RotateCcw,
  Thermometer,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, ErrorNote, ListSkeleton, SeverityBadge, stagger } from "@/components/ui-bits";
import { agent, errorText, isEndpointMissing, me } from "@/lib/api-client";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { AlertView, MessageView } from "@/lib/queries";
import { usePolling } from "@/lib/use-polling";
import { cn } from "@/lib/utils";

const SCENARIOS: { id: string; label: string; hint: string; icon: LucideIcon; tone: string }[] = [
  { id: "normal", label: "Normal day", hint: "Resting vitals, nothing unusual.", icon: Activity, tone: "text-labs bg-labs/10" },
  { id: "workout_now", label: "Workout now", hint: "Heart rate climbs. Expect a nice-workout text.", icon: Dumbbell, tone: "text-activity bg-activity/10" },
  { id: "illness_onset", label: "Illness onset", hint: "Resting heart rate up, sleep down. Proposes a sleep block.", icon: Thermometer, tone: "text-heart bg-heart/10" },
  { id: "great_sleep", label: "Great sleep", hint: "A long, deep night.", icon: Moon, tone: "text-sleep bg-sleep/10" },
  { id: "sedentary_day", label: "Sedentary day", hint: "Almost no steps for hours.", icon: Armchair, tone: "text-activity bg-activity/10" },
  { id: "low_spo2", label: "Low SpO2", hint: "Oxygen saturation drops below the threshold.", icon: Wind, tone: "text-respiratory bg-respiratory/10" },
];

type Outcome = { at: string; text: string; ok: boolean };

export function DemoPanel({
  initialAlerts,
  initialMessages,
}: {
  initialAlerts?: AlertView[];
  initialMessages?: MessageView[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [last, setLast] = useState<Outcome | null>(null);

  async function run(key: string, label: string, path: string, body: Record<string, unknown>) {
    setBusy(key);
    try {
      await agent(path, { method: "POST", body });
      setMissing((m) => m.filter((p) => p !== path));
      setLast({ at: new Date().toISOString(), text: `${label}: sent.`, ok: true });
      toast.success(`${label}: sent.`);
    } catch (err) {
      if (isEndpointMissing(err)) {
        setMissing((m) => (m.includes(path) ? m : [...m, path]));
        setLast({ at: new Date().toISOString(), text: `${label}: endpoint not deployed yet.`, ok: false });
      } else {
        const text = errorText(err);
        setLast({ at: new Date().toISOString(), text: `${label}: ${text}`, ok: false });
        toast.error(`${label}: ${text}`);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-8">
        <section aria-labelledby="demo-scenarios">
          <h2 id="demo-scenarios" className="mb-1 text-xl">
            Scenarios
          </h2>
          <p className="mb-4 max-w-[60ch] text-sm text-muted-foreground">
            Each tile sends the scenario to the simulator and fast-forwards 30 minutes.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {SCENARIOS.map((s, i) => {
              const Icon = s.icon;
              const running = busy === s.id;
              return (
                <li key={s.id} style={stagger(i)} className="reveal">
                  <button
                    type="button"
                    disabled={busy !== null}
                    aria-label={`Run scenario: ${s.label}`}
                    onClick={() =>
                      void run(s.id, s.label, "/demo/scenario", { scenario: s.id, fast_forward_min: 30 })
                    }
                    className={cn(
                      "card-interactive flex h-full w-full flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
                      s.id === "illness_onset" ? "border-primary/40" : "border-border",
                    )}
                  >
                    <span className={cn("grid size-10 place-items-center rounded-lg", s.tone)}>
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="block">
                      <span className="block text-base font-semibold">{s.label}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{s.hint}</span>
                    </span>
                    <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-sidebar-accent-foreground">
                      {running ? (
                        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <Play className="size-3.5" aria-hidden="true" />
                      )}
                      {running ? "Running..." : "Run"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="demo-twin">
          <h2 id="demo-twin" className="mb-1 text-xl">
            Reset
          </h2>
          <p className="mb-3 max-w-[60ch] text-sm text-muted-foreground">
            Alerts have cooldowns. Reset before a run so the scenario fires again. Nothing is deleted.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run("reset", "Reset demo", "/demo/reset", {})}
            >
              <RotateCcw aria-hidden="true" />
              {busy === "reset" ? "Resetting..." : "Reset demo"}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run("rebuild", "Rebuild twin", "/twin/me/rebuild", {})}
            >
              <RefreshCw aria-hidden="true" />
              {busy === "rebuild" ? "Rebuilding..." : "Rebuild twin"}
            </Button>
          </div>
        </section>

        <div aria-live="polite" className="space-y-3">
          {last && (
            <p className="text-sm">
              <span className="num text-xs text-muted-foreground">{formatDateTime(last.at)}</span>{" "}
              {last.text}
            </p>
          )}
          {missing.length > 0 && (
            <ErrorNote>
              Endpoint not deployed yet: <span className="font-mono">{missing.join(", ")}</span>. The agent
              returned 404. Try again after the agent deploys.
            </ErrorNote>
          )}
        </div>
      </div>

      <div className="space-y-8">
        <AlertLog initial={initialAlerts} />
        <MessageLog initial={initialMessages} />
      </div>
    </div>
  );
}

function LogShell({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-xl">
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">Last 10. Refreshes every 5 seconds.</p>
      </div>
      {children}
    </section>
  );
}

function AlertLog({ initial }: { initial?: AlertView[] }) {
  const { data, error, loading, refresh } = usePolling(
    async () => (await me<{ alerts: AlertView[] }>("/alerts?limit=10")).alerts,
    { label: "Alert log", intervalMs: 5000, initial },
  );
  return (
    <LogShell title="Alerts" id="log-alerts">
      {loading ? (
        <ListSkeleton rows={3} label="Loading alerts" />
      ) : error && !data ? (
        <ErrorNote
          action={
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          }
        >
          {error}
        </ErrorNote>
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No alerts yet">Run a scenario. Alerts appear here within a minute.</EmptyState>
      ) : (
        <ol className="-mx-4 divide-y divide-border border-y border-border">
          {(data ?? []).map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={a.severity} />
                <time
                  dateTime={a.created_at}
                  title={formatDateTime(a.created_at)}
                  suppressHydrationWarning
                  className="text-xs text-muted-foreground"
                >
                  {timeAgo(a.created_at)}
                </time>
              </div>
              <p className="mt-1 text-sm font-medium">{a.title}</p>
              <p className="text-sm text-muted-foreground">{a.body}</p>
            </li>
          ))}
        </ol>
      )}
    </LogShell>
  );
}

function MessageLog({ initial }: { initial?: MessageView[] }) {
  const { data, error, loading, refresh } = usePolling(
    async () => (await me<{ messages: MessageView[] }>("/messages?limit=10")).messages,
    { label: "Message log", intervalMs: 5000, initial },
  );
  return (
    <LogShell title="Messages" id="log-messages">
      {loading ? (
        <ListSkeleton rows={3} label="Loading messages" />
      ) : error && !data ? (
        <ErrorNote
          action={
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          }
        >
          {error}
        </ErrorNote>
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No messages yet">Messages between you and Pulse appear here.</EmptyState>
      ) : (
        <ol className="-mx-4 divide-y divide-border border-y border-border">
          {(data ?? []).map((m) => (
            <li key={m.id} className="px-4 py-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {m.direction === "out" ? (
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                ) : (
                  <ArrowDownLeft className="size-3" aria-hidden="true" />
                )}
                <span className="font-medium text-foreground">
                  {m.direction === "out" ? "Pulse to you" : "You to Pulse"}
                </span>
                <Chip>{m.channel}</Chip>
                <time
                  dateTime={m.created_at}
                  title={formatDateTime(m.created_at)}
                  suppressHydrationWarning
                  className="num"
                >
                  {timeAgo(m.created_at)}
                </time>
              </p>
              <p className="mt-1 text-sm">{m.text}</p>
            </li>
          ))}
        </ol>
      )}
    </LogShell>
  );
}
