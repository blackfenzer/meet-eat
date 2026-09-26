import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { JoinFlow } from "@/components/join-flow";
import { FinalPlan } from "@/components/final-plan";
import { activities } from "@/db/schema";
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

  // SPEC.md: once settled, anyone opening the link sees the plan itself, with
  // no need to identify themselves first.
  if (row.status === "finalized") {
    const chosen = row.finalActivityId
      ? (
          await db
            .select()
            .from(activities)
            .where(eq(activities.id, row.finalActivityId))
            .limit(1)
        )[0]
      : undefined;

    return (
      <main className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
        <header className="rise">
          <p className="text-xs uppercase tracking-[0.16em] text-umber">Meet &amp; Eat</p>
        </header>
        <section className="mt-10">
          <FinalPlan
            plan={{
              title: row.title,
              date: row.finalDate,
              startMinutes: row.finalStartMinutes,
              endMinutes: row.finalEndMinutes,
              activity: chosen
                ? {
                    name: chosen.name,
                    locationName: chosen.locationName,
                    latitude: chosen.latitude,
                    longitude: chosen.longitude,
                    imageUrl: chosen.imageUrl,
                  }
                : null,
            }}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
      <header className="rise">
        <p className="text-xs uppercase tracking-[0.16em] text-umber">Meet &amp; Eat</p>
        <p className="mt-4 text-sm text-umber">
          {formatDate(row.dateRangeStart)} – {formatDate(row.dateRangeEnd)}
          {" · "}
          {minutesToTime(row.dailyStartMinutes)}–{minutesToTime(row.dailyEndMinutes)}
        </p>
      </header>

      <section className="mt-10">
        <JoinFlow
          sessionId={row.id}
          title={row.title}
          locked={false}
          longdoKey={process.env.LONGDO_MAP_KEY ?? null}
          window={{
            dateRangeStartIso: row.dateRangeStart.toISOString(),
            dateRangeEndIso: row.dateRangeEnd.toISOString(),
            dailyStartMinutes: row.dailyStartMinutes,
            dailyEndMinutes: row.dailyEndMinutes,
          }}
        />
      </section>
    </main>
  );
}
