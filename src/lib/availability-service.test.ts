import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-client";
import { availabilityBlocks, sessions } from "@/db/schema";
import { createSession, joinSession, type Db } from "./session-service";
import {
  countsBySlot,
  listAvailability,
  setAvailability,
  slotsForParticipant,
} from "./availability-service";

let db: Db;
let sessionId: string;
let adminId: string;

const SLOT_A = new Date("2026-09-10T09:00:00Z");
const SLOT_B = new Date("2026-09-10T09:30:00Z");
const SLOT_C = new Date("2026-09-11T18:00:00Z");

beforeEach(async () => {
  db = await createTestDb();
  const created = await createSession(db, {
    title: "Friday dinner",
    dateRangeStart: new Date("2026-09-10T00:00:00Z"),
    dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
    dailyStartMinutes: 9 * 60,
    dailyEndMinutes: 23 * 60,
    maxParticipants: 10,
    adminName: "Mook",
    adminPin: "1234",
  });
  if (!created.ok) throw new Error("seed failed");
  sessionId = created.sessionId;
  adminId = created.participantId;
});

async function addPerson(name: string, pin: string) {
  const r = await joinSession(db, { sessionId, name, pin });
  if (!r.ok) throw new Error(`could not add ${name}`);
  return r.participant.id;
}

describe("setAvailability", () => {
  it("marks the slots a participant chose", async () => {
    const r = await setAvailability(db, {
      sessionId, participantId: adminId, add: [SLOT_A, SLOT_B], remove: [],
    });

    expect(r.ok).toBe(true);
    const rows = await listAvailability(db, sessionId);
    expect(rows).toHaveLength(2);
  });

  it("keeps one row when the same slot is marked twice", async () => {
    await setAvailability(db, { sessionId, participantId: adminId, add: [SLOT_A], remove: [] });
    await setAvailability(db, { sessionId, participantId: adminId, add: [SLOT_A], remove: [] });

    expect(await listAvailability(db, sessionId)).toHaveLength(1);
  });

  it("unmarks a slot", async () => {
    await setAvailability(db, { sessionId, participantId: adminId, add: [SLOT_A, SLOT_B], remove: [] });
    await setAvailability(db, { sessionId, participantId: adminId, add: [], remove: [SLOT_A] });

    const rows = await listAvailability(db, sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].slotStart.toISOString()).toBe(SLOT_B.toISOString());
  });

  it("applies marks and unmarks in one call", async () => {
    await setAvailability(db, { sessionId, participantId: adminId, add: [SLOT_A], remove: [] });
    await setAvailability(db, {
      sessionId, participantId: adminId, add: [SLOT_C], remove: [SLOT_A],
    });

    const rows = await listAvailability(db, sessionId);
    expect(rows.map((r) => r.slotStart.toISOString())).toEqual([SLOT_C.toISOString()]);
  });

  it("ignores an unmark for a slot that was never marked", async () => {
    const r = await setAvailability(db, {
      sessionId, participantId: adminId, add: [], remove: [SLOT_A],
    });
    expect(r.ok).toBe(true);
  });

  it("refuses a slot before the daily window opens", async () => {
    const r = await setAvailability(db, {
      sessionId, participantId: adminId,
      add: [new Date("2026-09-10T08:30:00Z")], remove: [],
    });
    expect(r).toEqual({ ok: false, reason: "slot_out_of_range" });
  });

  it("refuses a slot outside the date range", async () => {
    const r = await setAvailability(db, {
      sessionId, participantId: adminId,
      add: [new Date("2026-09-20T10:00:00Z")], remove: [],
    });
    expect(r).toEqual({ ok: false, reason: "slot_out_of_range" });
  });

  it("refuses a slot that is not on the half-hour grid", async () => {
    const r = await setAvailability(db, {
      sessionId, participantId: adminId,
      add: [new Date("2026-09-10T09:15:00Z")], remove: [],
    });
    expect(r).toEqual({ ok: false, reason: "slot_out_of_range" });
  });

  it("writes nothing when any slot in the batch is invalid", async () => {
    await setAvailability(db, {
      sessionId, participantId: adminId,
      add: [SLOT_A, new Date("2026-09-10T09:15:00Z")], remove: [],
    });
    expect(await listAvailability(db, sessionId)).toHaveLength(0);
  });

  it("refuses a participant who belongs to a different session", async () => {
    const other = await createSession(db, {
      title: "Other plan",
      dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 9 * 60, dailyEndMinutes: 23 * 60,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");

    const r = await setAvailability(db, {
      sessionId, participantId: other.participantId, add: [SLOT_A], remove: [],
    });
    expect(r).toEqual({ ok: false, reason: "not_a_participant" });
  });

  it("refuses an unknown session", async () => {
    const r = await setAvailability(db, {
      sessionId: crypto.randomUUID(), participantId: adminId, add: [SLOT_A], remove: [],
    });
    expect(r).toEqual({ ok: false, reason: "no_such_session" });
  });

  it("refuses to change a finalised session", async () => {
    await db.update(sessions).set({ status: "finalized" }).where(eq(sessions.id, sessionId));

    const r = await setAvailability(db, {
      sessionId, participantId: adminId, add: [SLOT_A], remove: [],
    });
    expect(r).toEqual({ ok: false, reason: "session_finalized" });
  });

  it("keeps one participant's marks separate from another's", async () => {
    const ploy = await addPerson("Ploy", "5678");
    await setAvailability(db, { sessionId, participantId: adminId, add: [SLOT_A], remove: [] });
    await setAvailability(db, { sessionId, participantId: ploy, add: [SLOT_B], remove: [] });

    const rows = await listAvailability(db, sessionId);
    expect(slotsForParticipant(rows, adminId)).toEqual(new Set([SLOT_A.toISOString()]));
    expect(slotsForParticipant(rows, ploy)).toEqual(new Set([SLOT_B.toISOString()]));
  });

  it("unmarking one participant leaves another's identical slot alone", async () => {
    const ploy = await addPerson("Ploy", "5678");
    await setAvailability(db, { sessionId, participantId: adminId, add: [SLOT_A], remove: [] });
    await setAvailability(db, { sessionId, participantId: ploy, add: [SLOT_A], remove: [] });

    await setAvailability(db, { sessionId, participantId: adminId, add: [], remove: [SLOT_A] });

    const rows = await listAvailability(db, sessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].participantId).toBe(ploy);
  });

  it("disappears with the participant it belongs to", async () => {
    const ploy = await addPerson("Ploy", "5678");
    await setAvailability(db, { sessionId, participantId: ploy, add: [SLOT_A], remove: [] });

    await db.delete(sessions).where(eq(sessions.id, sessionId));

    expect(await db.select().from(availabilityBlocks)).toHaveLength(0);
  });
});

