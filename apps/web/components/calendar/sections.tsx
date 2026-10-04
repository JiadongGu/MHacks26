// Async Server Components for /calendar. Each one reads Neon on the server and handles its own error.
import { ErrorNote } from "@/components/ui-bits";
import { ApprovalHistory } from "@/components/calendar/approval-history";
import { WeekNav, WeekView } from "@/components/calendar/week-view";
import { addDays, buildWeek, mondayOf, weekLabel, weekRange } from "@/lib/calendar-week";
import {
  listDailyPlansBetween,
  listEventsBetween,
  listProposalHistory,
  listProposalsBetween,
} from "@/lib/queries";

export async function WeekSection({
  userId,
  monday,
  today,
  timeZone,
}: {
  userId: string;
  monday: string;
  today: string;
  timeZone: string;
}) {
  const { from, to } = weekRange(monday, timeZone);
  let days;
  try {
    const [events, proposals, plans] = await Promise.all([
      listEventsBetween(userId, from, to),
      listProposalsBetween(userId, from, to),
      listDailyPlansBetween(userId, monday, addDays(monday, 6)),
    ]);
    days = buildWeek({ monday, timeZone, events, proposals, plans });
  } catch (err) {
    console.error("WeekSection failed", err);
    return <ErrorNote>Could not load this week. Reload the page to try again.</ErrorNote>;
  }
  const currentMonday = mondayOf(today);
  return (
    <div className="space-y-6">
      <WeekNav
        prev={addDays(monday, -7)}
        next={addDays(monday, 7)}
        thisWeek={currentMonday}
        label={weekLabel(monday)}
        isCurrent={monday === currentMonday}
      />
      <WeekView days={days} today={today} timeZone={timeZone} />
    </div>
  );
}

export async function HistorySection({ userId, timeZone }: { userId: string; timeZone: string }) {
  let proposals;
  try {
    proposals = await listProposalHistory(userId, 50);
  } catch (err) {
    console.error("HistorySection failed", err);
    return <ErrorNote>Could not load your approval history. Reload the page to try again.</ErrorNote>;
  }
  return <ApprovalHistory proposals={proposals} timeZone={timeZone} />;
}
