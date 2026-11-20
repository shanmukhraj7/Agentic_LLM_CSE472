import skillsData from "../../../data/skills.json";

export const SKILL_VOCAB: ReadonlySet<string> = new Set<string>(skillsData);

export function isKnownSkill(name: string): boolean {
  return SKILL_VOCAB.has(name.trim().toLowerCase());
}

export function filterKnownSkills(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawName of names) {
    const normalized = rawName.trim().toLowerCase();
    if (isKnownSkill(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}
