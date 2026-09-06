import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./test-client";
import { participants, sessions } from "./schema";

async function seedSession(db: Awaited<ReturnType<typeof createTestDb>>) {
  const id = crypto.randomUUID();
  await db.insert(sessions).values({
    id,
    title: "Friday dinner",
    adminToken: crypto.randomUUID(),
    dateRangeStart: new Date("2026-09-10"),
    dateRangeEnd: new Date("2026-09-20"),
    dailyStartMinutes: 9 * 60,
    dailyEndMinutes: 23 * 60,
    maxParticipants: 10,
  });
  return id;
}

describe("participants table", () => {
  it("stores a participant against a session", async () => {
    const db = await createTestDb();
    const sessionId = await seedSession(db);

    await db.insert(participants).values({
      id: crypto.randomUUID(),
      sessionId,
      name: "Mook",
      pin: "1234",
    });

    const rows = await db.select().from(participants);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Mook");
    expect(rows[0].pin).toBe("1234");
    expect(rows[0].isAdmin).toBe(false);
  });

  it("rejects a duplicate name within the same session", async () => {
    const db = await createTestDb();
    const sessionId = await seedSession(db);
    const base = { sessionId, name: "Mook", pin: "1234" };

    await db.insert(participants).values({ ...base, id: crypto.randomUUID() });

    await expect(
      db.insert(participants).values({ ...base, id: crypto.randomUUID() }),
    ).rejects.toThrow();
  });

  it("allows the same name in two different sessions", async () => {
    const db = await createTestDb();
    const a = await seedSession(db);
    const b = await seedSession(db);

    await db.insert(participants).values({
      id: crypto.randomUUID(), sessionId: a, name: "Mook", pin: "1234",
    });
    await db.insert(participants).values({
      id: crypto.randomUUID(), sessionId: b, name: "Mook", pin: "9999",
    });

    expect(await db.select().from(participants)).toHaveLength(2);
  });

  it("removes participants when their session is deleted", async () => {
    const db = await createTestDb();
    const sessionId = await seedSession(db);
    await db.insert(participants).values({
      id: crypto.randomUUID(), sessionId, name: "Mook", pin: "1234",
    });

    await db.delete(sessions).where(eq(sessions.id, sessionId));

    expect(await db.select().from(participants)).toHaveLength(0);
  });
  it("treats names that differ only by case as the same person", async () => {
    const db = await createTestDb();
    const sessionId = await seedSession(db);

    await db.insert(participants).values({
      id: crypto.randomUUID(), sessionId, name: "Mook", pin: "1234",
    });

    await expect(
      db.insert(participants).values({
        id: crypto.randomUUID(), sessionId, name: "mook", pin: "5678",
      }),
    ).rejects.toThrow();
  });
});
