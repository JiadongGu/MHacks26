CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"proposal_id" uuid,
	"channels" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"ack_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"text" text NOT NULL,
	"audio_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "briefings_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "calendar_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"google_event_id" text,
	"alert_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"external_id" text,
	"link_code" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "daily_summary" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"avg" double precision,
	"min" double precision,
	"max" double precision,
	"sum" double precision,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_summary_user_id_day_metric_pk" PRIMARY KEY("user_id","day","metric")
);
--> statement-breakpoint
CREATE TABLE "digital_twin" (
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"model" jsonb NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digital_twin_user_id_version_pk" PRIMARY KEY("user_id","version")
);
--> statement-breakpoint
CREATE TABLE "ehr_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text DEFAULT 'finchnode' NOT NULL,
	"scenario_id" text,
	"category" text NOT NULL,
	"payload" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_progress" (
	"goal_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"current" double precision NOT NULL,
	"pct" double precision NOT NULL,
	"on_track" boolean NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_progress_goal_id_period_start_pk" PRIMARY KEY("goal_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"target" double precision NOT NULL,
	"period" text NOT NULL,
	"direction" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"text" text NOT NULL,
	"tool_calls" jsonb,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"dob" date,
	"sex" text,
	"height_cm" double precision,
	"weight_kg" double precision,
	"timezone" text,
	"phone_e164" text,
	"wake_time" time,
	"bed_time" time,
	"quiet_hours" jsonb,
	"onboarding_step" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"google_email" text,
	"refresh_token_enc" text NOT NULL,
	"health_calendar_id" text,
	"sync_token" text,
	"last_sync_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calendar_events_cache" (
	"user_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_important" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_cache_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "fitbit_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"fitbit_user_id" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scopes" text,
	"subscription_id" text,
	"last_sync_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ingest_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"n" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_user_created_idx" ON "alerts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "calendar_proposals_user_status_idx" ON "calendar_proposals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "channel_links_user_idx" ON "channel_links" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_links_link_code_uq" ON "channel_links" USING btree ("link_code") WHERE "channel_links"."link_code" is not null;--> statement-breakpoint
CREATE INDEX "ehr_records_user_idx" ON "ehr_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "job_runs_name_started_idx" ON "job_runs" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE INDEX "messages_user_created_idx" ON "messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ingest_log_user_received_idx" ON "ingest_log" USING btree ("user_id","received_at");