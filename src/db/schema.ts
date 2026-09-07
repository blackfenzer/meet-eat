import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  adminToken: text("admin_token").notNull(),
  dateRangeStart: timestamp("date_range_start", { mode: "date" }).notNull(),
  dateRangeEnd: timestamp("date_range_end", { mode: "date" }).notNull(),
  dailyStartMinutes: integer("daily_start_minutes").notNull(),
  dailyEndMinutes: integer("daily_end_minutes").notNull(),
  maxParticipants: integer("max_participants").notNull(),
  anonymousMode: boolean("anonymous_mode").notNull().default(false),
  status: text("status", { enum: ["open", "finalized"] })
    .notNull()
    .default("open"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Plaintext by design. SPEC.md gives the admin the power to view and reset
    // any participant's PIN, so it must be reversible. This is a 4-digit
    // throwaway code guarding a seat on a friend-group scheduling link, not a
    // password — the app has no accounts and stores nothing else sensitive.
    pin: text("pin").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    /** Consecutive wrong PINs. See src/lib/pin-throttle.ts. */
    pinAttempts: integer("pin_attempts").notNull().default(0),
    /** Set once the attempt ceiling is hit; null when not locked. */
    lockedUntil: timestamp("locked_until", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // Names identify a person within a session, and a returning participant
    // must match their existing seat regardless of how they capitalise it.
    uniqueIndex("participants_session_lower_name_unique").on(
      t.sessionId,
      sql`lower(${t.name})`,
    ),
  ],
);

export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: uuid("id").primaryKey(),
    // Denormalised from the participant so the grid for a whole session is one
    // indexed lookup rather than a join on every poll.
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    /** Wall-clock start of a half-hour block. See src/lib/slots.ts. */
    slotStart: timestamp("slot_start", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // Availability is binary, so a person marking the same block twice is one
    // row. This is what makes re-painting over a selection idempotent.
    uniqueIndex("availability_participant_slot_unique").on(t.participantId, t.slotStart),
    index("availability_session_idx").on(t.sessionId),
  ],
);
