"use client";

import { GoogleStatusCard } from "./google-status";
import { StepDevices } from "./step-devices";

/** Calendar and watch in one step. Calendar comes first: the daily plan is built around it. */
export function StepConnect({
  simulate,
  setSimulate,
}: {
  simulate: boolean;
  setSimulate: (on: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <section aria-labelledby="connect-calendar" className="rounded-lg border border-border p-4">
        <h3 id="connect-calendar" className="sr-only">
          Google Calendar
        </h3>
        <p className="mb-4 max-w-[60ch] text-sm text-muted-foreground">
          Pulse fits your focus areas into the free time between your events, and writes them to its own
          &quot;Pulse Health&quot; calendar. It changes your main calendar only when you approve.
        </p>
        <GoogleStatusCard returnTo="onboarding" />
      </section>
      <StepDevices simulate={simulate} setSimulate={setSimulate} returnTo="onboarding" />
    </div>
  );
}
