import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { handleRoute, parseJson, jsonError } from "@/lib/http";
import { ensureLearner } from "@/lib/learners";
import { Profile } from "@/lib/contracts";
import { embedDocuments } from "@/lib/llm/embed";
import { db } from "@/lib/db/client";
import { learners } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser();
    await ensureLearner(user.id);

    const profile = await parseJson(req, Profile);

    const { targetRole, currentRole, skills, goalSummary, hoursPerWeek } = profile;
    const skillNames = skills.map((s) => s.name).join(", ");
    const embeddingText = `${targetRole}. Current role: ${currentRole}. Skills: ${skillNames}. Goal: ${goalSummary}`;

    const [profileEmbedding] = await embedDocuments([embeddingText]);

    if (!profileEmbedding) {
      return jsonError(500, "INTERNAL", "Failed to generate embedding");
    }

    await db
      .update(learners)
      .set({
        goal: goalSummary,
        hoursPerWeek,
        profileJson: profile,
        profileEmbedding,
      })
      .where(eq(learners.id, user.id));

    return NextResponse.json({ ok: true });
  });
}
