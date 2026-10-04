// Async Server Component. Both check-ins, the most recent first. A check-in that has not run yet comes last.
import { ErrorNote } from "@/components/ui-bits";
import { localDay } from "@/lib/briefing";
import { getBriefing, getRecentAlertOfKind } from "@/lib/queries";
import { CheckinCard } from "./checkin-card";

type Item = { kind: "morning" | "evening" | "checkin"; text: string | null; createdAt: string | null };

/** Newest first; anything without a time goes last, keeping morning before evening. */
export function orderCheckins(items: Item[]): Item[] {
  const t = (i: Item) => (i.createdAt ? new Date(i.createdAt).getTime() : -Infinity);
  return [...items].sort((a, b) => t(b) - t(a));
}

export async function CheckinsSection({ userId, timeZone }: { userId: string; timeZone: string | null }) {
  let briefing, evening, checkin;
  try {
    [briefing, evening, checkin] = await Promise.all([
      getBriefing(userId, localDay(timeZone)),
      getRecentAlertOfKind(userId, "evening_check", 30),
      getRecentAlertOfKind(userId, "checkin", 30),
    ]);
  } catch (err) {
    console.error("CheckinsSection failed", err);
    return <ErrorNote>Could not load your check-ins. Reload the page to try again.</ErrorNote>;
  }
  const items = orderCheckins([
    { kind: "morning", text: briefing?.text ?? null, createdAt: briefing?.created_at ?? null },
    { kind: "evening", text: evening?.body ?? null, createdAt: evening?.created_at ?? null },
    { kind: "checkin", text: checkin?.body ?? null, createdAt: checkin?.created_at ?? null },
  ]);
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <CheckinCard key={i.kind} kind={i.kind} text={i.text} createdAt={i.createdAt} />
      ))}
    </div>
  );
}
