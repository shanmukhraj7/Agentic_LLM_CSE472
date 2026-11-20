import { db } from "@/lib/db/client";
import { skillTrends } from "@/lib/db/schema";
import { desc, inArray } from "drizzle-orm";

export async function getLatestTrends(
  skills?: string[]
): Promise<{ skill: string; demandScore: number; delta: number; period: Date }[]> {
  if (skills && skills.length === 0) {
    return [];
  }

  const query = db
    .selectDistinctOn([skillTrends.skill], {
      skill: skillTrends.skill,
      demandScore: skillTrends.demandScore,
      delta: skillTrends.delta,
      period: skillTrends.period,
    })
    .from(skillTrends);

  if (skills && skills.length > 0) {
    return await query
      .where(inArray(skillTrends.skill, skills))
      .orderBy(skillTrends.skill, desc(skillTrends.period));
  }

  return await query.orderBy(skillTrends.skill, desc(skillTrends.period));
}
