// Server-only reads from Neon through Drizzle. Every function takes the session user id.
// Dates leave this file as ISO strings so client components can take them as props.
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { parseExplain, type Explain } from "@/lib/explain";
import { LINK_CODE_TTL_MS, type LinkChannel } from "@/lib/link-code";
import { parseToolCalls, type LinkRow, type ThreadMessage, type ThreadSummary } from "@/lib/conversations";
import { parseItems, type PlanView } from "@/lib/plan";
import { METRIC_KEYS, type DailyRow } from "@/lib/metrics";

export type AlertView = {
  id: string;
  kind: string;
  severity: "info" | "nudge" | "warning" | "urgent";
  title: string;
  body: string;
  proposal_id: string | null;
  created_at: string;
  read_at: string | null;
  /** payload.explain from the agent, or null for an older alert. */
  explain: Explain | null;
};

export type ProposalView = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  rationale: string;
  status: string;
  created_at: string;
};

export type EventView = {
  event_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  is_important: boolean;
};

export type MessageView = {
  id: string;
  channel: string;
  direction: "in" | "out";
  text: string;
  created_at: string;
};

export type GoalView = {
  id: string;
  metric: string;
  target: number;
  period: "day" | "week";
  direction: "at_least" | "at_most";
  active: boolean;
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export async function getProfile(userId: string) {
  const rows = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.user_id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestTwin(userId: string) {
  const rows = await db
    .select()
    .from(schema.digital_twin)
    .where(eq(schema.digital_twin.user_id, userId))
    .orderBy(desc(schema.digital_twin.version))
    .limit(1);
  return rows[0] ?? null;
}

export async function listTwinVersions(userId: string) {
  const rows = await db
    .select({
      version: schema.digital_twin.version,
      created_at: schema.digital_twin.created_at,
      summary: schema.digital_twin.summary,
    })
    .from(schema.digital_twin)
    .where(eq(schema.digital_twin.user_id, userId))
    .orderBy(desc(schema.digital_twin.version))
    .limit(50);
  return rows.map((r) => ({
    version: r.version,
    created_at: r.created_at.toISOString(),
    summary: r.summary ?? "",
  }));
}

export async function listAlerts(userId: string, limit = 20): Promise<AlertView[]> {
  const rows = await db
    .select()
    .from(schema.alerts)
    .where(eq(schema.alerts.user_id, userId))
    .orderBy(desc(schema.alerts.created_at))
    .limit(limit);
  return rows.map(toAlertView);
}

type AlertRow = typeof schema.alerts.$inferSelect;

function explainOf(payload: unknown): Explain | null {
  if (payload === null || typeof payload !== "object") return null;
  return parseExplain((payload as Record<string, unknown>).explain);
}

function toAlertView(r: AlertRow): AlertView {
  return {
    id: r.id,
    kind: r.kind,
    severity: r.severity,
    title: r.title,
    body: r.body,
    proposal_id: r.proposal_id,
    created_at: r.created_at.toISOString(),
    read_at: iso(r.read_at),
    explain: explainOf(r.payload),
  };
}

/** The stored explain object of one alert of this user. found is false when the alert is not theirs. */
export async function getAlertExplain(
  userId: string,
  alertId: string,
): Promise<{ found: boolean; explain: Explain | null }> {
  const rows = await db
    .select({ payload: schema.alerts.payload })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.user_id, userId), eq(schema.alerts.id, alertId)))
    .limit(1);
  const r = rows[0];
  return r ? { found: true, explain: explainOf(r.payload) } : { found: false, explain: null };
}

/** The newest alert of one kind from the last `hours` hours, or null. Used for the evening check card. */
export async function getRecentAlertOfKind(userId: string, kind: string, hours: number): Promise<AlertView | null> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await db
    .select()
    .from(schema.alerts)
    .where(
      and(eq(schema.alerts.user_id, userId), eq(schema.alerts.kind, kind), gte(schema.alerts.created_at, since)),
    )
    .orderBy(desc(schema.alerts.created_at))
    .limit(1);
  const r = rows[0];
  return r ? toAlertView(r) : null;
}

