"use client";

import { useEffect, useState } from "react";
import { Watch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNote } from "@/components/ui-bits";
import { ConnectionPill } from "@/components/onboarding/google-status";
import { agent, errorText, isEndpointMissing } from "@/lib/api-client";
import { timeAgo } from "@/lib/format";

type FitbitStatus = { connected: boolean; last_sync: string | null };

/** Shows the Fitbit connection and the connect link. Used in onboarding step 3 and in settings. */
export function FitbitStatusCard({ returnTo = "settings" }: { returnTo?: "onboarding" | "settings" }) {
  const [status, setStatus] = useState<FitbitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    agent<FitbitStatus>("/integrations/fitbit/status")
      .then((res) => {
        if (!live) return;
        setStatus(res);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!live) return;
        if (isEndpointMissing(err)) setMissing(true);
        else {
          const text = errorText(err);
          setError(text);
          toast.error(`Fitbit status: ${text}`);
        }
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  if (loading) return <Skeleton role="status" aria-label="Loading Fitbit status" className="h-14 w-full" />;
  if (missing) {
    return (
      <p className="text-sm text-muted-foreground">
        The Fitbit connection is not deployed yet.
      </p>
    );
  }
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
          <Watch className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Fitbit
            <ConnectionPill connected={!!status?.connected} />
          </p>
          <p className="mt-0.5 max-w-[50ch] text-sm text-muted-foreground">
            {status?.connected
              ? status.last_sync
                ? `Synced ${timeAgo(status.last_sync)}.`
                : "Connected. Waiting for the first sync."
              : "Heart rate, steps, sleep, and more. Sign in with the Google account your Fitbit uses and approve read access."}
          </p>
        </div>
      </div>
      <Button asChild variant={status?.connected ? "outline" : "default"}>
        {/* A full page navigation. The proxy passes the 302 to Google through. */}
        { }
        <a href={`/api/agent/integrations/fitbit/authorize?return_to=${returnTo}`}>{status?.connected ? "Reconnect" : "Connect Fitbit"}</a>
      </Button>
    </div>
  );
}
