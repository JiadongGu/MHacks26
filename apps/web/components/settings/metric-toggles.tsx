"use client";

import { useState } from "react";
import { toast } from "sonner";
import { saveHiddenMetricsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Group } from "@/components/ui-bits";
import { METRICS } from "@/lib/metrics";

/** One switch per number card. On means shown. Everything is shown until the person turns it off. */
export function MetricToggles({ hidden, disabled }: { hidden: string[]; disabled: boolean }) {
  const [off, setOff] = useState<string[]>(hidden);
  const [busy, setBusy] = useState(false);

  const toggle = (key: string) =>
    setOff((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  async function save() {
    setBusy(true);
    const res = await saveHiddenMetricsAction(off);
    setBusy(false);
    if (res.ok) toast.success("Dashboard saved.");
    else toast.error(res.error);
  }

  return (
    <div>
      <fieldset disabled={disabled || busy}>
        <legend className="sr-only">Numbers shown on the dashboard</legend>
        <Group
          title="Dashboard"
          id="s-dashboard-title"
          index={3}
          footer="Pulse shows every number it has. Switch off any you would rather not see."
        >
          {METRICS.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p id={`m-${m.key}`} className="text-sm font-medium">
                  {m.label}
                </p>
                <p id={`m-${m.key}-hint`} className="text-xs text-muted-foreground">
                  {m.hint}
                </p>
              </div>
              <Switch
                checked={!off.includes(m.key)}
                onCheckedChange={() => toggle(m.key)}
                disabled={disabled || busy}
                aria-labelledby={`m-${m.key}`}
                aria-describedby={`m-${m.key}-hint`}
              />
            </div>
          ))}
        </Group>
      </fieldset>
      <Button className="mt-4" onClick={() => void save()} disabled={disabled || busy}>
        {busy ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
