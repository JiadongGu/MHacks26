// Async Server Components for the dashboard. Each one reads Neon on the server and handles its own error.
import Link from "next/link";
import { CircleCheck, MessageCircle, TriangleAlert, type LucideIcon } from "lucide-react";
import { StatusPill } from "@/components/vitals/status-pill";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { DEFAULT_TIMEZONE, localDay } from "@/lib/briefing";
import { addDays } from "@/lib/calendar-week";
import { canExplain } from "@/lib/explain";
import { formatDateTime, timeAgo } from "@/lib/format";
import {
  getDailyMetricRows,
  getLatestTwin,
  lastAgentSeen,
  listAlerts,
  listPendingProposals,
  listUpcomingImportant,
  type AlertView,
} from "@/lib/queries";
import { buildTrends } from "@/lib/trends";
import { STATUS_LABEL, readTwin, type TwinStatus } from "@/lib/twin";
import { getVitalsPanel } from "@/lib/vitals";
import { TONE_COLORS, clockLabel, explainChips, signalChips, type Tone } from "@/lib/vitals-card";
import { AlertsFeed } from "./alerts-feed";
import { HrSparkline } from "./hr-sparkline";
import { ProposalsPanel, type ProposalExtras } from "./proposals-panel";

/** The check-ins have their own section, so the alert list leaves them out. */
const CHECKIN_KINDS = ["morning_briefing", "evening_check", "welcome"];

const TWIN_TONE: Record<TwinStatus, Tone> = {
  normal: "normal",
  recovering: "borderline",
  strained: "borderline",
  possibly_ill: "out",
};

const CHIP_ICON: Partial<Record<Tone, LucideIcon>> = { borderline: TriangleAlert, out: TriangleAlert };

const STATUS_HEADLINE: Record<TwinStatus, string> = {
  normal: "Your numbers are in your usual range.",
  recovering: "You are recovering. Keep today easy.",
  strained: "Your body is under extra strain today.",
  possibly_ill: "Your body may be fighting something. Rest tonight.",
};