describe("listAvailability", () => {
  it("returns nothing for a session no one has filled in", async () => {
    expect(await listAvailability(db, sessionId)).toEqual([]);
  });

  it("does not leak rows from another session", async () => {
    const other = await createSession(db, {
      title: "Other plan",
      dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 9 * 60, dailyEndMinutes: 23 * 60,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");
    await setAvailability(db, {
      sessionId: other.sessionId, participantId: other.participantId,
      add: [SLOT_A], remove: [],
    });

    expect(await listAvailability(db, sessionId)).toEqual([]);
  });
});

describe("countsBySlot", () => {
  it("counts how many people picked each slot", () => {
    const rows = [
      { participantId: "a", slotStart: SLOT_A },
      { participantId: "b", slotStart: SLOT_A },
      { participantId: "b", slotStart: SLOT_B },
    ];
    const counts = countsBySlot(rows);
    expect(counts.get(SLOT_A.toISOString())).toBe(2);
    expect(counts.get(SLOT_B.toISOString())).toBe(1);
  });

  it("has no entry for a slot nobody picked", () => {
    expect(countsBySlot([]).get(SLOT_A.toISOString())).toBeUndefined();
  });
});

describe("slotsForParticipant", () => {
  it("returns only that person's slots", () => {
    const rows = [
      { participantId: "a", slotStart: SLOT_A },
      { participantId: "b", slotStart: SLOT_B },
    ];
    expect(slotsForParticipant(rows, "a")).toEqual(new Set([SLOT_A.toISOString()]));
  });

  it("returns an empty set for someone who marked nothing", () => {
    expect(slotsForParticipant([], "a")).toEqual(new Set());
  });
});
