"use client";

import { useEffect, useState } from "react";
import { Watch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { agent, errorText, isEndpointMissing } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Probe = "checking" | "ready" | "soon";

/** Asks the proxy for the Fitbit authorize route without following the redirect. A redirect means the route exists. */
async function probeFitbit(): Promise<Probe> {
  try {
    const res = await fetch("/api/agent/integrations/fitbit/authorize", {
      redirect: "manual",
      cache: "no-store",
    });
    return res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400) ? "ready" : "soon";
  } catch {
    return "soon";
  }
}

export function StepDevices({
  simulate,
  setSimulate,
}: {
  simulate: boolean;
  setSimulate: (on: boolean) => void;
}) {
  const [fitbit, setFitbit] = useState<Probe>("checking");
  const [busy, setBusy] = useState(false);
  const [simNote, setSimNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void probeFitbit().then((p) => {
      if (live) setFitbit(p);
    });
    return () => {
      live = false;
    };
  }, []);

  async function toggleSim() {
    const next = !simulate;
    setSimulate(next);
    setSimNote(null);
    if (!next) return;
    setBusy(true);
    try {
      await agent("/demo/scenario", { body: { scenario: "normal" } });
      toast.success("Apple Watch simulator started.");
    } catch (err) {
      if (isEndpointMissing(err)) {
        setSimNote("The simulator endpoint is not deployed yet. Your choice stays on this device for now.");
      } else {
        setSimulate(false);
        toast.error(`Could not start the simulator: ${errorText(err)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl divide-y divide-border border-y border-border">
      <div className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Fitbit</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Heart rate and steps. You sign in with Google Health and approve read access.
          </p>
        </div>
        {fitbit === "ready" ? (
          <Button asChild variant="outline">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/agent/integrations/fitbit/authorize">Connect Fitbit</a>
          </Button>
        ) : (
          <Button variant="outline" disabled aria-describedby="fitbit-note">
            {fitbit === "checking" ? "Checking..." : "Coming soon"}
          </Button>
        )}
        {fitbit === "soon" && (
          <p id="fitbit-note" className="w-full text-xs text-muted-foreground">
            The Fitbit connection is not deployed yet. You can connect it later in settings.
          </p>
        )}
      </div>

      <div className="py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Watch className="size-4" aria-hidden="true" />
              Simulate Apple Watch
            </h3>
            <p id="sim-desc" className="mt-1 max-w-[50ch] text-sm text-muted-foreground">
              For the demo, Pulse can generate watch data for you. It sends normal vitals until you pick
              a scenario.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={simulate}
            aria-label="Simulate Apple Watch"
            aria-describedby="sim-desc"
            disabled={busy}
            onClick={() => void toggleSim()}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-input transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              simulate ? "bg-foreground" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "inline-block size-5 rounded-full transition-transform motion-reduce:transition-none",
                simulate ? "translate-x-6 bg-background" : "translate-x-1 bg-muted-foreground",
              )}
            />
            <span className="sr-only">{simulate ? "On" : "Off"}</span>
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {simulate ? "On" : "Off"}
          {simNote ? `. ${simNote}` : ""}
        </p>
      </div>
    </div>
  );
}
