// Core tables (PLAN section 5.2). Owner: J.
// user_id is a uuid that matches neon_auth."user".id. There is no foreign key to the neon_auth schema.
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const profiles = pgTable("profiles", {
  user_id: uuid("user_id").primaryKey(),
  display_name: text("display_name"),
  dob: date("dob"),
  sex: text("sex"),
  height_cm: doublePrecision("height_cm"),
  weight_kg: doublePrecision("weight_kg"),
  timezone: text("timezone"),
  phone_e164: text("phone_e164"),
  wake_time: time("wake_time"),
  bed_time: time("bed_time"),
  quiet_hours: jsonb("quiet_hours"),
  onboarding_step: integer("onboarding_step").notNull().default(0),
  created_at: tz("created_at").notNull().defaultNow(),
});

export const ehr_records = pgTable(
  "ehr_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    source: text("source").notNull().default("finchnode"),
    scenario_id: text("scenario_id"),
    category: text("category").notNull(),
    payload: jsonb("payload").notNull(),
    imported_at: tz("imported_at").notNull().defaultNow(),
  },
  (t) => [index("ehr_records_user_idx").on(t.user_id)],
);

export const digital_twin = pgTable(
  "digital_twin",
  {
    user_id: uuid("user_id").notNull(),
    version: integer("version").notNull(),
    model: jsonb("model").notNull(),
    summary: text("summary"),
    created_at: tz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.version] })],
);

// What the person chose to focus on (at most 3). Keys come from the catalog in services/agent/app/focus/catalog.py.
export const focus_areas = pgTable(
  "focus_areas",
  {
    user_id: uuid("user_id").notNull(),
    key: text("key").notNull(),
    picked_at: tz("picked_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.key] })],
);

// One plan per person per local day: the load of the day, the timed items, and the bedtime. Written by services/agent/app/planner.
export const daily_plans = pgTable(
  "daily_plans",
  {
    user_id: uuid("user_id").notNull(),
    day: date("day").notNull(),
    load: text("load", { enum: ["light", "normal", "packed"] }).notNull(),
    headline: text("headline").notNull(),
    bed_time: text("bed_time"),
    wake_time: text("wake_time"),
    items: jsonb("items")
      .notNull()
      .default(sql`'[]'::jsonb`),
    created_at: tz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.day] })],
);

// A person's live FinchNode link: the Connect session, then the subject once they approve sharing.
// `imported_at` is set when their records were read into the twin. Written by services/agent/app/twin.
export const finchnode_connections = pgTable("finchnode_connections", {
  user_id: uuid("user_id").primaryKey(),
  session_id: text("session_id").notNull(),
  subject: text("subject"),
  status: text("status", { enum: ["pending", "connected", "revoked", "expired"] })
    .notNull()
    .default("pending"),
  imported_at: tz("imported_at"),
  created_at: tz("created_at").notNull().defaultNow(),
});

// Webhook event ids already handled, so a retried delivery is acknowledged and ignored.
export const finchnode_events = pgTable("finchnode_events", {
  id: text("id").primaryKey(),
  received_at: tz("received_at").notNull().defaultNow(),
});

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    metric: text("metric").notNull(),
    target: doublePrecision("target").notNull(),
    period: text("period", { enum: ["day", "week"] }).notNull(),
    direction: text("direction", { enum: ["at_least", "at_most"] }).notNull(),
    active: boolean("active").notNull().default(true),
    created_at: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("goals_user_idx").on(t.user_id)],
);

export const goal_progress = pgTable(
  "goal_progress",
  {
    goal_id: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    period_start: date("period_start").notNull(),
    current: doublePrecision("current").notNull(),
    pct: doublePrecision("pct").notNull(),
    on_track: boolean("on_track").notNull(),
    computed_at: tz("computed_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.goal_id, t.period_start] })],
);

// Written by the ingest service (P).
export const daily_summary = pgTable(
  "daily_summary",
  {
    user_id: uuid("user_id").notNull(),
    day: date("day").notNull(),
    metric: text("metric").notNull(),
    avg: doublePrecision("avg"),
    min: doublePrecision("min"),
    max: doublePrecision("max"),
    sum: doublePrecision("sum"),
    n: integer("n").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.day, t.metric] })],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    kind: text("kind").notNull(),
    severity: text("severity", {
      enum: ["info", "nudge", "warning", "urgent"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload"),
    proposal_id: uuid("proposal_id"),
    channels: jsonb("channels"),
    created_at: tz("created_at").notNull().defaultNow(),
    read_at: tz("read_at"),
    ack_at: tz("ack_at"),
  },
  (t) => [index("alerts_user_created_idx").on(t.user_id, t.created_at)],
);

export const calendar_proposals = pgTable(
  "calendar_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    title: text("title").notNull(),
    starts_at: tz("starts_at").notNull(),
    ends_at: tz("ends_at").notNull(),
    rationale: text("rationale").notNull(),
    status: text("status", {
      enum: ["pending", "approved", "rejected", "applied", "failed", "expired"],
    })
      .notNull()
      .default("pending"),
    google_event_id: text("google_event_id"),
    alert_id: uuid("alert_id"),
    created_at: tz("created_at").notNull().defaultNow(),
    decided_at: tz("decided_at"),
    applied_at: tz("applied_at"),
  },
  (t) => [index("calendar_proposals_user_status_idx").on(t.user_id, t.status)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    channel: text("channel").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    text: text("text").notNull(),
    tool_calls: jsonb("tool_calls"),
    external_id: text("external_id"),
    created_at: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_user_created_idx").on(t.user_id, t.created_at)],
);

export const channel_links = pgTable(
  "channel_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    channel: text("channel", { enum: ["imessage", "asi_one", "relay"] }).notNull(),
    external_id: text("external_id"),
    link_code: text("link_code"),
    status: text("status", { enum: ["pending", "linked"] })
      .notNull()
      .default("pending"),
    created_at: tz("created_at").notNull().defaultNow(),
    linked_at: tz("linked_at"),
  },
  (t) => [
    index("channel_links_user_idx").on(t.user_id),
    uniqueIndex("channel_links_link_code_uq")
      .on(t.link_code)
      .where(sql`${t.link_code} is not null`),
  ],
);

export const job_runs = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job_name: text("job_name").notNull(),
    user_id: uuid("user_id"),
    started_at: tz("started_at").notNull().defaultNow(),
    finished_at: tz("finished_at"),
    status: text("status").notNull().default("running"),
    detail: text("detail"),
  },
  (t) => [index("job_runs_name_started_idx").on(t.job_name, t.started_at)],
);

export const briefings = pgTable(
  "briefings",
  {
    user_id: uuid("user_id").notNull(),
    day: date("day").notNull(),
    text: text("text").notNull(),
    audio_url: text("audio_url"),
    created_at: tz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.day] })],
);
