import { asc, cosineDistance, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { jobPostings } from "@/lib/db/schema";
import { embedQuery } from "@/lib/llm/embed";

export interface RoleSkillRequirement {
  skill: string;
  freq: number;
}

export async function getRoleRequirements(
  targetRole: string
): Promise<{ skill: string; freq: number }[]> {
  const trimmedRole = targetRole?.trim();
  if (!trimmedRole) {
    return [];
  }

  const queryVector = await embedQuery(`${trimmedRole} job requirements`);
  const distance = cosineDistance(jobPostings.embedding, queryVector);

  const rows = await db
    .select({
      role: jobPostings.role,
      skills: jobPostings.skills,
    })
    .from(jobPostings)
    .where(isNotNull(jobPostings.embedding))
    .orderBy(asc(distance))
    .limit(40);

  const roleCounts = new Map<string, number>();
  for (const row of rows.slice(0, 10)) {
    if (row.role) {
      roleCounts.set(row.role, (roleCounts.get(row.role) ?? 0) + 1);
    }
  }

  let dominantRole: string | null = null;
  let maxRoleCount = 0;
  for (const [role, count] of roleCounts.entries()) {
    if (count > maxRoleCount) {
      maxRoleCount = count;
      dominantRole = role;
    }
  }

  const filtered = dominantRole
    ? rows.filter((row) => row.role === dominantRole).slice(0, 25)
    : [];

  const postingsToUse = filtered.length >= 5 ? filtered : rows.slice(0, 25);

  if (postingsToUse.length === 0) {
    return [];
  }

  const counts = new Map<string, number>();

  for (const row of postingsToUse) {
    if (!row.skills || !Array.isArray(row.skills)) {
      continue;
    }

    const uniqueSkills = new Set(
      row.skills
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );

    for (const skill of uniqueSkills) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([skill, count]) => ({
      skill,
      freq: count / postingsToUse.length,
    }))
    .sort((a, b) => b.freq - a.freq || a.skill.localeCompare(b.skill))
    .slice(0, 15);
}
