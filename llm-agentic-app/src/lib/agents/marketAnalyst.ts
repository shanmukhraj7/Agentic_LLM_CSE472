import { Profile, SkillGap } from "@/lib/contracts";
import { getRoleRequirements } from "@/lib/rag/roleSkills";
import { getLatestTrends } from "@/lib/trends/read";

function round(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export async function analyzeGaps(profile: Profile): Promise<SkillGap[]> {
  const roleRequirements = await getRoleRequirements(profile.targetRole);
  const skills = roleRequirements.map((r) => r.skill);
  const trends = await getLatestTrends(skills);

  const trendMap = new Map<string, { demandScore: number; delta: number }>();
  for (const trend of trends) {
    trendMap.set(trend.skill.trim().toLowerCase(), {
      demandScore: trend.demandScore,
      delta: trend.delta,
    });
  }

  const learnerSkillMap = new Map<string, Profile["skills"][number]["level"]>();
  for (const s of profile.skills) {
    learnerSkillMap.set(s.name.trim().toLowerCase(), s.level);
  }

  const gaps: SkillGap[] = [];

  for (const req of roleRequirements) {
    const normalizedSkill = req.skill.trim().toLowerCase();
    const currentLevel = learnerSkillMap.get(normalizedSkill) ?? "none";

    if (currentLevel !== "none" && currentLevel !== "beginner") {
      continue;
    }

    const trend = trendMap.get(normalizedSkill);
    const demandScore = trend?.demandScore ?? 0;
    const delta = trend?.delta ?? 0;

    const importance = round(0.6 * req.freq + (0.4 * demandScore) / 100, 2);

    gaps.push({
      skill: req.skill,
      importance,
      currentLevel,
      demandScore,
      delta,
    });
  }

  return gaps.sort((a, b) => b.importance - a.importance).slice(0, 10);
}