export async function markAlertsRead(userId: string, ids: string[] | "all"): Promise<number> {
  const where =
    ids === "all"
      ? and(eq(schema.alerts.user_id, userId), isNull(schema.alerts.read_at))
      : and(
          eq(schema.alerts.user_id, userId),
          inArray(schema.alerts.id, ids),
          isNull(schema.alerts.read_at),
        );
  const rows = await db
    .update(schema.alerts)
    .set({ read_at: new Date() })
    .where(where)
    .returning({ id: schema.alerts.id });
  return rows.length;
}

export async function listPendingProposals(userId: string): Promise<ProposalView[]> {
  const rows = await db
    .select()
    .from(schema.calendar_proposals)
    .where(
      and(
        eq(schema.calendar_proposals.user_id, userId),
        eq(schema.calendar_proposals.status, "pending"),
        gt(schema.calendar_proposals.ends_at, new Date()),
      ),
    )
    .orderBy(desc(schema.calendar_proposals.created_at))
    .limit(10);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    starts_at: r.starts_at.toISOString(),
    ends_at: r.ends_at.toISOString(),
    rationale: r.rationale,
    status: r.status,
    created_at: r.created_at.toISOString(),
  }));
}

export async function listUpcomingImportant(userId: string, hours = 48): Promise<EventView[]> {
  const now = new Date();
  const until = new Date(now.getTime() + hours * 3_600_000);
  const rows = await db
    .select()
    .from(schema.calendar_events_cache)
    .where(
      and(
        eq(schema.calendar_events_cache.user_id, userId),
        eq(schema.calendar_events_cache.is_important, true),
        gte(schema.calendar_events_cache.ends_at, now),
        lte(schema.calendar_events_cache.starts_at, until),
      ),
    )
    .orderBy(asc(schema.calendar_events_cache.starts_at))
    .limit(10);
  return rows.map((r) => ({
    event_id: r.event_id,
    title: r.title,
    starts_at: r.starts_at.toISOString(),
    ends_at: r.ends_at.toISOString(),
    is_important: r.is_important,
  }));
}

/** Latest job start time. The scheduler writes job_runs, so this is the agent heartbeat. */
export async function lastAgentSeen(): Promise<string | null> {
  const rows = await db.select({ at: max(schema.job_runs.started_at) }).from(schema.job_runs);
  const at = rows[0]?.at;
  return at ? new Date(at).toISOString() : null;
}

export async function listMessages(userId: string, limit = 10): Promise<MessageView[]> {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.user_id, userId))
    .orderBy(desc(schema.messages.created_at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    direction: r.direction,
    text: r.text,
    created_at: r.created_at.toISOString(),
  }));
}

export async function listGoals(userId: string): Promise<GoalView[]> {
  const rows = await db
    .select()
    .from(schema.goals)
    .where(eq(schema.goals.user_id, userId))
    .orderBy(desc(schema.goals.active), asc(schema.goals.created_at));
  return rows.map((r) => ({
    id: r.id,
    metric: r.metric,
    target: r.target,
    period: r.period,
    direction: r.direction,
    active: r.active,
  }));
}

