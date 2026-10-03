CREATE TABLE "focus_areas" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"picked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "focus_areas_user_id_key_pk" PRIMARY KEY("user_id","key")
);
