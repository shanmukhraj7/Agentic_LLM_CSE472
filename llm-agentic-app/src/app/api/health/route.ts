import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export async function GET() {
  let dbOk = true;
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err: unknown) {
    dbOk = false;
    console.error("Health check DB error:", err);
  }

  return Response.json(
    {
      ok: true,
      time: new Date().toISOString(),
      db: dbOk ? "connected" : "error",
    },
    { status: 200 }
  );
}

