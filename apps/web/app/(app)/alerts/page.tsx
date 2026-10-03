import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TodoCard } from "@/components/todo-card";

export const metadata: Metadata = { title: "Alerts" };

export default function AlertsPage() {
  return (
    <>
      <PageHeader eyebrow="Alerts" title="Alerts">
        What Pulse noticed, and what it asked you to do.
      </PageHeader>
      <TodoCard
        items={[
          "Feed of alerts by severity: info, nudge, warning, urgent.",
          "Mark an alert as read or acknowledged.",
          "Calendar proposal attached to an alert, with Approve and Reject.",
          "Empty state when there are no alerts.",
        ]}
      />
    </>
  );
}
