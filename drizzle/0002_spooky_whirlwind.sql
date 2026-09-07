CREATE TABLE "availability_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"slot_start" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "availability_participant_slot_unique" ON "availability_blocks" USING btree ("participant_id","slot_start");--> statement-breakpoint
CREATE INDEX "availability_session_idx" ON "availability_blocks" USING btree ("session_id");