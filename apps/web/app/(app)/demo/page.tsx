import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TodoCard } from "@/components/todo-card";
import { getSessionUser } from "@/lib/auth/server";
import { isTeamEmail } from "@/lib/team";

export const metadata: Metadata = { title: "Demo" };
export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const user = await getSessionUser();
  // A visitor who is not on the team list sees a normal 404.
  if (!isTeamEmail(user?.email)) notFound();

  return (
    <>
      <PageHeader eyebrow="Team only" title="Demo control panel">
        Drives the live demo for the judges.
      </PageHeader>
      <TodoCard
        items={[
          "One button for each Apple Watch scenario.",
          "Run the morning briefing now.",
          "Rebuild the twin.",
          "Live log of the last 10 alerts and messages.",
        ]}
      />
    </>
  );
}
