// Async Server Component. Reads today's and tomorrow's plans (the user's local days) and hands them to the cards.
import { ErrorNote } from "@/components/ui-bits";
import { DEFAULT_TIMEZONE, localDay } from "@/lib/briefing";
import { getDailyPlan } from "@/lib/queries";
import { PlanPanel } from "./plan-panel";

function addDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function PlanSection({ userId, timeZone }: { userId: string; timeZone: string | null }) {
  const zone = timeZone || DEFAULT_TIMEZONE;
  let plan, next;
  try {
    const today = localDay(zone);
    [plan, next] = await Promise.all([getDailyPlan(userId, today), getDailyPlan(userId, addDay(today))]);
  } catch (err) {
    console.error("PlanSection failed", err);
    return <ErrorNote>Could not load today&apos;s plan. Reload the page to try again.</ErrorNote>;
  }
  const nowIso = new Date().toISOString();
  return (
    <div className="space-y-8">
      <PlanPanel plan={plan} timeZone={zone} nowIso={nowIso} />
      {next && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">Tomorrow</h3>
          <PlanPanel plan={next} timeZone={zone} nowIso={nowIso} when="tomorrow" />
        </div>
      )}
    </div>
  );
}
