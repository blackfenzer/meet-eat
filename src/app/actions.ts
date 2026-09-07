"use server";

import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { participants } from "@/db/schema";
import {
  createSession,
  joinSession,
  resolveName,
  type CreateSessionFailure,
  type JoinFailure,
  type NameStatus,
} from "@/lib/session-service";
import {
  countsBySlot,
  listAvailability,
  setAvailability,
  slotsForParticipant,
  type SetAvailabilityFailure,
} from "@/lib/availability-service";
import {
  participantCookieName,
  signParticipantToken,
  verifyParticipantToken,
} from "@/lib/participant-token";
import { timeToMinutes } from "@/lib/time";

/**
 * Identity is never read from a request parameter.
 *
 * A participant id is the only credential this account-less app has, so
 * accepting one from the browser would let anybody read or overwrite any
 * participant's availability just by naming their id. The server issues the id
 * once, signed, into an httpOnly cookie, and every later call reads it back
 * from there.
 */
function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "APP_SECRET must be set to at least 32 characters to sign participant cookies",
    );
  }
  return secret;
}

async function grantIdentity(sessionId: string, participantId: string): Promise<void> {
  const jar = await cookies();
  jar.set(
    participantCookieName(sessionId),
    signParticipantToken({ sessionId, participantId }, appSecret()),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Comfortably outlives the 90-day data lifecycle in SPEC.md.
      maxAge: 60 * 60 * 24 * 120,
    },
  );
}

/** The caller's proven participant id for this session, or null. */
async function currentParticipantId(sessionId: string): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(participantCookieName(sessionId))?.value;
  if (!raw) return null;

  const identity = verifyParticipantToken(raw, appSecret());
  // A cookie minted for another session must not carry over to this one.
  if (!identity || identity.sessionId !== sessionId) return null;

  return identity.participantId;
}

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

  await grantIdentity(result.sessionId, result.participantId);

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

  await grantIdentity(sessionId, result.participant.id);

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

/** Null means this browser has not proven it is a participant of this session. */
export async function readAvailabilityAction(
  sessionId: string,
): Promise<GridSnapshot | null> {
  const participantId = await currentParticipantId(sessionId);
  if (!participantId) return null;

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
  addIso: string[],
  removeIso: string[],
): Promise<SetAvailabilityActionResult> {
  const participantId = await currentParticipantId(sessionId);
  if (!participantId) return { ok: false, reason: "not_a_participant" };

  const toDates = (xs: string[]) => xs.map((x) => new Date(x));
  return setAvailability(db, {
    sessionId,
    participantId,
    add: toDates(addIso),
    remove: toDates(removeIso),
  });
}
