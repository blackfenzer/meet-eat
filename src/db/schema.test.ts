import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-client";
import { sessions } from "./schema";

describe("sessions table", () => {
  it("inserts and reads back a session", async () => {
    const db = await createTestDb();
    const id = crypto.randomUUID();

    await db.insert(sessions).values({
      id,
      title: "Friday dinner",
      adminToken: "test-admin-token",
      dateRangeStart: new Date("2026-09-10"),
      dateRangeEnd: new Date("2026-09-20"),
      dailyStartMinutes: 9 * 60,
      dailyEndMinutes: 23 * 60,
      maxParticipants: 10,
    });

    const rows = await db.select().from(sessions);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Friday dinner");
    expect(rows[0].anonymousMode).toBe(false);
    expect(rows[0].status).toBe("open");
  });
});
