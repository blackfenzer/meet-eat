import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { availabilityBlocks, participants, sessions } from "@/db/schema";
import { isSlotWithin } from "./slots";
import type { Db } from "./session-service";

export type AvailabilityRow = { participantId: string; slotStart: Date };

export type SetAvailabilityInput = {
  sessionId: string;
  participantId: string;
  /** Slots to mark free. Already-marked slots are left as they are. */
  add: Date[];
  /** Slots to clear. Slots that were never marked are ignored. */
  remove: Date[];
};

export type SetAvailabilityFailure =
  | "no_such_session"
  | "not_a_participant"
  | "slot_out_of_range"
  | "session_finalized";

export type SetAvailabilityResult =
  | { ok: true }
  | { ok: false; reason: SetAvailabilityFailure };

export async function setAvailability(
  db: Db,
  input: SetAvailabilityInput,
): Promise<SetAvailabilityResult> {
  const session = (
    await db.select().from(sessions).where(eq(sessions.id, input.sessionId)).limit(1)
  )[0];
  if (!session) return { ok: false, reason: "no_such_session" };

  // SPEC.md: finalising locks the session read-only.
  if (session.status === "finalized") return { ok: false, reason: "session_finalized" };

  const person = (
    await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.id, input.participantId),
          eq(participants.sessionId, input.sessionId),
        ),
      )
      .limit(1)
  )[0];
  if (!person) return { ok: false, reason: "not_a_participant" };

  // The browser can post any timestamp, so every slot is checked against the
  // session's own window before anything is written. One bad slot rejects the
  // whole batch rather than silently applying part of a drag.
  for (const slot of [...input.add, ...input.remove]) {
    if (!isSlotWithin(session, slot)) return { ok: false, reason: "slot_out_of_range" };
  }

  if (input.add.length === 0 && input.remove.length === 0) return { ok: true };

  await db.transaction(async (tx) => {
    if (input.remove.length > 0) {
      await tx
        .delete(availabilityBlocks)
        .where(
          and(
            eq(availabilityBlocks.participantId, input.participantId),
            inArray(availabilityBlocks.slotStart, input.remove),
          ),
        );
    }

    if (input.add.length > 0) {
      await tx
        .insert(availabilityBlocks)
        .values(
          input.add.map((slotStart) => ({
            id: randomUUID(),
            sessionId: input.sessionId,
            participantId: input.participantId,
            slotStart,
          })),
        )
        // Re-painting over an existing selection is a no-op, not an error.
        .onConflictDoNothing({
          target: [availabilityBlocks.participantId, availabilityBlocks.slotStart],
        });
    }
  });

  return { ok: true };
}

/** Every mark in a session, for building the overlap heatmap. */
export async function listAvailability(
  db: Db,
  sessionId: string,
): Promise<AvailabilityRow[]> {
  return db
    .select({
      participantId: availabilityBlocks.participantId,
      slotStart: availabilityBlocks.slotStart,
    })
    .from(availabilityBlocks)
    .where(eq(availabilityBlocks.sessionId, sessionId));
}

/** How many people are free in each slot, keyed by the slot's ISO string. */
export function countsBySlot(rows: AvailabilityRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.slotStart.toISOString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** One person's marks, as ISO strings for cheap lookup while rendering. */
export function slotsForParticipant(
  rows: AvailabilityRow[],
  participantId: string,
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.participantId === participantId) out.add(row.slotStart.toISOString());
  }
  return out;
}
