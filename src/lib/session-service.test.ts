import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-client";
import { participants } from "@/db/schema";
import { MAX_PIN_ATTEMPTS } from "./pin-throttle";
import {
  createSession,
  joinSession,
  resolveName,
  type CreateSessionInput,
  type Db,
} from "./session-service";

const validInput = (over: Partial<CreateSessionInput> = {}): CreateSessionInput => ({
  title: "Friday dinner",
  dateRangeStart: new Date("2026-09-10"),
  dateRangeEnd: new Date("2026-09-20"),
  dailyStartMinutes: 9 * 60,
  dailyEndMinutes: 23 * 60,
  maxParticipants: 3,
  adminName: "Mook",
  adminPin: "1234",
  ...over,
});

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("createSession", () => {
  it("creates the session and enrols the admin as a participant", async () => {
    const r = await createSession(db, validInput());
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rows = await db.select().from(participants);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Mook");
    expect(rows[0].isAdmin).toBe(true);
    expect(rows[0].sessionId).toBe(r.sessionId);
  });

  it("issues an admin token long enough not to be guessable", async () => {
    const r = await createSession(db, validInput());
    if (!r.ok) throw new Error("expected ok");
    expect(r.adminToken.length).toBeGreaterThanOrEqual(32);
  });

  it("issues a different admin token per session", async () => {
    const a = await createSession(db, validInput());
    const b = await createSession(db, validInput());
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.adminToken).not.toBe(b.adminToken);
  });

  it("rejects a PIN that is not four digits", async () => {
    const r = await createSession(db, validInput({ adminPin: "12" }));
    expect(r).toEqual({ ok: false, reason: "invalid_pin" });
  });

  it("rejects a blank title", async () => {
    const r = await createSession(db, validInput({ title: "   " }));
    expect(r).toEqual({ ok: false, reason: "invalid_title" });
  });

  it("rejects a date range that ends before it starts", async () => {
    const r = await createSession(
      db,
      validInput({ dateRangeStart: new Date("2026-09-20"), dateRangeEnd: new Date("2026-09-10") }),
    );
    expect(r).toEqual({ ok: false, reason: "invalid_date_range" });
  });

  it("rejects a daily window that ends before it starts", async () => {
    const r = await createSession(
      db,
      validInput({ dailyStartMinutes: 23 * 60, dailyEndMinutes: 9 * 60 }),
    );
    expect(r).toEqual({ ok: false, reason: "invalid_time_window" });
  });

  it("rejects a room cap below one", async () => {
    const r = await createSession(db, validInput({ maxParticipants: 0 }));
    expect(r).toEqual({ ok: false, reason: "invalid_capacity" });
  });

  it("writes no session when validation fails", async () => {
    await createSession(db, validInput({ adminPin: "abcd" }));
    expect(await db.select().from(participants)).toHaveLength(0);
  });
});

describe("joinSession", () => {
  async function seed(over: Partial<CreateSessionInput> = {}) {
    const r = await createSession(db, validInput(over));
    if (!r.ok) throw new Error("seed failed");
    return r.sessionId;
  }

  it("admits a brand-new name while the room is under cap", async () => {
    const sessionId = await seed();
    const r = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.participant.name).toBe("Ploy");
    expect(r.participant.isAdmin).toBe(false);
    expect(r.created).toBe(true);
  });

  it("counts the admin against the room cap", async () => {
    const sessionId = await seed({ maxParticipants: 2 });
    await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });

    const r = await joinSession(db, { sessionId, name: "Beam", pin: "1111" });
    expect(r).toEqual({ ok: false, reason: "session_full" });
  });

  it("turns away a brand-new name once the room is full", async () => {
    const sessionId = await seed({ maxParticipants: 1 });
    const r = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    expect(r).toEqual({ ok: false, reason: "session_full" });
  });

  it("logs an existing name back in with the right PIN", async () => {
    const sessionId = await seed();
    const first = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    if (!first.ok) throw new Error("expected ok");

    const again = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.participant.id).toBe(first.participant.id);
    expect(again.created).toBe(false);
    expect(await db.select().from(participants)).toHaveLength(2);
  });

  it("refuses an existing name with the wrong PIN", async () => {
    const sessionId = await seed();
    await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });

    const r = await joinSession(db, { sessionId, name: "Ploy", pin: "0000" });
    expect(r).toEqual({ ok: false, reason: "wrong_pin" });
    expect(await db.select().from(participants)).toHaveLength(2);
  });

  it("lets a returning participant reclaim their seat even past capacity", async () => {
    const sessionId = await seed({ maxParticipants: 2 });
    const joined = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    if (!joined.ok) throw new Error("expected ok");
    // room is now full (admin + Ploy = 2 of 2)
    expect(await joinSession(db, { sessionId, name: "Beam", pin: "1111" })).toEqual({
      ok: false, reason: "session_full",
    });

    const again = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.participant.id).toBe(joined.participant.id);
  });

  it("matches an existing name regardless of capitalisation", async () => {
    const sessionId = await seed();
    const first = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    if (!first.ok) throw new Error("expected ok");

    const again = await joinSession(db, { sessionId, name: "PLOY", pin: "5678" });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.participant.id).toBe(first.participant.id);
  });

  it("ignores surrounding whitespace in a name", async () => {
    const sessionId = await seed();
    const first = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    if (!first.ok) throw new Error("expected ok");

    const again = await joinSession(db, { sessionId, name: "  Ploy  ", pin: "5678" });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.participant.id).toBe(first.participant.id);
  });

  it("rejects a blank name", async () => {
    const sessionId = await seed();
    const r = await joinSession(db, { sessionId, name: "   ", pin: "5678" });
    expect(r).toEqual({ ok: false, reason: "invalid_name" });
  });

  it("rejects a PIN that is not four digits", async () => {
    const sessionId = await seed();
    const r = await joinSession(db, { sessionId, name: "Ploy", pin: "56" });
    expect(r).toEqual({ ok: false, reason: "invalid_pin" });
  });

  it("reports an unknown session rather than creating one", async () => {
    const r = await joinSession(db, {
      sessionId: crypto.randomUUID(), name: "Ploy", pin: "5678",
    });
    expect(r).toEqual({ ok: false, reason: "no_such_session" });
  });

  it("keeps names in separate sessions independent", async () => {
    const a = await seed();
    const b = await seed();
    await joinSession(db, { sessionId: a, name: "Ploy", pin: "5678" });

    const r = await joinSession(db, { sessionId: b, name: "Ploy", pin: "9999" });
    expect(r.ok).toBe(true);
  });
});

