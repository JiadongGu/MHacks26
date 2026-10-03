import type { Metadata } from "next";
import { AlertsFeed } from "@/components/dashboard/alerts-feed";
import { PageHeader } from "@/components/page-header";
import { listAlerts } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Alerts" };
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const user = await requireUser();
  const initial = await listAlerts(user.id, 100).catch(() => undefined);
  return (
    <>
      <PageHeader eyebrow="History" title="Alerts">
        Everything Pulse has told you, newest first. The list refreshes every 15 seconds.
      </PageHeader>
      <div className="max-w-3xl">
        <AlertsFeed
          initial={initial}
          limit={100}
          emptyHint="Pulse adds an alert here when it sees something worth your attention, such as a workout, a high resting heart rate, or a poor night of sleep."
        />
      </div>
    </>
  );
}
