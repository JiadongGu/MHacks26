"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Clock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote, ListSkeleton } from "@/components/ui-bits";
import { errorText, me } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { ProposalView } from "@/lib/queries";
import { usePolling } from "@/lib/use-polling";
import { clockLabel } from "@/lib/vitals-card";

type Decision = "approved" | "rejected";

/** What the alert behind a proposal saved: the readings, and where to read more. */
export type ProposalExtras = { signals: string[]; whyHref: string };

export function ProposalsPanel({
  initial,
  extras = {},
}: {
  initial?: ProposalView[];
  extras?: Record<string, ProposalExtras>;
}) {
  const { data, setData, error, loading, refresh } = usePolling(
    async () => (await me<{ proposals: ProposalView[] }>("/proposals")).proposals,
    { label: "Proposals", intervalMs: 15_000, initial },
  );
  const [pending, setPending] = useState<Record<string, Decision>>({});

  async function decide(p: ProposalView, decision: Decision) {
    setPending((s) => ({ ...s, [p.id]: decision }));
    try {
      const res = await me<{ status: string }>(`/proposals/${p.id}/decide`, {
        body: { decision },
      });
      if (decision === "rejected") toast.success("Proposal rejected.");
      else if (res.status === "applied") toast.success("Approved. The event is on your calendar.");
      else if (res.status === "failed") toast.warning("Approved, but the calendar write failed. Try again.");
      else toast.success("Approved. Pulse will add it to your calendar.");
      setData((data ?? []).filter((x) => x.id !== p.id));
      void refresh();
    } catch (err) {
      toast.error(`Could not ${decision === "approved" ? "approve" : "reject"}: ${errorText(err)}`);
    } finally {
      setPending((s) => {
        const next = { ...s };
        delete next[p.id];
        return next;
      });
    }
  }

  if (loading) return <ListSkeleton rows={1} label="Loading proposals" />;
  if (error && !data) {
    return (
      <ErrorNote
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        }
      >
        Could not load proposals. {error}
      </ErrorNote>
    );
  }
  const proposals = data ?? [];
  if (proposals.length === 0) {
    return (
      <EmptyState title="Nothing waiting for your decision">
        When Pulse wants to change your calendar, the proposal shows here and in iMessage.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {proposals.map((p) => {
        const busy = pending[p.id];
        const extra = extras[p.id];
        return (
          <li key={p.id} className="rounded-lg border border-border bg-card p-4 md:p-5">
            <div className="flex gap-3">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground"
                aria-hidden="true"
              >
                <CalendarPlus className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <h3 className="text-base font-semibold">{p.title}</h3>
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs font-medium">
                    <Clock className="size-3" aria-hidden="true" />
                    <span suppressHydrationWarning>
                      {formatDateTime(p.starts_at)} to {clockLabel(p.ends_at)}
                    </span>
                  </span>
                </div>
                <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{p.rationale}</p>
                {extra && extra.signals.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label="Signals behind this">
                    {extra.signals.map((s) => (
                      <li
                        key={s}
                        className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs font-medium tabular-nums"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    size="lg"
                    className="h-9 px-4"
                    disabled={busy !== undefined}
                    onClick={() => void decide(p, "approved")}
                    aria-label={`Approve: ${p.title}`}
                  >
                    {busy === "approved" ? "Approving..." : "Approve"}
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-9 px-4"
                    disabled={busy !== undefined}
                    onClick={() => void decide(p, "rejected")}
                    aria-label={`Not tonight, reject: ${p.title}`}
                  >
                    {busy === "rejected" ? "Rejecting..." : "Not tonight"}
                  </Button>
                  <Link
                    href={extra?.whyHref ?? "/alerts"}
                    className="ml-1 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Why this?
                    <span className="sr-only"> {p.title}</span>
                  </Link>
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                  Added to your calendar only after you approve.
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
