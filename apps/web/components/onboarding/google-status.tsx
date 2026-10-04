"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, CircleCheck, CircleDashed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNote } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import { timeAgo } from "@/lib/format";

type GoogleStatus = { connected: boolean; email: string | null; last_sync: string | null };

/** Shows the Google Calendar connection and the connect link. Used in onboarding step 3 and in settings. */
export function GoogleStatusCard({
  connectLabel = "Connect Google Calendar",
  returnTo = "settings",
}: {
  connectLabel?: string;
  /** The page Google sends the person back to. */
  returnTo?: "onboarding" | "settings";
}) {
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

  if (loading) return <Skeleton role="status" aria-label="Loading Google Calendar status" className="h-14 w-full" />;
  if (error && !status) {
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
        Could not read the connection status. {error}
      </ErrorNote>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground/70">
          <CalendarCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Google Calendar
            <ConnectionPill connected={!!status?.connected} />
          </p>
          <p className="mt-0.5 max-w-[50ch] text-sm text-muted-foreground">
            {status?.connected
              ? `${status.email ?? "Google account"}${status.last_sync ? `, synced ${timeAgo(status.last_sync)}` : ""}`
              : "Pulse reads your events and writes to its own Pulse Health calendar."}
          </p>
        </div>
      </div>
      <Button asChild variant={status?.connected ? "outline" : "default"}>
        {/* A full page navigation. The proxy passes the 302 to Google through. */}
        { }
        <a href={`/api/agent/integrations/google/authorize?return_to=${returnTo}`}>
          {status?.connected ? "Reconnect" : connectLabel}
        </a>
      </Button>
    </div>
  );
}

/** Connection state as an icon and a word. */
export function ConnectionPill({ connected }: { connected: boolean }) {
  const Icon = connected ? CircleCheck : CircleDashed;
  return (
    <span
      className={
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium " +
        (connected ? "bg-ok/15 text-ok-ink" : "bg-secondary text-foreground/75")
      }
    >
      <Icon className="size-3" aria-hidden="true" />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}
