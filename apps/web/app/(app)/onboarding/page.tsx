import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TodoCard } from "@/components/todo-card";

export const metadata: Metadata = { title: "Setup" };

export default function OnboardingPage() {
  return (
    <>
      <PageHeader eyebrow="Setup" title="Set up Pulse">
        Seven short steps. You can leave and come back at any step.
      </PageHeader>
      <TodoCard
        items={[
          "Profile: name, date of birth, height, weight, timezone, wake and bed time, phone.",
          "Health history: import records with FinchNode, then edit.",
          "Devices: connect Fitbit or simulate an Apple Watch.",
          "Google Calendar: connect, or skip.",
          "Goals: pick presets and edit them.",
          "iMessage: show the Photon number and the PULSE link code.",
          "Done: build twin v1 and open the dashboard.",
        ]}
      />
    </>
  );
}
