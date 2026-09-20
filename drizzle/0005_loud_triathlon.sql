ALTER TABLE "participants" ADD COLUMN "guest_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "guest_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "final_date" timestamp;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "final_start_minutes" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "final_end_minutes" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "final_activity_id" uuid;