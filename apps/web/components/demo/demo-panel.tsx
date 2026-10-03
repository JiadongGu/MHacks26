"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote, ListSkeleton, SeverityBadge } from "@/components/ui-bits";
import { agent, errorText, isEndpointMissing, me } from "@/lib/api-client";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { AlertView, MessageView } from "@/lib/queries";
import { usePolling } from "@/lib/use-polling";

const SCENARIOS = [
  { id: "normal", label: "Normal day", hint: "Resting vitals, nothing unusual." },
  { id: "workout_now", label: "Workout now", hint: "Heart rate climbs. Expect a nice-workout text." },
  { id: "illness_onset", label: "Illness onset", hint: "Resting heart rate up, sleep down. Proposes a sleep block." },
  { id: "great_sleep", label: "Great sleep", hint: "A long, deep night." },
  { id: "sedentary_day", label: "Sedentary day", hint: "Almost no steps for hours." },
  { id: "low_spo2", label: "Low SpO2", hint: "Oxygen saturation drops below the threshold." },
] as const;

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
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
      <div className="space-y-10">
        <section aria-labelledby="demo-scenarios">
          <h2 id="demo-scenarios" className="mb-1 text-xl">
            Scenarios
          </h2>
          <p className="mb-4 max-w-[60ch] text-sm text-muted-foreground">
            Each button sends the scenario to the simulator and fast-forwards 30 minutes.
          </p>
          <ul className="divide-y divide-border border-y border-border">
            {SCENARIOS.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
                <div className="min-w-0">
                  <p className="text-base font-medium">{s.label}</p>
                  <p className="text-sm text-muted-foreground">{s.hint}</p>
                </div>
                <Button
                  variant={s.id === "illness_onset" ? "default" : "outline"}
                  disabled={busy !== null}
                  aria-label={`Run scenario: ${s.label}`}
                  onClick={() =>
                    void run(s.id, s.label, "/demo/scenario", { scenario: s.id, fast_forward_min: 30 })
                  }
                >
                  {busy === s.id ? "Running..." : "Run"}
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="demo-twin">
          <h2 id="demo-twin" className="mb-4 text-xl">
            Twin
          </h2>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => void run("rebuild", "Rebuild twin", "/twin/me/rebuild", {})}
          >
            <RefreshCw aria-hidden="true" />
            {busy === "rebuild" ? "Rebuilding..." : "Rebuild twin"}
          </Button>
        </section>

        <div aria-live="polite" className="space-y-3">
          {last && (
            <p className="text-sm">
              <span className="font-mono text-xs text-muted-foreground">{formatDateTime(last.at)}</span>{" "}
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

      <div className="space-y-10">
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
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-1 text-xl">
        {title}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">Last 10. Refreshes every 5 seconds.</p>
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
        <ol className="divide-y divide-border border-y border-border">
          {(data ?? []).map((a) => (
            <li key={a.id} className="py-3">
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
        <ol className="divide-y divide-border border-y border-border">
          {(data ?? []).map((m) => (
            <li key={m.id} className="py-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {m.direction === "out" ? (
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                ) : (
                  <ArrowDownLeft className="size-3" aria-hidden="true" />
                )}
                <span className="font-medium text-foreground">
                  {m.direction === "out" ? "Pulse to you" : "You to Pulse"}
                </span>
                <span>{m.channel}</span>
                <time
                  dateTime={m.created_at}
                  title={formatDateTime(m.created_at)}
                  suppressHydrationWarning
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
