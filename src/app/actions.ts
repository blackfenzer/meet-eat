"use server";

import { db } from "@/db/client";
import {
  createSession,
  joinSession,
  resolveName,
  type CreateSessionFailure,
  type JoinFailure,
  type NameStatus,
} from "@/lib/session-service";
import { timeToMinutes } from "@/lib/time";
import {
  countsBySlot,
  listAvailability,
  setAvailability,
  slotsForParticipant,
  type SetAvailabilityFailure,
} from "@/lib/availability-service";
import { participants } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type CreateSessionForm = {
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  maxParticipants: string;
  adminName: string;
  adminPin: string;
};

export type CreateSessionActionResult =
  | { ok: true; sessionId: string; adminToken: string; participantId: string; name: string }
  | { ok: false; reason: CreateSessionFailure };

export async function createSessionAction(
  form: CreateSessionForm,
): Promise<CreateSessionActionResult> {
  const startMinutes = timeToMinutes(form.startTime);
  const endMinutes = timeToMinutes(form.endTime);
  if (startMinutes === null || endMinutes === null) {
    return { ok: false, reason: "invalid_time_window" };
  }

  const start = new Date(form.startDate);
  const end = new Date(form.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, reason: "invalid_date_range" };
  }

  const cap = Number(form.maxParticipants);
  if (!Number.isInteger(cap)) return { ok: false, reason: "invalid_capacity" };

  const result = await createSession(db, {
    title: form.title,
    dateRangeStart: start,
    dateRangeEnd: end,
    dailyStartMinutes: startMinutes,
    dailyEndMinutes: endMinutes,
    maxParticipants: cap,
    adminName: form.adminName,
    adminPin: form.adminPin,
  });

  if (!result.ok) return result;

  return {
    ok: true,
    sessionId: result.sessionId,
    adminToken: result.adminToken,
    participantId: result.participantId,
    name: form.adminName.trim(),
  };
}

/** Drives which prompt the join form shows next. Null means the link is dead. */
export async function resolveNameAction(
  sessionId: string,
  name: string,
): Promise<NameStatus | null> {
  try {
    return await resolveName(db, sessionId, name);
  } catch {
    return null;
  }
}

export type JoinActionResult =
  | { ok: true; participantId: string; name: string; isAdmin: boolean; created: boolean }
  | { ok: false; reason: JoinFailure };

export async function joinSessionAction(
  sessionId: string,
  name: string,
  pin: string,
): Promise<JoinActionResult> {
  const result = await joinSession(db, { sessionId, name, pin });
  if (!result.ok) return result;

  // Return only the fields the browser needs — never the PIN back out.
  return {
    ok: true,
    participantId: result.participant.id,
    name: result.participant.name,
    isAdmin: result.participant.isAdmin,
    created: result.created,
  };
}

export type GridSnapshot = {
  /** [slot ISO, how many people are free then] */
  counts: Array<[string, number]>;
  /** The caller's own marked slots, as ISO strings. */
  mine: string[];
  /** Denominator for the heatmap. */
  participantCount: number;
};

export async function readAvailabilityAction(
  sessionId: string,
  participantId: string,
): Promise<GridSnapshot> {
  const [rows, headcount] = await Promise.all([
    listAvailability(db, sessionId),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(participants)
      .where(eq(participants.sessionId, sessionId)),
  ]);

  return {
    counts: [...countsBySlot(rows)],
    mine: [...slotsForParticipant(rows, participantId)],
    participantCount: headcount[0]?.n ?? 0,
  };
}

export type SetAvailabilityActionResult =
  | { ok: true }
  | { ok: false; reason: SetAvailabilityFailure };

export async function setAvailabilityAction(
  sessionId: string,
  participantId: string,
  addIso: string[],
  removeIso: string[],
): Promise<SetAvailabilityActionResult> {
  const toDates = (xs: string[]) => xs.map((x) => new Date(x));
  return setAvailability(db, {
    sessionId,
    participantId,
    add: toDates(addIso),
    remove: toDates(removeIso),
  });
}
