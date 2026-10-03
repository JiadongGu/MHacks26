import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TodoCard } from "@/components/todo-card";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings">
        Channels, quiet hours, connected services, and your account.
      </PageHeader>
      <TodoCard
        items={[
          "Channels: iMessage link status.",
          "Quiet hours.",
          "Disconnect Fitbit or Google Calendar.",
          "Delete account.",
        ]}
      />
    </>
  );
}
