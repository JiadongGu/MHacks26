"use client";

import { StepDone } from "./step-done";
import { StepImessage } from "./step-imessage";

/** Last step: optional messaging links, then build the twin and open the dashboard. */
export function StepFinish({
  photonNumber,
  phone,
  alreadyLinked,
  onLinked,
}: {
  photonNumber: string | null;
  phone: string;
  alreadyLinked: boolean;
  onLinked: () => void;
}) {
  return (
    <div className="max-w-xl space-y-12">
      <section aria-labelledby="finish-messages" className="space-y-4">
        <h2 id="finish-messages" className="text-xl font-semibold">
          Text with Pulse (optional)
        </h2>
        <StepImessage photonNumber={photonNumber} phone={phone} alreadyLinked={alreadyLinked} onLinked={onLinked} />
      </section>
      <section aria-labelledby="finish-build" className="space-y-4 border-t border-border pt-8">
        <h2 id="finish-build" className="text-xl font-semibold">
          Build your twin
        </h2>
        <StepDone />
      </section>
    </div>
  );
}
