import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { participants, sessions } from "@/db/schema";
import { Card, Tag } from "@/components/ui";
import { minutesToTime } from "@/lib/time";

export const dynamic = "force-dynamic";

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

  const people = await db
    .select()
    .from(participants)
    .where(eq(participants.sessionId, sessionId))
    .orderBy(asc(participants.createdAt));

  return (
    <main className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <header className="rise">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs uppercase tracking-[0.16em] text-umber">Organiser view</p>
          <Tag>{row.status === "open" ? "Open" : "Finalised"}</Tag>
        </div>
        <h1 className="mt-5 text-4xl">{row.title}</h1>
        <p className="mt-4 text-sm text-umber">
          {minutesToTime(row.dailyStartMinutes)}–{minutesToTime(row.dailyEndMinutes)} each day
          {" · "}
          {people.length} of {row.maxParticipants} seats taken
        </p>
      </header>

      <section className="mt-10">
        <Card className="rise">
          <h2 className="text-2xl">Who has joined</h2>
          <p className="mt-2 text-sm text-umber">
            PINs are shown so you can help anyone who forgets theirs.
          </p>
          <ul className="mt-6 divide-y divide-rule">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <span className="flex items-center gap-3">
                  <span>{p.name}</span>
                  {p.isAdmin ? <Tag>Organiser</Tag> : null}
                </span>
                <code className="font-mono text-sm tracking-[0.3em] text-umber">
                  {p.pin}
                </code>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </main>
  );
}
