// Async Server Component. Reads today's plan (the user's local day) from Neon and hands it to the card.
import { ErrorNote } from "@/components/ui-bits";
import { DEFAULT_TIMEZONE, localDay } from "@/lib/briefing";
import { getDailyPlan } from "@/lib/queries";
import { PlanPanel } from "./plan-panel";

export async function PlanSection({ userId, timeZone }: { userId: string; timeZone: string | null }) {
  const zone = timeZone || DEFAULT_TIMEZONE;
  let plan;
  try {
    plan = await getDailyPlan(userId, localDay(zone));
  } catch (err) {
    console.error("PlanSection failed", err);
    return <ErrorNote>Could not load today&apos;s plan. Reload the page to try again.</ErrorNote>;
  }
  return <PlanPanel plan={plan} timeZone={zone} nowIso={new Date().toISOString()} />;
}
