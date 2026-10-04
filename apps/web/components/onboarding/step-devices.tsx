"use client";

import { useState } from "react";
import { Watch } from "lucide-react";
import { toast } from "sonner";
import { agent, errorText, isEndpointMissing } from "@/lib/api-client";
import { Switch } from "@/components/ui/switch";
import { FitbitStatusCard } from "./fitbit-status";

export function StepDevices({
  simulate,
  setSimulate,
  returnTo = "settings",
}: {
  simulate: boolean;
  setSimulate: (on: boolean) => void;
  returnTo?: "onboarding" | "settings";
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
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <h3 className="sr-only">Fitbit</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Pulse reads your watch data through Google Health. You sign in with Google and approve read access.
        </p>
        <FitbitStatusCard returnTo={returnTo} />
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground/70">
              <Watch className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Simulate Apple Watch</h3>
              <p id="sim-desc" className="mt-0.5 max-w-[50ch] text-sm text-muted-foreground">
                For the demo, Pulse can generate watch data for you. It sends normal vitals until you pick
                a scenario.
              </p>
            </div>
          </div>
          <Switch
            checked={simulate}
            aria-label="Simulate Apple Watch"
            aria-describedby="sim-desc"
            disabled={busy}
            onCheckedChange={() => void toggleSim()}
          />
        </div>
        <p className="mt-2 pl-[3.25rem] text-xs text-muted-foreground" aria-live="polite">
          {simulate ? "On" : "Off"}
          {simNote ? `. ${simNote}` : ""}
        </p>
      </div>
    </div>
  );
}
