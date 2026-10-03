"use client";

import { useState } from "react";
import { Watch } from "lucide-react";
import { toast } from "sonner";
import { agent, errorText, isEndpointMissing } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { FitbitStatusCard } from "./fitbit-status";

export function StepDevices({
  simulate,
  setSimulate,
}: {
  simulate: boolean;
  setSimulate: (on: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [simNote, setSimNote] = useState<string | null>(null);

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
      <div className="py-5">
        <h3 className="text-base font-semibold">Fitbit</h3>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Pulse reads your watch data through Google Health. You sign in with Google and approve read access.
        </p>
        <FitbitStatusCard />
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
