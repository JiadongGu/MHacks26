"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui-bits";
import { agent, ApiError, errorText, isEndpointMissing } from "@/lib/api-client";

export function StepDone() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await agent("/twin/me/rebuild", { method: "POST", body: {} });
    } catch (err) {
      // A 404 means no rebuild route yet, or no twin yet. Neither blocks the dashboard.
      if (!(isEndpointMissing(err) || (err instanceof ApiError && err.status === 404))) {
        const text = errorText(err);
        setError(text);
        toast.error(`Could not build your twin: ${text}`);
        setBusy(false);
        return;
      }
    }
    router.push("/dashboard");
  }

  return (
    <div className="max-w-xl space-y-6">
      <p className="max-w-[60ch] text-base">
        Pulse builds the first full version of your digital twin now. It uses your profile, your record, and
        any device data it has. This takes a few seconds.
      </p>
      {error && (
        <ErrorNote
          action={
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
              Go to dashboard anyway
            </Button>
          }
        >
          The twin build failed. {error}
        </ErrorNote>
      )}
      <Button size="lg" className="h-10 px-5" onClick={() => void finish()} disabled={busy}>
        {busy ? "Building your twin..." : error ? "Try again" : "Build my twin and open the dashboard"}
      </Button>
    </div>
  );
}
