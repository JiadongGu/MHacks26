import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TodoCard } from "@/components/todo-card";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <>
      <PageHeader eyebrow="Goals" title="Your goals">
        Daily and weekly targets, and how you are doing against them.
      </PageHeader>
      <TodoCard
        items={[
          "List of active goals with progress.",
          "Create, edit, and pause a goal.",
          "Empty state for a new account.",
        ]}
      />
    </>
  );
}
