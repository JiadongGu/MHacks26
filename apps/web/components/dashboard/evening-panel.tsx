"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Moon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import { timeAgo } from "@/lib/format";
import type { AlertView } from "@/lib/queries";

/** The evening check: tonight's bedtime and tomorrow's plan. Pulse sends it around 9 pm. */
export function EveningPanel({ alert }: { alert: AlertView | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function run() {
    setBusy(true);
    try {
      const res = await agent<{ ran: boolean }>("/demo/evening", { method: "POST", body: {} });
      if (!res?.ran) {
        toast.error("Could not run the evening check. Try again.");
        return;
      }
      toast.success("Evening check ready.");
      startRefresh(() => router.refresh());
    } catch (err) {
      toast.error(`Could not run the evening check: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const button = (
    <Button variant="outline" size="sm" onClick={() => void run()} disabled={busy || refreshing}>
      {busy || refreshing ? "Running..." : alert ? "Run it again" : "Run it now"}
    </Button>
  );

  if (!alert) {
    return (
      <EmptyState title="No evening check yet" action={button}>
        Around 9 pm Pulse looks at tomorrow&apos;s calendar and tells you when to wind down and what the day holds.
      </EmptyState>
    );
  }
  return (
    <div className="max-w-xl">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Moon className="size-3.5" aria-hidden="true" />
        <time dateTime={alert.created_at} suppressHydrationWarning>
          {timeAgo(alert.created_at)}
        </time>
      </p>
      <p className="mt-2 max-w-[60ch] text-base">{alert.body}</p>
      <div className="mt-3">{button}</div>
    </div>
  );
}
