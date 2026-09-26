"use server";

import { cookies } from "next/headers";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { participants, sessions } from "@/db/schema";
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
import {
  addActivity,
  groupRanking,
  listActivities,
  rankingForParticipant,
  setRanking,
  type AddActivityFailure,
  type SetRankingFailure,
} from "@/lib/activity-service";
import { resolveActivityImage } from "@/lib/activity-image";
import { fetchPage, fetchStock } from "@/lib/image-fetchers";
import {
  finalizeSession,
  removeActivity,
  removeParticipant,
  reopenSession,
  resetPin,
  updateSessionSettings,
  verifyAdmin,
  type AdminFailure,
} from "@/lib/admin-service";
import { displayNameFor } from "@/lib/display-name";
import { parseCoordinates } from "@/lib/map-links";
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

export type PoolEntry = {
  id: string;
  name: string;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  imageSource: string | null;
};

export type GroupEntry = {
  activityId: string;
  name: string;
  score: number;
  firstChoices: number;
  voters: number;
};

export type ActivitiesSnapshot = {
  pool: PoolEntry[];
  /** The caller's own ranking, best first. */
  mine: string[];
  group: GroupEntry[];
};

/** Null means this browser has not proven it is a participant of this session. */
export async function readActivitiesAction(
  sessionId: string,
): Promise<ActivitiesSnapshot | null> {
  const participantId = await currentParticipantId(sessionId);
  if (!participantId) return null;

  const [pool, mine, group] = await Promise.all([
    listActivities(db, sessionId),
    rankingForParticipant(db, participantId),
    groupRanking(db, sessionId),
  ]);

  return {
    pool: pool.map((a) => ({
      id: a.id,
      name: a.name,
      locationName: a.locationName,
      latitude: a.latitude,
      longitude: a.longitude,
      imageUrl: a.imageUrl,
      imageSource: a.imageSource,
    })),
    mine,
    group: group.map((g) => ({
      activityId: g.activityId,
      name: g.activity.name,
      score: g.score,
      firstChoices: g.firstChoices,
      voters: g.voters,
    })),
  };
}

export type AddActivityForm = {
  name: string;
  locationName: string;
  /** Typed "lat, lng" or a pasted Google Maps link. May be blank. */
  locationInput: string;
  /** A direct image URL, or a page to take an og:image from. May be blank. */
  imageInput: string;
};

export type AddActivityActionResult =
  | { ok: true; activityId: string }
  | { ok: false; reason: AddActivityFailure | "not_signed_in" };

export async function addActivityAction(
  sessionId: string,
  form: AddActivityForm,
): Promise<AddActivityActionResult> {
  const participantId = await currentParticipantId(sessionId);
  if (!participantId) return { ok: false, reason: "not_signed_in" };

  // Resolved on the server: the browser must never be the one fetching a
  // stranger's page, and the Pexels key never leaves the server.
  const image = await resolveActivityImage(
    { imageInput: form.imageInput, tag: form.name },
    { fetchPage, fetchStock },
  );

  const coordinates = parseCoordinates(form.locationInput ?? "");

  const result = await addActivity(db, {
    sessionId,
    participantId,
    name: form.name,
    locationName: form.locationName.trim() || null,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    imageUrl: image.url,
    imageSource: image.source === "none" ? null : image.source,
  });

  if (!result.ok) return result;
  return { ok: true, activityId: result.activity.id };
}

export type SetRankingActionResult =
  | { ok: true }
  | { ok: false; reason: SetRankingFailure | "not_signed_in" };

export async function setRankingAction(
  sessionId: string,
  activityIds: string[],
): Promise<SetRankingActionResult> {
  const participantId = await currentParticipantId(sessionId);
  if (!participantId) return { ok: false, reason: "not_signed_in" };

  return setRanking(db, { sessionId, participantId, activityIds });
}

