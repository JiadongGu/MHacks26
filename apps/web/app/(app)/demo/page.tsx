import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoPanel } from "@/components/demo/demo-panel";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/auth/server";
import { listAlerts, listMessages } from "@/lib/queries";
import { isTeamEmail } from "@/lib/team";

export const metadata: Metadata = { title: "Demo" };
export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const user = await getSessionUser();
  // A visitor who is not on the team list sees a normal 404.
  if (!user || !isTeamEmail(user.email)) notFound();

  const [alerts, messages] = await Promise.all([
    listAlerts(user.id, 10).catch(() => undefined),
    listMessages(user.id, 10).catch(() => undefined),
  ]);

  return (
    <>
      <PageHeader eyebrow="Team only" title="Demo control panel">
        Drives the live demo for the judges.
      </PageHeader>
      <DemoPanel initialAlerts={alerts} initialMessages={messages} />
    </>
  );
}
