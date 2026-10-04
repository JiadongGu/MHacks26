"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui-bits";
import { ProposalStatusBadge } from "@/components/calendar/status-badge";
import { errorText, me } from "@/lib/api-client";
import { isDecidable, statusMeaning } from "@/lib/calendar-week";
import { formatDateTime } from "@/lib/format";
import type { ProposalDetailView } from "@/lib/queries";

type Decision = "approved" | "rejected";

/** Every calendar proposal, newest first. A pending one has Approve and Reject buttons. */
export function ApprovalHistory({
  proposals,
  timeZone,
}: {
  proposals: ProposalDetailView[];
  timeZone: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Record<string, Decision>>({});
  const [refreshing, startRefresh] = useTransition();

  async function decide(p: ProposalDetailView, decision: Decision) {
    setBusy((s) => ({ ...s, [p.id]: decision }));
    try {
      const res = await me<{ status: string }>(`/proposals/${p.id}/decide`, { body: { decision } });
      if (decision === "rejected") toast.success("Proposal rejected.");
      else if (res.status === "failed") toast.warning("Approved, but the calendar write failed. Try again.");
      else if (res.status === "applied") toast.success("Approved. The event is on your calendar.");
      else toast.success("Approved. Pulse will add it to your calendar.");
      startRefresh(() => router.refresh());
    } catch (err) {
      toast.error(`Could not ${decision === "approved" ? "approve" : "reject"}: ${errorText(err)}`);
    } finally {
      setBusy((s) => {
        const next = { ...s };
        delete next[p.id];
        return next;
      });
    }
  }

  if (proposals.length === 0) {
    return (
      <EmptyState title="No proposals yet">
        When Pulse wants to change your schedule, the proposal shows here and in your messages. Nothing changes until you
        reply YES.
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {proposals.map((p) => {
        const mine = busy[p.id];
        const locked = mine !== undefined || refreshing;
        return (
          <li key={p.id} id={`proposal-${p.id}`} className="scroll-mt-8 py-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <p className="min-w-0 text-base font-semibold">{p.title}</p>
              <ProposalStatusBadge status={p.status} />
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {formatDateTime(p.starts_at, timeZone)} to {formatDateTime(p.ends_at, timeZone)}
            </p>
            {p.rationale && <p className="mt-3 max-w-[65ch] text-sm">{p.rationale}</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              {statusMeaning(p.status)}
              {p.decided_at ? ` Decided ${formatDateTime(p.decided_at, timeZone)}.` : ""}
              {p.applied_at ? ` Applied ${formatDateTime(p.applied_at, timeZone)}.` : ""}
              {!p.decided_at ? ` Proposed ${formatDateTime(p.created_at, timeZone)}.` : ""}
            </p>
            {isDecidable(p.status) && (
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  disabled={locked}
                  onClick={() => void decide(p, "approved")}
                  aria-label={`Approve: ${p.title}`}
                >
                  {mine === "approved" ? "Approving..." : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void decide(p, "rejected")}
                  aria-label={`Reject: ${p.title}`}
                >
                  {mine === "rejected" ? "Rejecting..." : "Reject"}
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
