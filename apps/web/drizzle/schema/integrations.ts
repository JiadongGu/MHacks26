// Integration tables (PLAN section 5.2). Owner: P.
// The Python service writes the encrypted token columns with Fernet (SECRET_KEY).
// vitals_raw is not here. It lives in Tiger.
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const fitbit_connections = pgTable("fitbit_connections", {
  user_id: uuid("user_id").primaryKey(),
  fitbit_user_id: text("fitbit_user_id").notNull(),
  access_token_enc: text("access_token_enc").notNull(),
  refresh_token_enc: text("refresh_token_enc").notNull(),
  expires_at: tz("expires_at").notNull(),
  scopes: text("scopes"),
  subscription_id: text("subscription_id"),
  last_sync_at: tz("last_sync_at"),
});

export const calendar_connections = pgTable("calendar_connections", {
  user_id: uuid("user_id").primaryKey(),
  google_email: text("google_email"),
  refresh_token_enc: text("refresh_token_enc").notNull(),
  health_calendar_id: text("health_calendar_id"),
  sync_token: text("sync_token"),
  last_sync_at: tz("last_sync_at"),
});

export const calendar_events_cache = pgTable(
  "calendar_events_cache",
  {
    user_id: uuid("user_id").notNull(),
    event_id: text("event_id").notNull(),
    title: text("title").notNull(),
    starts_at: tz("starts_at").notNull(),
    ends_at: tz("ends_at").notNull(),
    is_important: boolean("is_important").notNull().default(false),
    fetched_at: tz("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.event_id] })],
);

export const ingest_log = pgTable(
  "ingest_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull(),
    source: text("source").notNull(),
    n: integer("n").notNull(),
    received_at: tz("received_at").notNull().defaultNow(),
  },
  (t) => [index("ingest_log_user_received_idx").on(t.user_id, t.received_at)],
);
