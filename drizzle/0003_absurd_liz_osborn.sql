ALTER TABLE "participants" ADD COLUMN "pin_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "locked_until" timestamp;