export async function getChannelLinkStatus(
  userId: string,
  code: string,
  channel: LinkChannel = "imessage",
): Promise<"pending" | "linked" | "expired" | "missing"> {
  const rows = await db
    .select({ status: schema.channel_links.status, created_at: schema.channel_links.created_at })
    .from(schema.channel_links)
    .where(
      and(
        eq(schema.channel_links.user_id, userId),
        eq(schema.channel_links.channel, channel),
        eq(schema.channel_links.link_code, code),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return "missing";
  if (row.status === "pending" && Date.now() - row.created_at.getTime() > LINK_CODE_TTL_MS) return "expired";
  return row.status === "linked" ? "linked" : "pending";
}

export type BriefingView = {
  day: string;
  text: string;
  has_audio: boolean;
  created_at: string;
};

/** The saved plan for one local day (YYYY-MM-DD) of the session user, or null. */
export async function getDailyPlan(userId: string, day: string): Promise<PlanView | null> {
  const rows = await db
    .select()
    .from(schema.daily_plans)
    .where(and(eq(schema.daily_plans.user_id, userId), eq(schema.daily_plans.day, day)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    day: r.day,
    load: r.load,
    headline: r.headline,
    bed_time: r.bed_time,
    wake_time: r.wake_time,
    items: parseItems(r.items),
  };
}

/** The briefing for one local day (YYYY-MM-DD) of the session user. */
export async function getBriefing(userId: string, day: string): Promise<BriefingView | null> {
  const rows = await db
    .select({
      day: schema.briefings.day,
      text: schema.briefings.text,
      audio_url: schema.briefings.audio_url,
      created_at: schema.briefings.created_at,
    })
    .from(schema.briefings)
    .where(and(eq(schema.briefings.user_id, userId), eq(schema.briefings.day, day)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    day: r.day,
    text: r.text,
    has_audio: r.audio_url !== null,
    created_at: r.created_at.toISOString(),
  };
}

export async function hasLinkedChannel(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.channel_links.id })
    .from(schema.channel_links)
    .where(
      and(eq(schema.channel_links.user_id, userId), eq(schema.channel_links.status, "linked")),
    )
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------- calendar page

export type ProposalDetailView = ProposalView & {
  google_event_id: string | null;
  decided_at: string | null;
  applied_at: string | null;
};

function toProposalDetail(r: typeof schema.calendar_proposals.$inferSelect): ProposalDetailView {
  return {
    id: r.id,
    title: r.title,
    starts_at: r.starts_at.toISOString(),
    ends_at: r.ends_at.toISOString(),
    rationale: r.rationale,
    status: r.status,
    created_at: r.created_at.toISOString(),
    google_event_id: r.google_event_id,
    decided_at: iso(r.decided_at),
    applied_at: iso(r.applied_at),
  };
}

/** Every cached event that overlaps [from, to). Not only the important ones. */
export async function listEventsBetween(userId: string, from: Date, to: Date): Promise<EventView[]> {
  const rows = await db
    .select()
    .from(schema.calendar_events_cache)
    .where(
      and(
        eq(schema.calendar_events_cache.user_id, userId),
        lt(schema.calendar_events_cache.starts_at, to),
        gt(schema.calendar_events_cache.ends_at, from),
      ),
    )
    .orderBy(asc(schema.calendar_events_cache.starts_at))
    .limit(300);
  return rows.map((r) => ({
    event_id: r.event_id,
    title: r.title,
    starts_at: r.starts_at.toISOString(),
    ends_at: r.ends_at.toISOString(),
    is_important: r.is_important,
  }));
}

/** Pending, approved, and applied proposals that overlap [from, to). These are the Pulse blocks of the week. */
export async function listProposalsBetween(userId: string, from: Date, to: Date): Promise<ProposalDetailView[]> {
  const rows = await db
    .select()
    .from(schema.calendar_proposals)
    .where(
      and(
        eq(schema.calendar_proposals.user_id, userId),
        inArray(schema.calendar_proposals.status, ["pending", "approved", "applied"]),
        lt(schema.calendar_proposals.starts_at, to),
        gt(schema.calendar_proposals.ends_at, from),
      ),
    )
    .orderBy(asc(schema.calendar_proposals.starts_at))
    .limit(100);
  return rows.map(toProposalDetail);
}

/** Every proposal, newest first. */
export async function listProposalHistory(userId: string, limit = 50): Promise<ProposalDetailView[]> {
  const rows = await db
    .select()
    .from(schema.calendar_proposals)
    .where(eq(schema.calendar_proposals.user_id, userId))
    .orderBy(desc(schema.calendar_proposals.created_at))
    .limit(limit);
  return rows.map(toProposalDetail);
}

/** Saved plans for local days fromDay to toDay, both YYYY-MM-DD, both included. */
export async function listDailyPlansBetween(userId: string, fromDay: string, toDay: string): Promise<PlanView[]> {
  const rows = await db
    .select()
    .from(schema.daily_plans)
    .where(
      and(
        eq(schema.daily_plans.user_id, userId),
        gte(schema.daily_plans.day, fromDay),
        lte(schema.daily_plans.day, toDay),
      ),
    )
    .orderBy(asc(schema.daily_plans.day));
  return rows.map((r) => ({
    day: r.day,
    load: r.load,
    headline: r.headline,
    bed_time: r.bed_time,
    wake_time: r.wake_time,
    items: parseItems(r.items),
  }));
}

// ---------------------------------------------------------------- conversations page

/** One summary per channel: the message count and the newest message. */
export async function listThreadSummaries(userId: string): Promise<ThreadSummary[]> {
  const counts = await db
    .select({ channel: schema.messages.channel, n: count() })
    .from(schema.messages)
    .where(eq(schema.messages.user_id, userId))
    .groupBy(schema.messages.channel);
  const newest = await db
    .selectDistinctOn([schema.messages.channel], {
      channel: schema.messages.channel,
      text: schema.messages.text,
      direction: schema.messages.direction,
      created_at: schema.messages.created_at,
    })
    .from(schema.messages)
    .where(eq(schema.messages.user_id, userId))
    .orderBy(schema.messages.channel, desc(schema.messages.created_at));
  const last = new Map(newest.map((r) => [r.channel, r]));
  return counts.map((c) => {
    const r = last.get(c.channel);
    return {
      channel: c.channel,
      count: Number(c.n),
      last: r ? { text: r.text, direction: r.direction, created_at: r.created_at.toISOString() } : null,
    };
  });
}

export async function listChannelLinks(userId: string): Promise<LinkRow[]> {
  const rows = await db
    .select()
    .from(schema.channel_links)
    .where(eq(schema.channel_links.user_id, userId))
    .orderBy(desc(schema.channel_links.created_at))
    .limit(50);
  return rows.map((r) => ({
    channel: r.channel,
    external_id: r.external_id,
    status: r.status,
    linked_at: iso(r.linked_at),
    created_at: r.created_at.toISOString(),
  }));
}

/** The newest `limit` messages of one channel, newest first, with their tool calls. */
export async function listChannelMessages(userId: string, channel: string, limit = 100): Promise<ThreadMessage[]> {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.user_id, userId), eq(schema.messages.channel, channel)))
    .orderBy(desc(schema.messages.created_at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    direction: r.direction,
    text: r.text,
    created_at: r.created_at.toISOString(),
    tools: parseToolCalls(r.tool_calls),
  }));
}

