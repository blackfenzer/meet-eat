import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { activities, participants, sessions } from "@/db/schema";
import { AdminPanel } from "@/components/admin-panel";
import { Tag } from "@/components/ui";
import { minutesToTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default async function AdminPage({
  params,
}: {
  params: Promise<{ sessionId: string; adminToken: string }>;
}) {
  const { sessionId, adminToken } = await params;

  const row = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];

  // A wrong token is indistinguishable from a missing plan, so a guessed token
  // learns nothing about whether the session exists.
  if (!row || row.adminToken !== adminToken) notFound();

  const [people, pool] = await Promise.all([
    db
      .select()
      .from(participants)
      .where(eq(participants.sessionId, sessionId))
      .orderBy(asc(participants.guestNumber)),
    db
      .select()
      .from(activities)
      .where(eq(activities.sessionId, sessionId))
      .orderBy(asc(activities.createdAt)),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <header className="rise">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs uppercase tracking-[0.16em] text-umber">Organiser view</p>
          <Tag>{row.status === "open" ? "Open" : "Settled"}</Tag>
        </div>
        <h1 className="mt-5 text-4xl">{row.title}</h1>
        <p className="mt-4 text-sm text-umber">
          {minutesToTime(row.dailyStartMinutes)}–{minutesToTime(row.dailyEndMinutes)} each day
          {" · "}
          {people.length} of {row.maxParticipants} seats taken
        </p>
      </header>

      <section className="mt-10">
        <AdminPanel
          view={{
            sessionId,
            adminToken,
            title: row.title,
            startDate: isoDay(row.dateRangeStart),
            endDate: isoDay(row.dateRangeEnd),
            startTime: minutesToTime(row.dailyStartMinutes),
            endTime: minutesToTime(row.dailyEndMinutes),
            maxParticipants: row.maxParticipants,
            anonymousMode: row.anonymousMode,
            status: row.status,
            finalDate: row.finalDate ? isoDay(row.finalDate) : null,
            finalStartMinutes: row.finalStartMinutes,
            finalEndMinutes: row.finalEndMinutes,
            finalActivityId: row.finalActivityId,
            people: people.map((p) => ({
              id: p.id,
              name: p.name,
              pin: p.pin,
              isAdmin: p.isAdmin,
              guestNumber: p.guestNumber,
            })),
            activities: pool.map((a) => ({
              id: a.id,
              name: a.name,
              locationName: a.locationName,
            })),
          }}
        />
      </section>
    </main>
  );
}
