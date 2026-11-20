export function computeSkillTrends(
  jobs: { skills: string[] }[]
): { skill: string; demandScore: number; delta: number }[] {
  if (jobs.length === 0) {
    return [];
  }

  const counts = new Map<string, number>();

  for (const job of jobs) {
    const uniqueSkills = new Set(job.skills);
    for (const skill of uniqueSkills) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return [];
  }

  let maxCount = 0;
  for (const count of counts.values()) {
    if (count > maxCount) {
      maxCount = count;
    }
  }

  if (maxCount === 0) {
    return [];
  }

  const results: { skill: string; demandScore: number; delta: number }[] = [];
  for (const [skill, count] of counts) {
    results.push({
      skill,
      demandScore: Math.round((100 * count) / maxCount),
      delta: 0,
    });
  }

  return results;
}
