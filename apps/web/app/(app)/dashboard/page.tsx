import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TodoCard } from "@/components/todo-card";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader eyebrow="Today" title="Dashboard">
        Your status, live heart rate, goals, and open proposals.
      </PageHeader>
      <TodoCard
        items={[
          "Status line with the one-sentence summary of your twin.",
          "Heart rate for the last 3 hours, refreshed every 30 seconds.",
          "Steps and active minutes against your goals.",
          "Last night's sleep, HRV, and SpO2.",
          "Pending calendar proposals with Approve and Reject.",
          "Alert feed and the morning briefing.",
        ]}
      />
    </>
  );
}
