import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { participants, sessions } from "@/db/schema";

/**
 * Accepts either the production `node-postgres` client or the `pglite` client
 * used in tests. The query-result type parameter is deliberately loose so both
 * drivers satisfy it; the schema half stays fully typed.
 */
export type Db = PgDatabase<any, typeof schema>;

export type Participant = typeof participants.$inferSelect;

export type CreateSessionInput = {
  title: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  dailyStartMinutes: number;
  dailyEndMinutes: number;
  maxParticipants: number;
  adminName: string;
  adminPin: string;
};

export type CreateSessionFailure =
  | "invalid_title"
  | "invalid_name"
  | "invalid_pin"
  | "invalid_date_range"
  | "invalid_time_window"
  | "invalid_capacity";

export type CreateSessionResult =
  | { ok: true; sessionId: string; adminToken: string; participantId: string }
  | { ok: false; reason: CreateSessionFailure };

export type JoinInput = { sessionId: string; name: string; pin: string };

export type JoinFailure =
  | "invalid_name"
  | "invalid_pin"
  | "no_such_session"
  | "session_full"
  | "wrong_pin";

export type JoinResult =
  | { ok: true; participant: Participant; created: boolean }
  | { ok: false; reason: JoinFailure };

/** Whether a free name would be accepted, already belongs to someone, or is shut out. */
export type NameStatus = "new" | "existing" | "full";

const PIN_PATTERN = /^\d{4}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/** Names are compared case-insensitively and trimmed, but stored as typed. */
export function normalizeName(raw: string): string {
  return raw.trim();
}

function newAdminToken(): string {
  // 24 random bytes -> 32 base64url chars. The admin link is the only thing
  // standing between a stranger and full control of a session, so it needs
  // real entropy, not a guessable id.
  return randomBytes(24).toString("base64url");
}

async function findByName(
  db: Db,
  sessionId: string,
  name: string,
): Promise<Participant | undefined> {
  const rows = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.sessionId, sessionId),
        sql`lower(${participants.name}) = lower(${name})`,
      ),
    )
    .limit(1);
  return rows[0];
}

async function countParticipants(db: Db, sessionId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(participants)
    .where(eq(participants.sessionId, sessionId));
  return rows[0]?.n ?? 0;
}

export async function createSession(
  db: Db,
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, reason: "invalid_title" };

  const adminName = normalizeName(input.adminName);
  if (!adminName) return { ok: false, reason: "invalid_name" };

  if (!isValidPin(input.adminPin)) return { ok: false, reason: "invalid_pin" };

  if (input.dateRangeEnd < input.dateRangeStart) {
    return { ok: false, reason: "invalid_date_range" };
  }
  if (input.dailyEndMinutes <= input.dailyStartMinutes) {
    return { ok: false, reason: "invalid_time_window" };
  }
  if (!Number.isInteger(input.maxParticipants) || input.maxParticipants < 1) {
    return { ok: false, reason: "invalid_capacity" };
  }

  const sessionId = randomUUID();
  const participantId = randomUUID();
  const adminToken = newAdminToken();

  // The admin is a participant too (SPEC.md), so the session is only coherent
  // once both rows exist — write them together.
  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: sessionId,
      title,
      adminToken,
      dateRangeStart: input.dateRangeStart,
      dateRangeEnd: input.dateRangeEnd,
      dailyStartMinutes: input.dailyStartMinutes,
      dailyEndMinutes: input.dailyEndMinutes,
      maxParticipants: input.maxParticipants,
    });
    await tx.insert(participants).values({
      id: participantId,
      sessionId,
      name: adminName,
      pin: input.adminPin,
      isAdmin: true,
    });
  });

  return { ok: true, sessionId, adminToken, participantId };
}

export async function joinSession(db: Db, input: JoinInput): Promise<JoinResult> {
  const name = normalizeName(input.name);
  if (!name) return { ok: false, reason: "invalid_name" };
  if (!isValidPin(input.pin)) return { ok: false, reason: "invalid_pin" };

  const session = (
    await db.select().from(sessions).where(eq(sessions.id, input.sessionId)).limit(1)
  )[0];
  if (!session) return { ok: false, reason: "no_such_session" };

  const existing = await findByName(db, input.sessionId, name);
  if (existing) {
    // A name already in the room is an identity, not a new seat: the PIN is
    // what proves it, and the room cap never applies (SPEC.md) — that is how
    // someone switching phones gets back in.
    if (existing.pin !== input.pin) return { ok: false, reason: "wrong_pin" };
    return { ok: true, participant: existing, created: false };
  }

  // Only brand-new names are subject to the cap.
  const taken = await countParticipants(db, input.sessionId);
  if (taken >= session.maxParticipants) {
    return { ok: false, reason: "session_full" };
  }

  const rows = await db
    .insert(participants)
    .values({ id: randomUUID(), sessionId: input.sessionId, name, pin: input.pin })
    .returning();

  return { ok: true, participant: rows[0], created: true };
}

export async function resolveName(
  db: Db,
  sessionId: string,
  rawName: string,
): Promise<NameStatus> {
  const name = normalizeName(rawName);

  const session = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];
  if (!session) throw new Error(`no such session: ${sessionId}`);

  if (await findByName(db, sessionId, name)) return "existing";

  const taken = await countParticipants(db, sessionId);
  return taken >= session.maxParticipants ? "full" : "new";
}
