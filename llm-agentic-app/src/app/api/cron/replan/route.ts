import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runCronReplan } from "@/lib/services/cron";

// Per Next.js 16 docs (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md):
// Route segment config "runtime" is not compatible with nextConfig.cacheComponents and causes compile failure.
// Cache Components defaults to nodejs runtime.
// export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({}, { status: 401 });
  }

  const summary = await runCronReplan();
  return NextResponse.json(summary);
}
