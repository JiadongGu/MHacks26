// Server-only reads from Neon through Drizzle. Every function takes the session user id.
// Dates leave this file as ISO strings so client components can take them as props.
import { and, asc, desc, eq, gte, inArray, isNull, lte, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { LINK_CODE_TTL_MS, type LinkChannel } from "@/lib/link-code";

export type AlertView = {
  id: string;
  kind: string;
  severity: "info" | "nudge" | "warning" | "urgent";
  title: string;
  body: string;
  proposal_id: string | null;
  created_at: string;
  read_at: string | null;
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
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    severity: r.severity,
    title: r.title,
    body: r.body,
    proposal_id: r.proposal_id,
    created_at: r.created_at.toISOString(),
    read_at: iso(r.read_at),
  }));
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
  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind,
    severity: r.severity,
    title: r.title,
    body: r.body,
    proposal_id: r.proposal_id,
    created_at: r.created_at.toISOString(),
    read_at: iso(r.read_at),
  };
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
