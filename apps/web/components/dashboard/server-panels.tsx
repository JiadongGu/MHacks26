// Async Server Components for the dashboard. Each one reads Neon on the server and handles its own error.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { formatDateTime, timeAgo } from "@/lib/format";
import {
  getLatestTwin,
  lastAgentSeen,
  listAlerts,
  listPendingProposals,
  listUpcomingImportant,
} from "@/lib/queries";
import { STATUS_LABEL, readTwin } from "@/lib/twin";
import { getVitalsPanel } from "@/lib/vitals";
import { AlertsFeed } from "./alerts-feed";
import { HrSparkline } from "./hr-sparkline";
import { ProposalsPanel } from "./proposals-panel";

export async function StatusHero({ userId }: { userId: string }) {
  let twin;
  try {
    twin = await getLatestTwin(userId);
  } catch (err) {
    console.error("StatusHero failed", err);
    return <ErrorNote>Could not load your twin. Reload the page to try again.</ErrorNote>;
  }
  if (!twin) {
    return (
      <EmptyState
        title="Your twin is not built yet"
        action={
          <Button asChild>
            <Link href="/onboarding">Finish setup</Link>
          </Button>
        }
      >
        Pulse builds your twin from your profile and your imported record.
      </EmptyState>
    );
  }
  const view = readTwin(twin.model);
  const insights = view.insights.slice(0, 2);
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Twin status
      </p>
      <h2 className="mt-2 text-5xl">{view.status ? STATUS_LABEL[view.status] : "Not rated yet"}</h2>
      {twin.summary && <p className="mt-4 max-w-[60ch] whitespace-pre-line text-base">{twin.summary}</p>}
      {insights.length > 0 && (
        <ul className="mt-3 max-w-[60ch] list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {insights.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Twin version {twin.version}, updated{" "}
        <time dateTime={twin.created_at.toISOString()} suppressHydrationWarning>
          {timeAgo(twin.created_at)}
        </time>
        .{" "}
        <Link href="/twin" className="underline underline-offset-4 hover:text-foreground">
          See the full twin
        </Link>
      </p>
    </div>
  );
}

export async function HrPanel({ userId }: { userId: string }) {
  // When the first read fails, the client panel loads on mount and shows its own error note.
  const initial = await getVitalsPanel(userId).catch((err) => {
    console.error("HrPanel failed", err);
    return undefined;
  });
  return <HrSparkline initial={initial} />;
}

export async function ProposalsSection({ userId }: { userId: string }) {
  const initial = await listPendingProposals(userId).catch(() => undefined);
  return <ProposalsPanel initial={initial} />;
}

export async function AlertsSection({ userId }: { userId: string }) {
  const initial = await listAlerts(userId, 20).catch(() => undefined);
  // The check-ins have their own section, so they are not repeated here.
  return <AlertsFeed initial={initial} limit={20} hideKinds={["morning_briefing", "evening_check", "welcome"]} />;
}

export async function UpcomingEvents({ userId }: { userId: string }) {
  let events;
  try {
    events = await listUpcomingImportant(userId, 48);
  } catch (err) {
    console.error("UpcomingEvents failed", err);
    return <ErrorNote>Could not load events. Reload the page to try again.</ErrorNote>;
  }
  if (events.length === 0) {
    return (
      <EmptyState
        title="No important events in the next 48 hours"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">Check calendar connection</Link>
          </Button>
        }
      >
        Pulse watches your calendar for exams, flights, and races.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-border border-y border-border">
      {events.map((e) => (
        <li key={e.event_id} className="py-3">
          <p className="text-sm font-medium">{e.title}</p>
          <p className="font-mono text-xs text-muted-foreground">{formatDateTime(e.starts_at)}</p>
        </li>
      ))}
    </ul>
  );
}

/** True when the timestamp is older than 15 minutes. */
function isStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 15 * 60_000;
}

export async function AgentSeen() {
  let at: string | null = null;
  try {
    at = await lastAgentSeen();
  } catch (err) {
    console.error("AgentSeen failed", err);
  }
  if (!at) {
    return <p className="text-sm text-muted-foreground">Agent last seen: unknown</p>;
  }
  const stale = isStale(at);
  return (
    <p className="text-sm text-muted-foreground">
      Agent last seen{" "}
      <time dateTime={at} title={formatDateTime(at)} suppressHydrationWarning className="text-foreground">
        {timeAgo(at)}
      </time>
      {stale ? ". It may be offline." : "."}
    </p>
  );
}
