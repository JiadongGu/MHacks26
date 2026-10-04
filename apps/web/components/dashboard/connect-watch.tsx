// Shown in place of the number and chart sections when no watch is connected, so nothing empty or invented appears.
import Link from "next/link";
import { Watch } from "lucide-react";

export function ConnectWatch() {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Watch className="size-4" aria-hidden="true" />
        No watch connected
      </p>
      <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
        Connect your Fitbit to see your sleep, heart rate, steps and trends. Until then Pulse shows only what it can
        really measure.
      </p>
      <Link
        href="/settings#s-connections"
        className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
      >
        Connect a watch
      </Link>
    </div>
  );
}
