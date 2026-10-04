CREATE TABLE "finchnode_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"subject" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finchnode_events" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
