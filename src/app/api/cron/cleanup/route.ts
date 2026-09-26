import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { deleteExpiredSessions } from "@/lib/cleanup";

export const dynamic = "force-dynamic";

/**
 * Nightly expiry. Vercel Cron calls this with CRON_SECRET as a bearer token;
 * without the check the endpoint would be a public delete button.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }

  const deleted = await deleteExpiredSessions(db, new Date());
  return NextResponse.json({ deleted });
}
