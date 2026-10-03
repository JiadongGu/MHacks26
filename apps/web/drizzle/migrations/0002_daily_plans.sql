CREATE TABLE "daily_plans" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"load" text NOT NULL,
	"headline" text NOT NULL,
	"bed_time" text,
	"wake_time" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plans_user_id_day_pk" PRIMARY KEY("user_id","day")
);
