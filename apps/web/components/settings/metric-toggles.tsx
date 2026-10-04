"use client";

import { useState } from "react";
import { toast } from "sonner";
import { saveHiddenMetricsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { METRICS } from "@/lib/metrics";

/** One checkbox per number card. Checked means shown. Everything is shown until the person turns it off. */
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
    <div className="max-w-xl">
      <fieldset disabled={disabled || busy}>
        <legend className="sr-only">Numbers shown on the dashboard</legend>
        <ul className="divide-y divide-border border-y border-border">
          {METRICS.map((m) => (
            <li key={m.key}>
              <label className="flex cursor-pointer items-start gap-3 px-1 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
                <input
                  type="checkbox"
                  checked={!off.includes(m.key)}
                  onChange={() => toggle(m.key)}
                  className="mt-1 size-4 accent-[var(--foreground)]"
                />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Button className="mt-4" onClick={() => void save()} disabled={disabled || busy}>
        {busy ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
