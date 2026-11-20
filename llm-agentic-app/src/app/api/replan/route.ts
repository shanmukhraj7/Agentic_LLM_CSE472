import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handleRoute, parseJson, jsonError } from "@/lib/http";
import {
  replanLearner,
  NoPlanError,
  ProfileMissingError,
} from "@/lib/services/replan";

// Per Next.js 16 docs (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md):
// Route segment config "runtime" is not compatible with nextConfig.cacheComponents and causes compile failure.
// Cache Components defaults to nodejs runtime.
// export const runtime = "nodejs";
export const maxDuration = 60;

const ReplanSchema = z.object({
  trigger: z.enum(["progress", "manual"]),
});

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { trigger } = await parseJson(req, ReplanSchema);

    try {
      const result = await replanLearner({
        learnerId: user.id,
        trigger,
      });

      return NextResponse.json(result);
    } catch (err: unknown) {
      const isNoPlan =
        err instanceof NoPlanError ||
        (typeof err === "object" &&
          err !== null &&
          ("code" in err
            ? (err as { code: unknown }).code === "NO_PLAN"
            : "name" in err &&
              (err as { name: unknown }).name === "NoPlanError")) ||
        (err instanceof Error && err.message.toLowerCase().includes("no plan"));

      if (isNoPlan) {
        return jsonError(
          409,
          "NO_PLAN",
          err instanceof Error ? err.message : "No plan found for learner"
        );
      }

      const isProfileMissing =
        err instanceof ProfileMissingError ||
        (typeof err === "object" &&
          err !== null &&
          ("code" in err
            ? (err as { code: unknown }).code === "PROFILE_MISSING"
            : "name" in err &&
              (err as { name: unknown }).name === "ProfileMissingError"));

      if (isProfileMissing) {
        return jsonError(
          400,
          "PROFILE_MISSING",
          err instanceof Error ? err.message : "Learner profile not found"
        );
      }

      throw err;
    }
  });
}