export async function StatusHero({ userId, timeZone }: { userId: string; timeZone: string | null }) {
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
  const today = localDay(timeZone || DEFAULT_TIMEZONE);
  const [rows, alerts] = await Promise.all([
    getDailyMetricRows(userId, addDays(today, -13)).catch(() => []),
    listAlerts(userId, 20).catch((): AlertView[] => []),
  ]);
  const chips = signalChips(buildTrends(rows, today, 7, view.baselines));
  const why = alerts.find((a) => !CHECKIN_KINDS.includes(a.kind) && canExplain(a.kind, a.explain));
  const insights = view.insights.slice(0, 2);
  const headline = view.status
    ? STATUS_HEADLINE[view.status]
    : (view.insights[0] ?? "Pulse has not rated your numbers yet.");

  return (
    <section aria-labelledby="h-status" className="rounded-lg border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="h-status" className="sr-only">
          Twin status
        </h2>
        {view.status ? (
          <StatusPill
            tone={TWIN_TONE[view.status]}
            word={STATUS_LABEL[view.status]}
            variant="pill"
            className="text-sm"
          />
        ) : (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-sm font-semibold text-muted-foreground">
            <CircleCheck className="size-3.5" aria-hidden="true" />
            Not rated yet
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Updated{" "}
          <time dateTime={twin.created_at.toISOString()} suppressHydrationWarning>
            {timeAgo(twin.created_at)}
          </time>
        </span>
      </div>

      <p className="mt-4 max-w-[60ch] text-[1.375rem] leading-[1.75rem] font-semibold tracking-tight text-balance">
        {headline}
      </p>

      {chips.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Key signals">
          {chips.map((c) => {
            const Icon = CHIP_ICON[c.tone];
            return (
              <li
                key={c.text}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[0.8125rem] font-medium tabular-nums"
              >
                {Icon && <Icon className="size-3.5" style={{ color: TONE_COLORS[c.tone].ink }} aria-hidden="true" />}
                {c.text}
                {Icon && <span className="sr-only">, {c.tone === "out" ? "out of range" : "borderline"}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild size="lg" className="h-9 px-4">
          <Link href="/conversations">
            <MessageCircle aria-hidden="true" />
            Talk to Pulse
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-9 px-4">
          <Link href={why ? `#alert-${why.id}` : "/alerts"}>Why Pulse thinks this</Link>
        </Button>
      </div>

      <details className="group mt-5 border-t border-border pt-4">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-medium text-primary outline-none marker:hidden focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          Details
          <span aria-hidden="true" className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
            &rsaquo;
          </span>
        </summary>
        {twin.summary && <p className="mt-3 max-w-[60ch] whitespace-pre-line text-sm">{twin.summary}</p>}
        {insights.length > 0 && (
          <ul className="mt-3 max-w-[60ch] list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {insights.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Twin version {twin.version}.{" "}
          <Link href="/twin" className="underline underline-offset-4 hover:text-foreground">
            See the full twin
          </Link>
        </p>
      </details>
    </section>
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
  const [initial, alerts] = await Promise.all([
    listPendingProposals(userId).catch(() => undefined),
    listAlerts(userId, 50).catch((): AlertView[] => []),
  ]);
  // The alert that led to a proposal carries the readings behind it.
  const extras: Record<string, ProposalExtras> = {};
  for (const a of alerts) {
    if (a.proposal_id && !extras[a.proposal_id]) {
      extras[a.proposal_id] = { signals: explainChips(a.explain), whyHref: `/alerts#alert-${a.id}` };
    }
  }
  return <ProposalsPanel initial={initial} extras={extras} />;
}

export async function AlertsSection({ userId }: { userId: string }) {
  const initial = await listAlerts(userId, 20).catch(() => undefined);
  return <AlertsFeed initial={initial} limit={20} hideKinds={CHECKIN_KINDS} />;
}

function dateBlock(iso: string, timeZone: string): { weekday: string; day: string } {
  const d = new Date(iso);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(d),
    day: new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone }).format(d),
  };
}

export async function UpcomingEvents({ userId, timeZone }: { userId: string; timeZone?: string | null }) {
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
  const zone = timeZone || DEFAULT_TIMEZONE;
  return (
    <ul className="space-y-3">
      {events.map((e) => {
        const b = dateBlock(e.starts_at, zone);
        return (
          <li key={e.event_id} className="flex items-center gap-3">
            <div className="grid w-11 shrink-0 place-items-center rounded-md bg-muted py-1 text-center" aria-hidden="true">
              <span className="text-[0.6875rem] leading-4 font-semibold text-muted-foreground uppercase">{b.weekday}</span>
              <span className="text-base leading-5 font-bold">{b.day}</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{e.title}</p>
              <p className="text-xs text-muted-foreground">
                <span className="sr-only">{formatDateTime(e.starts_at, zone)}. </span>
                {clockLabel(e.starts_at, zone)} to {clockLabel(e.ends_at, zone)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** True when the timestamp is older than 15 minutes. */
function isStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 15 * 60_000;
}

/** The "Synced N min ago" pill for the page header. It says so when the agent may be offline. */
export async function AgentSeen() {
  let at: string | null = null;
  try {
    at = await lastAgentSeen();
  } catch (err) {
    console.error("AgentSeen failed", err);
  }
  if (!at) return null;
  const stale = isStale(at);
  const Icon = stale ? TriangleAlert : CircleCheck;
  const ink = TONE_COLORS[stale ? "borderline" : "normal"].ink;
  return (
    <p
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium"
      title={formatDateTime(at)}
    >
      <Icon className="size-3.5" style={{ color: ink }} aria-hidden="true" />
      <span>
        {stale ? "Last synced " : "Synced "}
        <time dateTime={at} suppressHydrationWarning>
          {timeAgo(at)}
        </time>
        {stale ? ". The agent may be offline." : ""}
      </span>
    </p>
  );
}
