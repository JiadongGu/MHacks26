// Async Server Component. Reads today's briefing (user's local day) from Neon and hands it to the card.
import { ErrorNote } from "@/components/ui-bits";
import { localDay } from "@/lib/briefing";
import { getBriefing } from "@/lib/queries";
import { BriefingPanel } from "./briefing-panel";

export async function BriefingSection({
  userId,
  timeZone,
}: {
  userId: string;
  timeZone: string | null;
}) {
  let briefing;
  try {
    briefing = await getBriefing(userId, localDay(timeZone));
  } catch (err) {
    console.error("BriefingSection failed", err);
    return <ErrorNote>Could not load your briefing. Reload the page to try again.</ErrorNote>;
  }
  return <BriefingPanel briefing={briefing} />;
}
