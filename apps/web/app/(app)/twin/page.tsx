import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TodoCard } from "@/components/todo-card";

export const metadata: Metadata = { title: "Twin" };

export default function TwinPage() {
  return (
    <>
      <PageHeader eyebrow="Digital twin" title="Your twin">
        What Pulse knows about you, and how it changed over time.
      </PageHeader>
      <TodoCard
        items={[
          "Profile, conditions, medications, labs, and family history.",
          "Baselines and alert thresholds.",
          "Insights.",
          "Version timeline.",
        ]}
      />
    </>
  );
}
