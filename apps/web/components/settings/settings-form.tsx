"use client";

import { useState } from "react";
import { toast } from "sonner";
import { saveSettingsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Group, describedBy } from "@/components/ui-bits";
import { isValidTimeZone } from "@/lib/profile";
import { isHHMM, quietWindowMinutes, validateQuietHours } from "@/lib/quiet-hours";
import { formatMinutes } from "@/lib/goals";

type Values = {
  timezone: string;
  wake_time: string;
  bed_time: string;
  quiet_start: string;
  quiet_end: string;
};

export function SettingsForm({ initial, disabled }: { initial: Values; disabled: boolean }) {
  const [v, setV] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});

  const set = (k: keyof Values, value: string) => setV((s) => ({ ...s, [k]: value }));

  function check(): Partial<Record<keyof Values, string>> {
    const e: Partial<Record<keyof Values, string>> = {};
    if (!isValidTimeZone(v.timezone)) e.timezone = "Enter a time zone such as America/Detroit.";
    if (!isHHMM(v.wake_time)) e.wake_time = "Use HH:MM.";
    if (!isHHMM(v.bed_time)) e.bed_time = "Use HH:MM.";
    const q = validateQuietHours(v.quiet_start, v.quiet_end);
    if (!q.ok) e.quiet_start = q.error;
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Fix the marked fields.");
      return;
    }
    setBusy(true);
    const res = await saveSettingsAction(v);
    setBusy(false);
    if (res.ok) toast.success("Settings saved.");
    else toast.error(res.error);
  }

  const quiet = validateQuietHours(v.quiet_start, v.quiet_end);

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      <Group title="Schedule" id="s-schedule-title" index={1}>
        <FieldRow id="s-tz" label="Time zone" error={errors.timezone}>
          <Input
            id="s-tz"
            spellCheck={false}
            value={v.timezone}
            disabled={disabled}
            onChange={(e) => set("timezone", e.target.value)}
            {...describedBy("s-tz", undefined, errors.timezone)}
          />
        </FieldRow>
        <FieldRow id="s-wake" label="Usual wake time" error={errors.wake_time}>
          <Input
            id="s-wake"
            type="time"
            value={v.wake_time}
            disabled={disabled}
            onChange={(e) => set("wake_time", e.target.value)}
            {...describedBy("s-wake", undefined, errors.wake_time)}
          />
        </FieldRow>
        <FieldRow id="s-bed" label="Usual bed time" error={errors.bed_time}>
          <Input
            id="s-bed"
            type="time"
            value={v.bed_time}
            disabled={disabled}
            onChange={(e) => set("bed_time", e.target.value)}
            {...describedBy("s-bed", undefined, errors.bed_time)}
          />
        </FieldRow>
      </Group>

      <fieldset disabled={disabled}>
        <legend className="sr-only">Quiet hours</legend>
        <Group
          title="Quiet hours"
          id="s-quiet-title"
          index={2}
          footer={
            <>
              <span className="block max-w-[60ch]">
                Pulse holds nudges and info alerts in this window. Urgent alerts still reach you. Clear both
                fields to turn quiet hours off.
              </span>
              <span className="num mt-1 block" aria-live="polite">
                {quiet.ok && quiet.value
                  ? `Quiet for ${formatMinutes(quietWindowMinutes(quiet.value))} each day.`
                  : quiet.ok
                    ? "Quiet hours are off."
                    : ""}
              </span>
            </>
          }
        >
          <FieldRow id="s-qs" label="Start" error={errors.quiet_start}>
            <Input
              id="s-qs"
              type="time"
              value={v.quiet_start}
              onChange={(e) => set("quiet_start", e.target.value)}
              {...describedBy("s-qs", undefined, errors.quiet_start)}
            />
          </FieldRow>
          <FieldRow id="s-qe" label="End">
            <Input
              id="s-qe"
              type="time"
              value={v.quiet_end}
              onChange={(e) => set("quiet_end", e.target.value)}
            />
          </FieldRow>
        </Group>
      </fieldset>

      <Button type="submit" size="lg" className="h-10 px-5" disabled={busy || disabled}>
        {busy ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}

/** A settings row: the label on the left, the control on the right, the error below. */
function FieldRow({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div className="w-44 sm:w-56 [&_input]:text-right">{children}</div>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
