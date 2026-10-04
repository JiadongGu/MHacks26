// Async Server Component. Reads the latest evening check (last 30 hours) from Neon and hands it to the card.
import { ErrorNote } from "@/components/ui-bits";
import { getRecentAlertOfKind } from "@/lib/queries";
import { EveningPanel } from "./evening-panel";

export async function EveningSection({ userId }: { userId: string }) {
  let alert;
  try {
    alert = await getRecentAlertOfKind(userId, "evening_check", 30);
  } catch (err) {
    console.error("EveningSection failed", err);
    return <ErrorNote>Could not load your evening check. Reload the page to try again.</ErrorNote>;
  }
  return <EveningPanel alert={alert} />;
}
