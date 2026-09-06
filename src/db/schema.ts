import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
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
