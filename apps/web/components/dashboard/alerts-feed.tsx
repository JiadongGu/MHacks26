"use client";

import { useState } from "react";
import { Info, Lightbulb, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AlertWhy } from "@/components/dashboard/alert-why";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote, ListSkeleton } from "@/components/ui-bits";
import { errorText, me } from "@/lib/api-client";
import { canExplain } from "@/lib/explain";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { AlertView } from "@/lib/queries";
import { usePolling } from "@/lib/use-polling";
import { alertSource } from "@/lib/vitals-card";
import { cn } from "@/lib/utils";

const SEVERITY: Record<AlertView["severity"], { label: string; icon: LucideIcon; className: string }> = {
  info: { label: "Info", icon: Info, className: "bg-muted text-muted-foreground" },
  nudge: { label: "Nudge", icon: Lightbulb, className: "bg-sidebar-accent text-sidebar-accent-foreground" },
  warning: { label: "Warning", icon: TriangleAlert, className: "bg-[#FFF3E0] text-[#A85A00]" },
  urgent: { label: "Urgent", icon: OctagonAlert, className: "bg-[#FFEBEA] text-[#D70015]" },
};

function SeverityPill({ severity }: { severity: AlertView["severity"] }) {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold", s.className)}>
      <s.icon className="size-3.5" aria-hidden="true" />
      {s.label}
    </span>
  );
}

type Props = {
  initial?: AlertView[];
  limit: number;
  pollMs?: number;
  emptyHint?: string;
  /** Alert kinds to leave out, for kinds the dashboard shows elsewhere. */
  hideKinds?: string[];
};

export function AlertsFeed({ initial, limit, pollMs = 15_000, emptyHint, hideKinds = [] }: Props) {
  const { data, setData, error, loading, refresh } = usePolling(
    async () => (await me<{ alerts: AlertView[] }>(`/alerts?limit=${limit}`)).alerts,
    { label: "Alerts", intervalMs: pollMs, initial },
  );
  const [busy, setBusy] = useState(false);

  const alerts = (data ?? []).filter((a) => !hideKinds.includes(a.kind));
  const unread = alerts.filter((a) => !a.read_at).length;

  async function markRead(body: { ids: string[] } | { all: true }) {
    setBusy(true);
    const now = new Date().toISOString();
    const previous = data;
    setData(
      alerts.map((a) =>
        "all" in body || body.ids.includes(a.id) ? { ...a, read_at: a.read_at ?? now } : a,
      ),
    );
    try {
      await me("/alerts", { method: "POST", body });
    } catch (err) {
      setData(previous);
      toast.error(`Could not mark read: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <ListSkeleton label="Loading alerts" />;
  if (error && !data) {
    return (
      <ErrorNote
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        }
      >
        Could not load alerts. {error}
      </ErrorNote>
    );
  }
  if (alerts.length === 0) {
    return (
      <EmptyState title="No alerts yet">
        {emptyHint ?? "Pulse adds an alert here when it sees something worth your attention."}
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {unread === 0 ? "All read" : `${unread} unread`}
        </p>
        {unread > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void markRead({ all: true })}
          >
            Mark all read
          </Button>
        )}
      </div>
      {error && (
        <ErrorNote className="mb-3">Could not refresh alerts. Showing the last list. {error}</ErrorNote>
      )}
      <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {alerts.map((a) => {
          const isNew = !a.read_at;
          return (
            <li
              key={a.id}
              id={`alert-${a.id}`}
              className="grid scroll-mt-6 gap-1 px-4 py-4 target:bg-sidebar-accent/50 sm:grid-cols-[1fr_auto] sm:gap-x-6 md:px-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <SeverityPill severity={a.severity} />
                  <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs font-medium text-muted-foreground">
                    <span className="sr-only">Source: </span>
                    {alertSource(a.kind, a.explain)}
                  </span>
                  <time
                    dateTime={a.created_at}
                    title={formatDateTime(a.created_at)}
                    suppressHydrationWarning
                    className="text-xs text-muted-foreground"
                  >
                    {timeAgo(a.created_at)}
                  </time>
                  {isNew && (
                    <span className="text-xs font-semibold text-primary">
                      <span aria-hidden="true">● </span>New
                    </span>
                  )}
                </div>
                <h3 className={cn("mt-2 text-base", isNew ? "font-semibold" : "font-medium")}>
                  {a.title}
                </h3>
                <p className="mt-1 max-w-[65ch] whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
                {canExplain(a.kind, a.explain) && (
                  <AlertWhy alertId={a.id} title={a.title} explain={a.explain} />
                )}
              </div>
              {isNew && (
                <div className="sm:self-start">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Mark read: ${a.title}`}
                    onClick={() => void markRead({ ids: [a.id] })}
                  >
                    Mark read
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
