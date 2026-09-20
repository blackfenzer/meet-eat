import { and, eq, sql } from "drizzle-orm";
import { activities, participants, sessions } from "@/db/schema";
import { isValidPin, type Db } from "./session-service";

/** Everything the organiser's secret link lets them do. */

export type AdminFailure =
  | "no_such_session"
  | "invalid_title"
  | "invalid_date_range"
  | "invalid_time_window"
  | "invalid_capacity"
  | "cap_below_current"
  | "invalid_pin"
  | "not_a_participant"
  | "cannot_remove_admin"
  | "unknown_activity";

export type AdminResult = { ok: true } | { ok: false; reason: AdminFailure };

/** Whether this token really is the one issued for this session. */
export async function verifyAdmin(
  db: Db,
  sessionId: string,
  adminToken: string,
): Promise<boolean> {
  if (!adminToken) return false;

  const row = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];
  return !!row && row.adminToken === adminToken;
}

async function headcount(db: Db, sessionId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(participants)
    .where(eq(participants.sessionId, sessionId));
  return rows[0]?.n ?? 0;
}

export type SessionSettingsPatch = {
  title?: string;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  dailyStartMinutes?: number;
  dailyEndMinutes?: number;
  maxParticipants?: number;
  anonymousMode?: boolean;
};

export async function updateSessionSettings(
  db: Db,
  sessionId: string,
  patch: SessionSettingsPatch,
): Promise<AdminResult> {
  const current = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];
  if (!current) return { ok: false, reason: "no_such_session" };

  const next = {
    title: patch.title !== undefined ? patch.title.trim() : current.title,
    dateRangeStart: patch.dateRangeStart ?? current.dateRangeStart,
    dateRangeEnd: patch.dateRangeEnd ?? current.dateRangeEnd,
    dailyStartMinutes: patch.dailyStartMinutes ?? current.dailyStartMinutes,
    dailyEndMinutes: patch.dailyEndMinutes ?? current.dailyEndMinutes,
    maxParticipants: patch.maxParticipants ?? current.maxParticipants,
    anonymousMode: patch.anonymousMode ?? current.anonymousMode,
  };

  if (!next.title) return { ok: false, reason: "invalid_title" };
  if (next.dateRangeEnd < next.dateRangeStart) {
    return { ok: false, reason: "invalid_date_range" };
  }
  if (next.dailyEndMinutes <= next.dailyStartMinutes) {
    return { ok: false, reason: "invalid_time_window" };
  }
  if (!Number.isInteger(next.maxParticipants) || next.maxParticipants < 1) {
    return { ok: false, reason: "invalid_capacity" };
  }

  // Lowering the cap below the people already here would not evict anyone, it
  // would just leave the room permanently over capacity — reject it instead.
  if (next.maxParticipants < (await headcount(db, sessionId))) {
    return { ok: false, reason: "cap_below_current" };
  }

  await db.update(sessions).set(next).where(eq(sessions.id, sessionId));
  return { ok: true };
}

async function memberOf(db: Db, sessionId: string, participantId: string) {
  return (
    await db
      .select()
      .from(participants)
      .where(and(eq(participants.id, participantId), eq(participants.sessionId, sessionId)))
      .limit(1)
  )[0];
}

export async function removeParticipant(
  db: Db,
  sessionId: string,
  participantId: string,
): Promise<AdminResult> {
  const person = await memberOf(db, sessionId, participantId);
  if (!person) return { ok: false, reason: "not_a_participant" };

  // Removing the organiser would leave a session nobody can moderate.
  if (person.isAdmin) return { ok: false, reason: "cannot_remove_admin" };

  await db.delete(participants).where(eq(participants.id, participantId));
  return { ok: true };
}

export async function resetPin(
  db: Db,
  sessionId: string,
  participantId: string,
  newPin: string,
): Promise<AdminResult> {
  if (!isValidPin(newPin)) return { ok: false, reason: "invalid_pin" };

  const person = await memberOf(db, sessionId, participantId);
  if (!person) return { ok: false, reason: "not_a_participant" };

  // Clearing the throttle matters: resetting a PIN for someone locked out is
  // precisely when the organiser is asked to help.
  await db
    .update(participants)
    .set({ pin: newPin, pinAttempts: 0, lockedUntil: null })
    .where(eq(participants.id, participantId));

  return { ok: true };
}

export async function removeActivity(
  db: Db,
  sessionId: string,
  activityId: string,
): Promise<AdminResult> {
  const row = (
    await db
      .select()
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.sessionId, sessionId)))
      .limit(1)
  )[0];
  if (!row) return { ok: false, reason: "unknown_activity" };

  await db.delete(activities).where(eq(activities.id, activityId));
  return { ok: true };
}

export type FinalPlan = {
  date: Date;
  startMinutes: number;
  endMinutes: number;
  activityId: string | null;
};

export async function finalizeSession(
  db: Db,
  sessionId: string,
  plan: FinalPlan,
): Promise<AdminResult> {
  const current = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];
  if (!current) return { ok: false, reason: "no_such_session" };

  if (plan.endMinutes <= plan.startMinutes) {
    return { ok: false, reason: "invalid_time_window" };
  }

  if (plan.activityId) {
    const row = (
      await db
        .select()
        .from(activities)
        .where(
          and(eq(activities.id, plan.activityId), eq(activities.sessionId, sessionId)),
        )
        .limit(1)
    )[0];
    if (!row) return { ok: false, reason: "unknown_activity" };
  }

  // SPEC.md lets the organiser pick anything, including a slot outside the
  // original window — plans change, and they are the one deciding.
  await db
    .update(sessions)
    .set({
      status: "finalized",
      finalDate: plan.date,
      finalStartMinutes: plan.startMinutes,
      finalEndMinutes: plan.endMinutes,
      finalActivityId: plan.activityId,
    })
    .where(eq(sessions.id, sessionId));

  return { ok: true };
}

export async function reopenSession(db: Db, sessionId: string): Promise<AdminResult> {
  const current = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];
  if (!current) return { ok: false, reason: "no_such_session" };

  await db
    .update(sessions)
    .set({
      status: "open",
      finalDate: null,
      finalStartMinutes: null,
      finalEndMinutes: null,
      finalActivityId: null,
    })
    .where(eq(sessions.id, sessionId));

  return { ok: true };
}
