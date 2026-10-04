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
    <div className="max-w-xl space-y-2">
      <section aria-labelledby="connect-calendar" className="space-y-3 pb-5">
        <h3 id="connect-calendar" className="text-base font-semibold">
          Google Calendar
        </h3>
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          Pulse fits your focus areas into the free time between your events, and writes them to its own
          &quot;Pulse Health&quot; calendar. It changes your main calendar only when you approve.
        </p>
        <GoogleStatusCard returnTo="onboarding" />
      </section>
      <StepDevices simulate={simulate} setSimulate={setSimulate} returnTo="onboarding" />
    </div>
  );
}
