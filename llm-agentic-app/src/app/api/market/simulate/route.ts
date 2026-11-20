import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { handleRoute, parseJson, jsonError } from "@/lib/http";
import { db } from "@/lib/db/client";
import { skillTrends } from "@/lib/db/schema";
import { isKnownSkill } from "@/lib/skills/vocab";
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

const SimulateSchema = z.object({
  skill: z
    .string()
    .trim()
    .refine((val) => isKnownSkill(val), {
      message: "Skill must be in vocabulary",
    }),
  delta: z
    .number()
    .int("Delta must be an integer")
    .min(-30, "Delta must be between -30 and 30")
    .max(30, "Delta must be between -30 and 30"),
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { skill, delta } = await parseJson(req, SimulateSchema);

    const normalizedSkill = skill.trim().toLowerCase();

    try {
      // 1. Read the skill's latest trend
      const latestTrends = await db
        .select()
        .from(skillTrends)
        .where(eq(skillTrends.skill, normalizedSkill))
        .orderBy(desc(skillTrends.period))
        .limit(1);

      const oldDemandScore =
        latestTrends.length > 0 ? latestTrends[0].demandScore : 0;

      // 2. Insert new skillTrends snapshot with demandScore = clamp(old + delta, 0, 100),
      // delta = the actual change, source "simulated", period now
      const newDemandScore = clamp(oldDemandScore + delta, 0, 100);
      const actualChange = newDemandScore - oldDemandScore;
      const now = new Date();

      await db.insert(skillTrends).values({
        skill: normalizedSkill,
        demandScore: newDemandScore,
        delta: actualChange,
        source: "simulated",
        period: now,
      });

      // 3. Call replanLearner with trigger "market"
      const result = await replanLearner({
        learnerId: user.id,
        trigger: "market",
      });

      return NextResponse.json({
        skill: normalizedSkill,
        newDemandScore,
        ...result,
      });
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
