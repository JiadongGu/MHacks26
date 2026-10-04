"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertWhy } from "@/components/dashboard/alert-why";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote, ListSkeleton, SeverityBadge } from "@/components/ui-bits";
import { errorText, me } from "@/lib/api-client";
import { canExplain } from "@/lib/explain";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { AlertView } from "@/lib/queries";
import { usePolling } from "@/lib/use-polling";
import { cn } from "@/lib/utils";

type Props = {
  initial?: AlertView[];
  limit: number;
  pollMs?: number;
  emptyHint?: string;
};

export function AlertsFeed({ initial, limit, pollMs = 15_000, emptyHint }: Props) {
  const { data, setData, error, loading, refresh } = usePolling(
    async () => (await me<{ alerts: AlertView[] }>(`/alerts?limit=${limit}`)).alerts,
    { label: "Alerts", intervalMs: pollMs, initial },
  );
  const [busy, setBusy] = useState(false);

  const alerts = data ?? [];
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
      <ol className="divide-y divide-border border-y border-border">
        {alerts.map((a) => {
          const isNew = !a.read_at;
          return (
            <li key={a.id} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:gap-x-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={a.severity} />
                  {isNew && (
                    <span className="text-xs font-medium text-foreground">
                      <span aria-hidden="true">● </span>New
                    </span>
                  )}
                  <time
                    dateTime={a.created_at}
                    title={formatDateTime(a.created_at)}
                    suppressHydrationWarning
                    className="text-xs text-muted-foreground"
                  >
                    {timeAgo(a.created_at)}
                  </time>
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
