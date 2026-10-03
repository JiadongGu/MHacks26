"use client";

import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNote } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import { timeAgo } from "@/lib/format";

type GoogleStatus = { connected: boolean; email: string | null; last_sync: string | null };

/** Shows the Google Calendar connection and the connect link. Used in onboarding step 4 and in settings. */
export function GoogleStatusCard({ connectLabel = "Connect Google Calendar" }: { connectLabel?: string }) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    agent<GoogleStatus>("/integrations/google/status")
      .then((res) => {
        if (!live) return;
        setStatus(res);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!live) return;
        const text = errorText(err);
        setError(text);
        setLoading(false);
        toast.error(`Google Calendar status: ${text}`);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  if (loading) return <Skeleton role="status" aria-label="Loading Google Calendar status" className="h-16 max-w-xl" />;
  if (error && !status) {
    return (
      <ErrorNote
        className="max-w-xl"
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
        Could not read the connection status. {error}
      </ErrorNote>
    );
  }

  return (
    <div className="flex max-w-xl flex-wrap items-center justify-between gap-4 border-y border-border py-5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-base font-semibold">
          <CalendarCheck className="size-4" aria-hidden="true" />
          {status?.connected ? "Connected" : "Not connected"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {status?.connected
            ? `${status.email ?? "Google account"}${status.last_sync ? `, synced ${timeAgo(status.last_sync)}` : ""}`
            : "Pulse reads your events and writes to its own Pulse Health calendar."}
        </p>
      </div>
      <Button asChild variant={status?.connected ? "outline" : "default"}>
        {/* A full page navigation. The proxy passes the 302 to Google through. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/agent/integrations/google/authorize">
          {status?.connected ? "Reconnect" : connectLabel}
        </a>
      </Button>
    </div>
  );
}
