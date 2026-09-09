import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-client";
import { activities, rankings, sessions } from "@/db/schema";
import { createSession, joinSession, type Db } from "./session-service";
import {
  addActivity,
  groupRanking,
  listActivities,
  listBallots,
  rankingForParticipant,
  setRanking,
} from "./activity-service";

let db: Db;
let sessionId: string;
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
  adminId = created.participantId;
});

async function addPerson(name: string, pin: string) {
  const r = await joinSession(db, { sessionId, name, pin });
  if (!r.ok) throw new Error("join failed");
  return r.participant.id;
}

async function add(name: string, participantId = adminId) {
  const r = await addActivity(db, { sessionId, participantId, name });
  if (!r.ok) throw new Error(`addActivity failed: ${r.reason}`);
  return r.activity.id;
}

describe("addActivity", () => {
  it("adds an option credited to whoever suggested it", async () => {
    const r = await addActivity(db, {
      sessionId,
      participantId: adminId,
      name: "Som Tam Nua",
      locationName: "Siam Square",
      latitude: 13.7455,
      longitude: 100.5343,
      imageUrl: "https://cdn.example.com/a.jpg",
      imageSource: "direct",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.activity.name).toBe("Som Tam Nua");
    expect(r.activity.createdBy).toBe(adminId);
    expect(r.activity.latitude).toBeCloseTo(13.7455);
  });

  it("lets an ordinary participant add one too", async () => {
    const ploy = await addPerson("Ploy", "5678");
    const r = await addActivity(db, { sessionId, participantId: ploy, name: "Jay Fai" });
    expect(r.ok).toBe(true);
  });

  it("trims the name", async () => {
    const r = await addActivity(db, { sessionId, participantId: adminId, name: "  Jay Fai  " });
    if (!r.ok) throw new Error("expected ok");
    expect(r.activity.name).toBe("Jay Fai");
  });

  it("refuses a blank name", async () => {
    const r = await addActivity(db, { sessionId, participantId: adminId, name: "   " });
    expect(r).toEqual({ ok: false, reason: "invalid_name" });
  });

  it("refuses a duplicate, whatever the capitalisation", async () => {
    await add("Jay Fai");
    const r = await addActivity(db, { sessionId, participantId: adminId, name: "jay fai" });
    expect(r).toEqual({ ok: false, reason: "duplicate_name" });
  });

  it("allows the same name in a different session", async () => {
    await add("Jay Fai");
    const other = await createSession(db, {
      title: "Other", dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 540, dailyEndMinutes: 1380,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");

    const r = await addActivity(db, {
      sessionId: other.sessionId, participantId: other.participantId, name: "Jay Fai",
    });
    expect(r.ok).toBe(true);
  });

  it("refuses an unknown session", async () => {
    const r = await addActivity(db, {
      sessionId: crypto.randomUUID(), participantId: adminId, name: "Jay Fai",
    });
    expect(r).toEqual({ ok: false, reason: "no_such_session" });
  });

  it("refuses someone who is not in the session", async () => {
    const other = await createSession(db, {
      title: "Other", dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 540, dailyEndMinutes: 1380,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");

    const r = await addActivity(db, {
      sessionId, participantId: other.participantId, name: "Jay Fai",
    });
    expect(r).toEqual({ ok: false, reason: "not_a_participant" });
  });

  it("refuses to change a finalised session", async () => {
    await db.update(sessions).set({ status: "finalized" }).where(eq(sessions.id, sessionId));
    const r = await addActivity(db, { sessionId, participantId: adminId, name: "Jay Fai" });
    expect(r).toEqual({ ok: false, reason: "session_finalized" });
  });

  it("disappears with its session", async () => {
    await add("Jay Fai");
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    expect(await db.select().from(activities)).toHaveLength(0);
  });
});

describe("listActivities", () => {
  it("is empty for a fresh session", async () => {
    expect(await listActivities(db, sessionId)).toEqual([]);
  });

  it("lists in the order they were suggested", async () => {
    await add("First");
    await add("Second");
    const names = (await listActivities(db, sessionId)).map((a) => a.name);
    expect(names).toEqual(["First", "Second"]);
  });

  it("does not leak another session's options", async () => {
    await add("Mine");
    const other = await createSession(db, {
      title: "Other", dateRangeStart: new Date("2026-09-10T00:00:00Z"),
      dateRangeEnd: new Date("2026-09-12T00:00:00Z"),
      dailyStartMinutes: 540, dailyEndMinutes: 1380,
      maxParticipants: 5, adminName: "Beam", adminPin: "2222",
    });
    if (!other.ok) throw new Error("seed failed");
    await addActivity(db, {
      sessionId: other.sessionId, participantId: other.participantId, name: "Theirs",
    });

    expect((await listActivities(db, sessionId)).map((a) => a.name)).toEqual(["Mine"]);
  });
});

describe("setRanking", () => {
  it("stores the order the participant chose", async () => {
    const a = await add("A");
    const b = await add("B");

    const r = await setRanking(db, { sessionId, participantId: adminId, activityIds: [b, a] });
    expect(r.ok).toBe(true);
    expect(await rankingForParticipant(db, adminId)).toEqual([b, a]);
  });

  it("replaces a previous order rather than appending", async () => {
    const a = await add("A");
    const b = await add("B");
    await setRanking(db, { sessionId, participantId: adminId, activityIds: [a, b] });

    await setRanking(db, { sessionId, participantId: adminId, activityIds: [b] });

    expect(await rankingForParticipant(db, adminId)).toEqual([b]);
    expect(await db.select().from(rankings)).toHaveLength(1);
  });

  it("clears a ranking when given an empty list", async () => {
    const a = await add("A");
    await setRanking(db, { sessionId, participantId: adminId, activityIds: [a] });

    await setRanking(db, { sessionId, participantId: adminId, activityIds: [] });
    expect(await rankingForParticipant(db, adminId)).toEqual([]);
  });

  it("refuses an option belonging to another session", async () => {
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

    const r = await setRanking(db, {
      sessionId, participantId: adminId, activityIds: [theirs.activity.id],
    });
    expect(r).toEqual({ ok: false, reason: "unknown_activity" });
  });

  it("writes nothing when one option is invalid", async () => {
    const a = await add("A");
    await setRanking(db, {
      sessionId, participantId: adminId, activityIds: [a, crypto.randomUUID()],
    });
    expect(await rankingForParticipant(db, adminId)).toEqual([]);
  });

  it("refuses a duplicate option in one ballot", async () => {
    const a = await add("A");
    const r = await setRanking(db, {
      sessionId, participantId: adminId, activityIds: [a, a],
    });
    expect(r).toEqual({ ok: false, reason: "duplicate_activity" });
  });

  it("refuses someone who is not in the session", async () => {
    const a = await add("A");
    const r = await setRanking(db, {
      sessionId, participantId: crypto.randomUUID(), activityIds: [a],
    });
    expect(r).toEqual({ ok: false, reason: "not_a_participant" });
  });

  it("refuses to change a finalised session", async () => {
    const a = await add("A");
    await db.update(sessions).set({ status: "finalized" }).where(eq(sessions.id, sessionId));
    const r = await setRanking(db, { sessionId, participantId: adminId, activityIds: [a] });
    expect(r).toEqual({ ok: false, reason: "session_finalized" });
  });

  it("keeps each participant's ranking separate", async () => {
    const ploy = await addPerson("Ploy", "5678");
    const a = await add("A");
    const b = await add("B");
    await setRanking(db, { sessionId, participantId: adminId, activityIds: [a, b] });
    await setRanking(db, { sessionId, participantId: ploy, activityIds: [b, a] });

    expect(await rankingForParticipant(db, adminId)).toEqual([a, b]);
    expect(await rankingForParticipant(db, ploy)).toEqual([b, a]);
  });
});

describe("listBallots", () => {
  it("is empty when nobody has ranked", async () => {
    await add("A");
    expect(await listBallots(db, sessionId)).toEqual([]);
  });

  it("returns each participant's order", async () => {
    const ploy = await addPerson("Ploy", "5678");
    const a = await add("A");
    const b = await add("B");
    await setRanking(db, { sessionId, participantId: adminId, activityIds: [a, b] });
    await setRanking(db, { sessionId, participantId: ploy, activityIds: [b] });

    const ballots = await listBallots(db, sessionId);
    expect(ballots).toHaveLength(2);
    expect(ballots.find((x) => x.participantId === adminId)!.activityIds).toEqual([a, b]);
    expect(ballots.find((x) => x.participantId === ploy)!.activityIds).toEqual([b]);
  });
});

describe("groupRanking", () => {
  it("orders the pool by everyone's combined preference", async () => {
    const ploy = await addPerson("Ploy", "5678");
    const a = await add("A");
    const b = await add("B");
    const c = await add("C");
    // a: 3+1=4, b: 2+3=5 -> b should lead
    await setRanking(db, { sessionId, participantId: adminId, activityIds: [a, b, c] });
    await setRanking(db, { sessionId, participantId: ploy, activityIds: [b, c, a] });

    const result = await groupRanking(db, sessionId);
    expect(result[0].activity.name).toBe("B");
    expect(result[0].score).toBe(5);
  });

  it("includes options nobody ranked, on zero", async () => {
    await add("Ignored");
    const result = await groupRanking(db, sessionId);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ score: 0, voters: 0 });
  });
});
