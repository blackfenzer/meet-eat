import { lt } from "drizzle-orm";
import { sessions } from "@/db/schema";
import type { Db } from "./session-service";

/** SPEC.md: a plan and everything attached to it expires 90 days after its range ends. */
export const RETENTION_DAYS = 90;

/** Deletes expired sessions. Everything else cascades from the schema. */
export async function deleteExpiredSessions(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);

  const removed = await db
    .delete(sessions)
    .where(lt(sessions.dateRangeEnd, cutoff))
    .returning({ id: sessions.id });

  return removed.length;
}
