"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { saveProfileAction } from "@/app/(app)/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, describedBy } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import { SEX_OPTIONS, validateProfile, type FieldErrors, type ProfileInput } from "@/lib/profile";
import { twinProfile } from "./types";

const noopSubscribe = () => () => {};
const detectTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const SEX_LABEL: Record<(typeof SEX_OPTIONS)[number], string> = {
  female: "Female",
  male: "Male",
  intersex: "Intersex",
  unspecified: "Prefer not to say",
};

type Props = {
  initial: ProfileInput;
  onSaved: (profile: ProfileInput) => void;
};

export function StepProfile({ initial, onSaved }: Props) {
  // The server renders an empty zone. The browser fills in its own zone after hydration.
  const detected = useSyncExternalStore(noopSubscribe, detectTimeZone, () => "");
  const [draft, setDraft] = useState<ProfileInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const value: ProfileInput = { ...draft, timezone: draft.timezone || detected };
  const set = <K extends keyof ProfileInput>(key: K, v: ProfileInput[K]) =>
    setDraft((d) => ({ ...d, [key]: v }));
  const num = (raw: string) => (raw.trim() === "" ? null : Number(raw));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateProfile(value);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Fix the marked fields.");
      return;
    }
    setBusy(true);
    const saved = await saveProfileAction(value);
    if (!saved.ok) {
      setErrors(saved.fields ?? {});
      toast.error(saved.error);
      setBusy(false);
      return;
    }
    try {
      await agent("/twin/me/onboarding", { body: { profile: twinProfile(value) } });
    } catch (err) {
      toast.warning(`Profile saved. The twin will catch up later. ${errorText(err)}`);
    }
    setBusy(false);
    onSaved(value);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="p-name" label="Name" error={errors.display_name} className="sm:col-span-2">
          <Input
            id="p-name"
            autoComplete="name"
            value={value.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            {...describedBy("p-name", undefined, errors.display_name)}
          />
        </Field>
        <Field id="p-dob" label="Date of birth" error={errors.dob}>
          <Input
            id="p-dob"
            type="date"
            autoComplete="bday"
            value={value.dob}
            onChange={(e) => set("dob", e.target.value)}
            {...describedBy("p-dob", undefined, errors.dob)}
          />
        </Field>
        <Field id="p-sex" label="Sex" hint="Used for reference ranges." error={errors.sex}>
          <NativeSelect
            id="p-sex"
            value={value.sex}
            onChange={(e) => set("sex", e.target.value)}
            {...describedBy("p-sex", "Used for reference ranges.", errors.sex)}
          >
            <option value="">Choose one</option>
            {SEX_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SEX_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="p-height" label="Height (cm)" error={errors.height_cm}>
          <Input
            id="p-height"
            type="number"
            inputMode="decimal"
            min={30}
            max={260}
            step="0.1"
            value={value.height_cm ?? ""}
            onChange={(e) => set("height_cm", num(e.target.value))}
            {...describedBy("p-height", undefined, errors.height_cm)}
          />
        </Field>
        <Field id="p-weight" label="Weight (kg)" error={errors.weight_kg}>
          <Input
            id="p-weight"
            type="number"
            inputMode="decimal"
            min={2}
            max={500}
            step="0.1"
            value={value.weight_kg ?? ""}
            onChange={(e) => set("weight_kg", num(e.target.value))}
            {...describedBy("p-weight", undefined, errors.weight_kg)}
          />
        </Field>
        <Field
          id="p-tz"
          label="Time zone"
          hint="Detected from your browser. Change it if it is wrong."
          error={errors.timezone}
          className="sm:col-span-2"
        >
          <Input
            id="p-tz"
            autoComplete="off"
            spellCheck={false}
            value={value.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            {...describedBy("p-tz", "Detected from your browser. Change it if it is wrong.", errors.timezone)}
          />
        </Field>
        <Field id="p-wake" label="Usual wake time" error={errors.wake_time}>
          <Input
            id="p-wake"
            type="time"
            value={value.wake_time}
            onChange={(e) => set("wake_time", e.target.value)}
            {...describedBy("p-wake", undefined, errors.wake_time)}
          />
        </Field>
        <Field id="p-bed" label="Usual bed time" error={errors.bed_time}>
          <Input
            id="p-bed"
            type="time"
            value={value.bed_time}
            onChange={(e) => set("bed_time", e.target.value)}
            {...describedBy("p-bed", undefined, errors.bed_time)}
          />
        </Field>
        <Field
          id="p-phone"
          label="Mobile number for iMessage (optional)"
          hint="International format, for example +13135550123."
          error={errors.phone_e164}
          className="sm:col-span-2"
        >
          <Input
            id="p-phone"
            type="tel"
            autoComplete="tel"
            placeholder="+13135550123"
            value={value.phone_e164}
            onChange={(e) => set("phone_e164", e.target.value)}
            {...describedBy("p-phone", "International format, for example +13135550123.", errors.phone_e164)}
          />
        </Field>
      </div>
      <Button type="submit" size="lg" className="h-10 px-5" disabled={busy}>
        {busy ? "Saving..." : "Save and continue"}
      </Button>
    </form>
  );
}
