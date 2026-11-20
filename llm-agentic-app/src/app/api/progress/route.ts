import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { ProgressEventInput } from "@/lib/contracts";
import { handleRoute, parseJson, jsonError } from "@/lib/http";
import { getLatestPlan } from "@/lib/services/plans";
import { recordProgress } from "@/lib/services/progress";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser();
    const input = await parseJson(req, ProgressEventInput);

    if (
      input.type === "quiz" &&
      (typeof input.score !== "number" || Number.isNaN(input.score))
    ) {
      return jsonError(400, "BAD_REQUEST", 'Score is required for type "quiz"');
    }

    if (input.type === "rating" && !input.rating) {
      return jsonError(400, "BAD_REQUEST", 'Rating is required for type "rating"');
    }

    const latestPlan = await getLatestPlan(user.id);
    if (!latestPlan) {
      return jsonError(400, "BAD_REQUEST", "Course is not in learner's latest plan");
    }

    const courseInPlan = latestPlan.plan.modules?.some(
      (mod) => mod.courseId === input.courseId
    );

    if (!courseInPlan) {
      return jsonError(400, "BAD_REQUEST", "Course is not in learner's latest plan");
    }

    await recordProgress(user.id, input);

    return NextResponse.json({ ok: true });
  });
}
