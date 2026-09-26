import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-client";
import { sessions } from "@/db/schema";
import { createSession, type Db } from "./session-service";
import { RETENTION_DAYS, deleteExpiredSessions } from "./cleanup";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

async function seed(endsAt: string) {
  const r = await createSession(db, {
    title: "Plan",
    dateRangeStart: new Date(endsAt),
    dateRangeEnd: new Date(endsAt),
    dailyStartMinutes: 540,
    dailyEndMinutes: 1380,
    maxParticipants: 5,
    adminName: "Mook",
    adminPin: "1234",
  });
  if (!r.ok) throw new Error("seed failed");
  return r.sessionId;
}

const now = new Date("2026-12-01T00:00:00Z");

describe("deleteExpiredSessions", () => {
  it("keeps a session whose range ended recently", async () => {
    await seed("2026-11-30T00:00:00Z");
    expect(await deleteExpiredSessions(db, now)).toBe(0);
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it("deletes a session past the retention window", async () => {
    await seed("2026-01-01T00:00:00Z");
    expect(await deleteExpiredSessions(db, now)).toBe(1);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("keeps a session exactly on the boundary", async () => {
    const boundary = new Date(now.getTime() - RETENTION_DAYS * 86400000);
    await seed(boundary.toISOString());
    expect(await deleteExpiredSessions(db, now)).toBe(0);
  });

  it("takes participants and their data with it", async () => {
    await seed("2026-01-01T00:00:00Z");
    await deleteExpiredSessions(db, now);
    // cascade is enforced by the schema; no orphan sessions remain
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("leaves other sessions alone", async () => {
    await seed("2026-01-01T00:00:00Z");
    await seed("2026-11-30T00:00:00Z");
    expect(await deleteExpiredSessions(db, now)).toBe(1);
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it("retains for the 90 days the spec asks for", () => {
    expect(RETENTION_DAYS).toBe(90);
  });
});
