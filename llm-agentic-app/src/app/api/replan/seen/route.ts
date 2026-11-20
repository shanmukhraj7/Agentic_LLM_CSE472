import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleRoute } from "@/lib/http";
import { markReplansSeen } from "@/lib/services/history";

export async function POST() {
  return handleRoute(async () => {
    const user = await requireUser();
    await markReplansSeen(user.id);

    return NextResponse.json({ ok: true });
  });
}
