import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-client";
import { activities, participants, sessions } from "@/db/schema";
import { createSession, joinSession, type Db } from "./session-service";
import { addActivity } from "./activity-service";
import {
  finalizeSession,
  removeActivity,
  removeParticipant,
  reopenSession,
  resetPin,
  updateSessionSettings,
  verifyAdmin,
} from "./admin-service";

let db: Db;
let sessionId: string;
let adminToken: string;
let adminId: string;

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
  adminToken = created.adminToken;
  adminId = created.participantId;
});

async function addPerson(name: string, pin: string) {
  const r = await joinSession(db, { sessionId, name, pin });
  if (!r.ok) throw new Error("join failed");
  return r.participant;
}

describe("guest numbers", () => {
  it("gives the organiser the first number", async () => {
    const rows = await db.select().from(participants).where(eq(participants.id, adminId));
    expect(rows[0].guestNumber).toBe(1);
  });

  it("numbers each new joiner in turn", async () => {
    const ploy = await addPerson("Ploy", "5678");
    const beam = await addPerson("Beam", "1111");
    expect(ploy.guestNumber).toBe(2);
    expect(beam.guestNumber).toBe(3);
  });

  it("keeps a returning participant's number", async () => {
    const first = await addPerson("Ploy", "5678");
    const again = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    if (!again.ok) throw new Error("expected ok");
    expect(again.participant.guestNumber).toBe(first.guestNumber);
  });

  it("does not reuse a number after someone is removed", async () => {
    const ploy = await addPerson("Ploy", "5678");
    await removeParticipant(db, sessionId, ploy.id);
    const beam = await addPerson("Beam", "1111");
    expect(beam.guestNumber).toBe(3);
  });

  it("numbers restart in a different session", async () => {
    const other = await createSession(db, {
      title: "Other", dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 540, dailyEndMinutes: 1380,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");
    const rows = await db.select().from(participants).where(eq(participants.id, other.participantId));
    expect(rows[0].guestNumber).toBe(1);
  });
});

describe("verifyAdmin", () => {
  it("accepts the token the session issued", async () => {
    expect(await verifyAdmin(db, sessionId, adminToken)).toBe(true);
  });

  it("rejects a wrong token", async () => {
    expect(await verifyAdmin(db, sessionId, "nope")).toBe(false);
  });

  it("rejects an unknown session", async () => {
    expect(await verifyAdmin(db, crypto.randomUUID(), adminToken)).toBe(false);
  });

  it("rejects another session's token", async () => {
    const other = await createSession(db, {
      title: "Other", dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 540, dailyEndMinutes: 1380,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");
    expect(await verifyAdmin(db, sessionId, other.adminToken)).toBe(false);
  });
});

describe("updateSessionSettings", () => {
  it("changes the title", async () => {
    const r = await updateSessionSettings(db, sessionId, { title: "Saturday brunch" });
    expect(r.ok).toBe(true);
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(row.title).toBe("Saturday brunch");
  });

  it("toggles anonymous mode", async () => {
    await updateSessionSettings(db, sessionId, { anonymousMode: true });
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(row.anonymousMode).toBe(true);
  });

  it("changes the room cap", async () => {
    await updateSessionSettings(db, sessionId, { maxParticipants: 3 });
    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(row.maxParticipants).toBe(3);
  });

  it("refuses a cap below the people already in the room", async () => {
    await addPerson("Ploy", "5678");
    const r = await updateSessionSettings(db, sessionId, { maxParticipants: 1 });
    expect(r).toEqual({ ok: false, reason: "cap_below_current" });
  });

  it("refuses an inverted date range", async () => {
    const r = await updateSessionSettings(db, sessionId, {
      dateRangeStart: new Date("2026-09-20T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-10T00:00:00Z"),
    });
    expect(r).toEqual({ ok: false, reason: "invalid_date_range" });
  });

  it("refuses an inverted daily window", async () => {
    const r = await updateSessionSettings(db, sessionId, {
      dailyStartMinutes: 1380, dailyEndMinutes: 540,
    });
    expect(r).toEqual({ ok: false, reason: "invalid_time_window" });
  });

  it("refuses a blank title", async () => {
    expect(await updateSessionSettings(db, sessionId, { title: "  " }))
      .toEqual({ ok: false, reason: "invalid_title" });
  });

  it("refuses an unknown session", async () => {
    expect(await updateSessionSettings(db, crypto.randomUUID(), { title: "x" }))
      .toEqual({ ok: false, reason: "no_such_session" });
  });
});

describe("removeParticipant", () => {
  it("removes the person", async () => {
    const ploy = await addPerson("Ploy", "5678");
    const r = await removeParticipant(db, sessionId, ploy.id);
    expect(r.ok).toBe(true);
    expect(await db.select().from(participants)).toHaveLength(1);
  });

  it("refuses to remove the organiser", async () => {
    expect(await removeParticipant(db, sessionId, adminId))
      .toEqual({ ok: false, reason: "cannot_remove_admin" });
  });

  it("refuses someone from another session", async () => {
    const other = await createSession(db, {
      title: "Other", dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 540, dailyEndMinutes: 1380,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");
    expect(await removeParticipant(db, sessionId, other.participantId))
      .toEqual({ ok: false, reason: "not_a_participant" });
  });
});

describe("resetPin", () => {
  it("sets a new PIN the participant can log in with", async () => {
    const ploy = await addPerson("Ploy", "5678");
    const r = await resetPin(db, sessionId, ploy.id, "4321");
    expect(r.ok).toBe(true);

    const login = await joinSession(db, { sessionId, name: "Ploy", pin: "4321" });
    expect(login.ok).toBe(true);
  });

  it("clears any lockout so the reset actually helps", async () => {
    const ploy = await addPerson("Ploy", "5678");
    await db.update(participants)
      .set({ pinAttempts: 5, lockedUntil: new Date(Date.now() + 600_000) })
      .where(eq(participants.id, ploy.id));

    await resetPin(db, sessionId, ploy.id, "4321");

    const login = await joinSession(db, { sessionId, name: "Ploy", pin: "4321" });
    expect(login.ok).toBe(true);
  });

  it("refuses a PIN that is not four digits", async () => {
    const ploy = await addPerson("Ploy", "5678");
    expect(await resetPin(db, sessionId, ploy.id, "12"))
      .toEqual({ ok: false, reason: "invalid_pin" });
  });
});

describe("removeActivity", () => {
  it("removes the option from the pool", async () => {
    const a = await addActivity(db, { sessionId, participantId: adminId, name: "Jay Fai" });
    if (!a.ok) throw new Error("seed failed");

    const r = await removeActivity(db, sessionId, a.activity.id);
    expect(r.ok).toBe(true);
    expect(await db.select().from(activities)).toHaveLength(0);
  });

  it("refuses an option from another session", async () => {
    const other = await createSession(db, {
      title: "Other", dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 540, dailyEndMinutes: 1380,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");
    const theirs = await addActivity(db, {
      sessionId: other.sessionId, participantId: other.participantId, name: "Theirs",
    });
    if (!theirs.ok) throw new Error("seed failed");

    expect(await removeActivity(db, sessionId, theirs.activity.id))
      .toEqual({ ok: false, reason: "unknown_activity" });
  });
});

describe("finalizeSession", () => {
  async function seedActivity() {
    const a = await addActivity(db, { sessionId, participantId: adminId, name: "Jay Fai" });
    if (!a.ok) throw new Error("seed failed");
    return a.activity.id;
  }

  it("locks the session with the chosen plan", async () => {
    const activityId = await seedActivity();
    const r = await finalizeSession(db, sessionId, {
      date: new Date("2026-09-11T00:00:00Z"),
      startMinutes: 18 * 60,
      endMinutes: 20 * 60,
      activityId,
    });
    expect(r.ok).toBe(true);

    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(row.status).toBe("finalized");
    expect(row.finalStartMinutes).toBe(1080);
    expect(row.finalActivityId).toBe(activityId);
  });

  it("allows finalising with no activity chosen", async () => {
    const r = await finalizeSession(db, sessionId, {
      date: new Date("2026-09-11T00:00:00Z"),
      startMinutes: 18 * 60, endMinutes: 20 * 60, activityId: null,
    });
    expect(r.ok).toBe(true);
  });

  it("refuses an end time at or before the start", async () => {
    expect(await finalizeSession(db, sessionId, {
      date: new Date("2026-09-11T00:00:00Z"),
      startMinutes: 20 * 60, endMinutes: 18 * 60, activityId: null,
    })).toEqual({ ok: false, reason: "invalid_time_window" });
  });

  it("refuses an activity from another session", async () => {
    const other = await createSession(db, {
      title: "Other", dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 540, dailyEndMinutes: 1380,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");
    const theirs = await addActivity(db, {
      sessionId: other.sessionId, participantId: other.participantId, name: "Theirs",
    });
    if (!theirs.ok) throw new Error("seed failed");

    expect(await finalizeSession(db, sessionId, {
      date: new Date("2026-09-11T00:00:00Z"),
      startMinutes: 18 * 60, endMinutes: 20 * 60, activityId: theirs.activity.id,
    })).toEqual({ ok: false, reason: "unknown_activity" });
  });
});

describe("reopenSession", () => {
  it("unlocks a finalised session", async () => {
    await finalizeSession(db, sessionId, {
      date: new Date("2026-09-11T00:00:00Z"),
      startMinutes: 18 * 60, endMinutes: 20 * 60, activityId: null,
    });

    const r = await reopenSession(db, sessionId);
    expect(r.ok).toBe(true);

    const row = (await db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
    expect(row.status).toBe("open");
    expect(row.finalDate).toBeNull();
    expect(row.finalActivityId).toBeNull();
  });

  it("is harmless on a session that was never finalised", async () => {
    expect((await reopenSession(db, sessionId)).ok).toBe(true);
  });
});
