import { redirect } from "next/navigation";

// The calendar page is gone. Planned events stay in Google Calendar. This keeps old links alive.
export default function CalendarPage() {
  redirect("/dashboard");
}
