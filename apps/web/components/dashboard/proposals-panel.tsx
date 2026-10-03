"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote, ListSkeleton } from "@/components/ui-bits";
import { errorText, me } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { ProposalView } from "@/lib/queries";
import { usePolling } from "@/lib/use-polling";

type Decision = "approved" | "rejected";

export function ProposalsPanel({ initial }: { initial?: ProposalView[] }) {
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
    <ul className="space-y-4">
      {proposals.map((p) => {
        const busy = pending[p.id];
        return (
          <li key={p.id} className="rounded-lg border border-border p-4">
            <p className="text-base font-semibold">{p.title}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {formatDateTime(p.starts_at)} to {formatDateTime(p.ends_at)}
            </p>
            <p className="mt-3 max-w-[65ch] text-sm">{p.rationale}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                disabled={busy !== undefined}
                onClick={() => void decide(p, "approved")}
                aria-label={`Approve: ${p.title}`}
              >
                {busy === "approved" ? "Approving..." : "Approve"}
              </Button>
              <Button
                variant="outline"
                disabled={busy !== undefined}
                onClick={() => void decide(p, "rejected")}
                aria-label={`Reject: ${p.title}`}
              >
                {busy === "rejected" ? "Rejecting..." : "Reject"}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