export type RosterEntry = {
  id: string;
  displayName: string;
  isAdmin: boolean;
  isYou: boolean;
};

/** Who is in the session, named according to anonymous mode. */
export async function readRosterAction(sessionId: string): Promise<RosterEntry[] | null> {
  const viewerId = await currentParticipantId(sessionId);
  if (!viewerId) return null;

  const session = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];
  if (!session) return null;

  const people = await db
    .select()
    .from(participants)
    .where(eq(participants.sessionId, sessionId))
    .orderBy(asc(participants.guestNumber));

  // A participant viewing the roster is never treated as the organiser here:
  // admin sight of real names comes from the organiser page, which proves the
  // token, not from holding a participant cookie.
  return people.map((p) => ({
    id: p.id,
    displayName: displayNameFor(p, {
      anonymous: session.anonymousMode,
      viewerId,
      viewerIsAdmin: false,
    }),
    isAdmin: p.isAdmin,
    isYou: p.id === viewerId,
  }));
}

/* ---------------------------------------------------------------- organiser */

export type AdminActionResult = { ok: true } | { ok: false; reason: AdminFailure | "forbidden" };

async function asAdmin(
  sessionId: string,
  adminToken: string,
  run: () => Promise<AdminActionResult>,
): Promise<AdminActionResult> {
  // The organiser link is the credential, so it is proved on every call rather
  // than trusted because the page rendered once.
  if (!(await verifyAdmin(db, sessionId, adminToken))) {
    return { ok: false, reason: "forbidden" };
  }
  return run();
}

export type AdminSettingsForm = {
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  maxParticipants: string;
  anonymousMode: boolean;
};

export async function adminUpdateSettingsAction(
  sessionId: string,
  adminToken: string,
  form: AdminSettingsForm,
): Promise<AdminActionResult> {
  return asAdmin(sessionId, adminToken, async () => {
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

    return updateSessionSettings(db, sessionId, {
      title: form.title,
      dateRangeStart: start,
      dateRangeEnd: end,
      dailyStartMinutes: startMinutes,
      dailyEndMinutes: endMinutes,
      maxParticipants: cap,
      anonymousMode: form.anonymousMode,
    });
  });
}

export async function adminRemoveParticipantAction(
  sessionId: string,
  adminToken: string,
  participantId: string,
): Promise<AdminActionResult> {
  return asAdmin(sessionId, adminToken, () =>
    removeParticipant(db, sessionId, participantId),
  );
}

export async function adminResetPinAction(
  sessionId: string,
  adminToken: string,
  participantId: string,
  newPin: string,
): Promise<AdminActionResult> {
  return asAdmin(sessionId, adminToken, () =>
    resetPin(db, sessionId, participantId, newPin),
  );
}

export async function adminRemoveActivityAction(
  sessionId: string,
  adminToken: string,
  activityId: string,
): Promise<AdminActionResult> {
  return asAdmin(sessionId, adminToken, () => removeActivity(db, sessionId, activityId));
}

export async function adminFinalizeAction(
  sessionId: string,
  adminToken: string,
  form: { date: string; startTime: string; endTime: string; activityId: string | null },
): Promise<AdminActionResult> {
  return asAdmin(sessionId, adminToken, async () => {
    const startMinutes = timeToMinutes(form.startTime);
    const endMinutes = timeToMinutes(form.endTime);
    if (startMinutes === null || endMinutes === null) {
      return { ok: false, reason: "invalid_time_window" };
    }
    const date = new Date(form.date);
    if (Number.isNaN(date.getTime())) return { ok: false, reason: "invalid_date_range" };

    return finalizeSession(db, sessionId, {
      date,
      startMinutes,
      endMinutes,
      activityId: form.activityId,
    });
  });
}

export async function adminReopenAction(
  sessionId: string,
  adminToken: string,
): Promise<AdminActionResult> {
  return asAdmin(sessionId, adminToken, () => reopenSession(db, sessionId));
}
