"use client";

import { useState } from "react";
import { Activity, BellOff, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { AlertWhy } from "@/components/dashboard/alert-why";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Chip, EmptyState, ErrorNote, SeverityBadge, stagger } from "@/components/ui-bits";
import { errorText, me } from "@/lib/api-client";
import { canExplain } from "@/lib/explain";
import { formatDateTime, humanize, timeAgo } from "@/lib/format";
import type { AlertView } from "@/lib/queries";
import { usePolling } from "@/lib/use-polling";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Filter = "all" | "warnings" | "info";

const SOURCE: Record<string, string> = {
  morning_briefing: "Briefing",
  evening_check: "Check-in",
  welcome: "Welcome",
};

const isWarning = (a: AlertView) => a.severity === "warning" || a.severity === "urgent";

/** The full alert history with a filter. It reloads every 15 seconds and marks alerts read. */
export function AlertsList({
  initial,
  limit,
  emptyHint,
}: {
  initial?: AlertView[];
  limit: number;
  emptyHint: string;
}) {
  const { data, setData, error, loading, refresh } = usePolling(
    async () => (await me<{ alerts: AlertView[] }>(`/alerts?limit=${limit}`)).alerts,
    { label: "Alerts", intervalMs: 15_000, initial },
  );
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const all = data ?? [];
  const unread = all.filter((a) => !a.read_at).length;
  const shown = all.filter((a) => (filter === "warnings" ? isWarning(a) : filter === "info" ? !isWarning(a) : true));

  async function markRead(body: { ids: string[] } | { all: true }) {
    setBusy(true);
    const now = new Date().toISOString();
    const previous = data;
    setData(
      all.map((a) => ("all" in body || body.ids.includes(a.id) ? { ...a, read_at: a.read_at ?? now } : a)),
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

  if (loading) {
    return (
      <div role="status" aria-label="Loading alerts" className="space-y-px overflow-hidden rounded-lg border border-border bg-card">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        ))}
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
        Could not load alerts. {error}
      </ErrorNote>
    );
  }
  if (all.length === 0) {
    return (
      <EmptyState icon={BellOff} title="No alerts yet">
        {emptyHint}
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          name="alert-filter"
          label="Filter alerts"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: all.length },
            { value: "warnings", label: "Warnings", count: all.filter(isWarning).length },
            { value: "info", label: "Info", count: all.filter((a) => !isWarning(a)).length },
          ]}
        />
        <div className="flex items-center gap-2">
          <p className="num text-sm text-muted-foreground" aria-live="polite">
            {unread === 0 ? "All read" : `${unread} unread`}
          </p>
          {unread > 0 && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void markRead({ all: true })}>
              <CheckCheck aria-hidden="true" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorNote className="mb-3">Could not refresh alerts. Showing the last list. {error}</ErrorNote>}

      {shown.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={filter === "warnings" ? "No warnings" : "No info alerts"}
          action={
            <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
              Show all alerts
            </Button>
          }
        >
          Nothing in this filter right now.
        </EmptyState>
      ) : (
        <ol className="overflow-hidden rounded-lg border border-border bg-card [&>li+li]:border-t [&>li+li]:border-border">
          {shown.map((a, i) => {
            const isNew = !a.read_at;
            return (
              <li
                key={a.id}
                style={stagger(Math.min(i, 8))}
                className={cn(
                  "reveal grid gap-1 p-4 transition-colors sm:grid-cols-[1fr_auto] sm:gap-x-6",
                  isNew && "bg-primary/[0.035]",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    <Chip icon={Activity}>{SOURCE[a.kind] ?? humanize(a.kind)}</Chip>
                    {isNew && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-sidebar-accent-foreground">
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                        New
                      </span>
                    )}
                    <time
                      dateTime={a.created_at}
                      title={formatDateTime(a.created_at)}
                      suppressHydrationWarning
                      className="num text-xs text-muted-foreground"
                    >
                      {timeAgo(a.created_at)}
                    </time>
                  </div>
                  <h3 className={cn("mt-2 text-base", isNew ? "font-semibold" : "font-medium")}>{a.title}</h3>
                  <p className="mt-1 max-w-[65ch] whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
                  {canExplain(a.kind, a.explain) && <AlertWhy alertId={a.id} title={a.title} explain={a.explain} />}
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
      )}
    </div>
  );
}
