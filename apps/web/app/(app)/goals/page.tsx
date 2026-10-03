import type { Metadata } from "next";
import { GoalsManager } from "@/components/goals/goals-manager";
import { PageHeader } from "@/components/page-header";
import { listGoals } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Goals" };
export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await requireUser();
  // If the read fails, the client component loads the list itself and shows the error state.
  const initial = await listGoals(user.id).catch(() => undefined);
  return (
    <>
      <PageHeader eyebrow="Targets" title="Goals">
        Pulse tracks each active goal and tells you where you stand.
      </PageHeader>
      <div className="max-w-3xl">
        <GoalsManager initial={initial} />
      </div>
    </>
  );
}