/** Daily totals and averages for the dashboard number cards, from `fromDay` (YYYY-MM-DD) on. */
export async function getDailyMetricRows(userId: string, fromDay: string): Promise<DailyRow[]> {
  const rows = await db
    .select({
      day: schema.daily_summary.day,
      metric: schema.daily_summary.metric,
      avg: schema.daily_summary.avg,
      sum: schema.daily_summary.sum,
    })
    .from(schema.daily_summary)
    .where(
      and(
        eq(schema.daily_summary.user_id, userId),
        gte(schema.daily_summary.day, fromDay),
        inArray(schema.daily_summary.metric, METRIC_KEYS),
      ),
    );
  return rows;
}

/** The focus area keys the session user picked, in the order they were picked. */
export async function getFocusPicks(userId: string): Promise<string[]> {
  const rows = await db
    .select({ key: schema.focus_areas.key })
    .from(schema.focus_areas)
    .where(eq(schema.focus_areas.user_id, userId))
    .orderBy(asc(schema.focus_areas.picked_at));
  return rows.map((r) => r.key);
}

/**
 * True when there is a real source of body data: a connected Fitbit, or the Apple Watch simulator that sent data
 * in the last week. Without one, the dashboard hides its charts and numbers instead of showing empty ones.
 */
export async function hasDeviceData(userId: string): Promise<boolean> {
  const fitbit = await db
    .select({ n: count() })
    .from(schema.fitbit_connections)
    .where(eq(schema.fitbit_connections.user_id, userId));
  if ((fitbit[0]?.n ?? 0) > 0) return true;
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const sim = await db
    .select({ n: count() })
    .from(schema.ingest_log)
    .where(
      and(
        eq(schema.ingest_log.user_id, userId),
        eq(schema.ingest_log.source, "apple_watch_sim"),
        gt(schema.ingest_log.received_at, since),
      ),
    );
  return (sim[0]?.n ?? 0) > 0;
}
