import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { activities, participants, rankings, sessions } from "@/db/schema";
import { bordaRanking, type Ballot, type BordaResult } from "./borda";
import type { Db } from "./session-service";

export type Activity = typeof activities.$inferSelect;

export type AddActivityInput = {
  sessionId: string;
  participantId: string;
  name: string;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  imageUrl?: string | null;
  imageSource?: string | null;
};

export type AddActivityFailure =
  | "invalid_name"
  | "duplicate_name"
  | "no_such_session"
  | "not_a_participant"
  | "session_finalized";

export type AddActivityResult =
  | { ok: true; activity: Activity }
  | { ok: false; reason: AddActivityFailure };

/** Shared by every mutation here: the session must exist, be open, and know you. */
async function requireOpenMembership(
  db: Db,
  sessionId: string,
  participantId: string,
): Promise<"no_such_session" | "session_finalized" | "not_a_participant" | null> {
  const session = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];
  if (!session) return "no_such_session";
  if (session.status === "finalized") return "session_finalized";

  const person = (
    await db
      .select()
      .from(participants)
      .where(and(eq(participants.id, participantId), eq(participants.sessionId, sessionId)))
      .limit(1)
  )[0];
  if (!person) return "not_a_participant";

  return null;
}

export async function addActivity(
  db: Db,
  input: AddActivityInput,
): Promise<AddActivityResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "invalid_name" };

  const problem = await requireOpenMembership(db, input.sessionId, input.participantId);
  if (problem) return { ok: false, reason: problem };

  try {
    const rows = await db
      .insert(activities)
      .values({
        id: randomUUID(),
        sessionId: input.sessionId,
        createdBy: input.participantId,
        name,
        locationName: input.locationName ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        imageUrl: input.imageUrl ?? null,
        imageSource: input.imageSource ?? null,
      })
      .returning();

    return { ok: true, activity: rows[0] };
  } catch {
    // The only constraint that can fail here is the case-insensitive name index.
    return { ok: false, reason: "duplicate_name" };
  }
}

export async function listActivities(db: Db, sessionId: string): Promise<Activity[]> {
  return db
    .select()
    .from(activities)
    .where(eq(activities.sessionId, sessionId))
    .orderBy(asc(activities.createdAt), asc(activities.id));
}

export type SetRankingInput = {
  sessionId: string;
  participantId: string;
  /** Best first. An empty list clears the participant's ranking. */
  activityIds: string[];
};

export type SetRankingFailure =
  | "no_such_session"
  | "not_a_participant"
  | "session_finalized"
  | "unknown_activity"
  | "duplicate_activity";

export type SetRankingResult = { ok: true } | { ok: false; reason: SetRankingFailure };

export async function setRanking(
  db: Db,
  input: SetRankingInput,
): Promise<SetRankingResult> {
  const problem = await requireOpenMembership(db, input.sessionId, input.participantId);
  if (problem) return { ok: false, reason: problem };

  if (new Set(input.activityIds).size !== input.activityIds.length) {
    return { ok: false, reason: "duplicate_activity" };
  }

  // The browser sends the ids, so confirm every one really belongs to this
  // session before writing any of them.
  if (input.activityIds.length > 0) {
    const found = await db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.sessionId, input.sessionId),
          inArray(activities.id, input.activityIds),
        ),
      );
    if (found.length !== input.activityIds.length) {
      return { ok: false, reason: "unknown_activity" };
    }
  }

  // A ranking is an ordered whole, so it is replaced rather than patched.
  await db.transaction(async (tx) => {
    await tx.delete(rankings).where(eq(rankings.participantId, input.participantId));

    if (input.activityIds.length > 0) {
      await tx.insert(rankings).values(
        input.activityIds.map((activityId, position) => ({
          id: randomUUID(),
          sessionId: input.sessionId,
          participantId: input.participantId,
          activityId,
          position,
        })),
      );
    }
  });

  return { ok: true };
}

/** One participant's ordered activity ids, best first. */
export async function rankingForParticipant(
  db: Db,
  participantId: string,
): Promise<string[]> {
  const rows = await db
    .select({ activityId: rankings.activityId })
    .from(rankings)
    .where(eq(rankings.participantId, participantId))
    .orderBy(asc(rankings.position));
  return rows.map((r) => r.activityId);
}

/** Every participant's ballot for a session, for the group aggregate. */
export async function listBallots(db: Db, sessionId: string): Promise<Ballot[]> {
  const rows = await db
    .select({
      participantId: rankings.participantId,
      activityId: rankings.activityId,
      position: rankings.position,
    })
    .from(rankings)
    .where(eq(rankings.sessionId, sessionId))
    .orderBy(asc(rankings.participantId), asc(rankings.position));

  const byParticipant = new Map<string, string[]>();
  for (const row of rows) {
    const list = byParticipant.get(row.participantId);
    if (list) list.push(row.activityId);
    else byParticipant.set(row.participantId, [row.activityId]);
  }

  return [...byParticipant].map(([participantId, activityIds]) => ({
    participantId,
    activityIds,
  }));
}

export type GroupRankingEntry = BordaResult & { activity: Activity };

/** The pool ordered by everyone's combined preference. */
export async function groupRanking(
  db: Db,
  sessionId: string,
): Promise<GroupRankingEntry[]> {
  const [pool, ballots] = await Promise.all([
    listActivities(db, sessionId),
    listBallots(db, sessionId),
  ]);

  const byId = new Map(pool.map((a) => [a.id, a]));

  return bordaRanking(
    ballots,
    pool.map((a) => a.id),
  ).map((result) => ({ ...result, activity: byId.get(result.activityId)! }));
}
