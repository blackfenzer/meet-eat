import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { JoinFlow } from "@/components/join-flow";
import { minutesToTime } from "@/lib/time";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const row = (
    await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
  )[0];
  if (!row) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <header className="rise">
        <p className="text-xs uppercase tracking-[0.16em] text-umber">Meet &amp; Eat</p>
        <p className="mt-4 text-sm text-umber">
          {formatDate(row.dateRangeStart)} – {formatDate(row.dateRangeEnd)}
          {" · "}
          {minutesToTime(row.dailyStartMinutes)}–{minutesToTime(row.dailyEndMinutes)}
        </p>
      </header>

      <section className="mt-10">
        <JoinFlow sessionId={row.id} title={row.title} />
      </section>
    </main>
  );
}
