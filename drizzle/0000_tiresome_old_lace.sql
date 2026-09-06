CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"admin_token" text NOT NULL,
	"date_range_start" timestamp NOT NULL,
	"date_range_end" timestamp NOT NULL,
	"daily_start_minutes" integer NOT NULL,
	"daily_end_minutes" integer NOT NULL,
	"max_participants" integer NOT NULL,
	"anonymous_mode" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