describe("resolveName", () => {
  async function seed(over: Partial<CreateSessionInput> = {}) {
    const r = await createSession(db, validInput(over));
    if (!r.ok) throw new Error("seed failed");
    return r.sessionId;
  }

  it("says a free name in a roomy session is new", async () => {
    const sessionId = await seed();
    expect(await resolveName(db, sessionId, "Ploy")).toBe("new");
  });

  it("says a taken name is existing", async () => {
    const sessionId = await seed();
    expect(await resolveName(db, sessionId, "Mook")).toBe("existing");
  });

  it("says a taken name is existing even when the room is full", async () => {
    const sessionId = await seed({ maxParticipants: 1 });
    expect(await resolveName(db, sessionId, "Mook")).toBe("existing");
  });

  it("says a free name in a full session is full", async () => {
    const sessionId = await seed({ maxParticipants: 1 });
    expect(await resolveName(db, sessionId, "Ploy")).toBe("full");
  });
  it("throws rather than guessing when the session does not exist", async () => {
    await expect(resolveName(db, crypto.randomUUID(), "Ploy")).rejects.toThrow(
      /no such session/i,
    );
  });
});

describe("joinSession PIN throttling", () => {
  async function seed() {
    const r = await createSession(db, validInput());
    if (!r.ok) throw new Error("seed failed");
    return r.sessionId;
  }

  it("locks the name out after too many wrong PINs", async () => {
    const sessionId = await seed();
    await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });

    let last;
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) {
      last = await joinSession(db, { sessionId, name: "Ploy", pin: "0000" });
    }

    expect(last).toEqual({ ok: false, reason: "locked_out" });
  });

  it("refuses even the correct PIN while locked out", async () => {
    const sessionId = await seed();
    await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) {
      await joinSession(db, { sessionId, name: "Ploy", pin: "0000" });
    }

    const r = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    expect(r).toEqual({ ok: false, reason: "locked_out" });
  });

  it("lets a correct PIN through before the ceiling and forgets the attempts", async () => {
    const sessionId = await seed();
    await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    await joinSession(db, { sessionId, name: "Ploy", pin: "0000" });
    await joinSession(db, { sessionId, name: "Ploy", pin: "0000" });

    const good = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    expect(good.ok).toBe(true);

    const row = (
      await db.select().from(participants).where(eq(participants.sessionId, sessionId))
    ).find((p) => p.name === "Ploy");
    expect(row?.pinAttempts).toBe(0);
    expect(row?.lockedUntil).toBeNull();
  });

  it("admits the right PIN again once the lock has expired", async () => {
    const sessionId = await seed();
    const joined = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    if (!joined.ok) throw new Error("expected ok");
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) {
      await joinSession(db, { sessionId, name: "Ploy", pin: "0000" });
    }

    // wind the lock back into the past
    await db
      .update(participants)
      .set({ lockedUntil: new Date(Date.now() - 60_000) })
      .where(eq(participants.id, joined.participant.id));

    const r = await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    expect(r.ok).toBe(true);
  });

  it("throttles each name independently", async () => {
    const sessionId = await seed();
    await joinSession(db, { sessionId, name: "Ploy", pin: "5678" });
    await joinSession(db, { sessionId, name: "Beam", pin: "1111" });
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) {
      await joinSession(db, { sessionId, name: "Ploy", pin: "0000" });
    }

    const beam = await joinSession(db, { sessionId, name: "Beam", pin: "1111" });
    expect(beam.ok).toBe(true);
  });

  it("does not throttle a brand-new name", async () => {
    const sessionId = await seed();
    const r = await joinSession(db, { sessionId, name: "Newcomer", pin: "4321" });
    expect(r.ok).toBe(true);
  });
});
