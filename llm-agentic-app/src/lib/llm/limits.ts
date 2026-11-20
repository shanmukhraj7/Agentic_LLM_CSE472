export const MAX_OUTPUT_TOKENS = {
  profiler: 2500,
  planner: 2000,
  judge: 2000,
  feedback: 1500,
} as const;

export const MAX_CANDIDATES = 30;
export const MAX_EVENTS_IN_PROMPT = 30;
export const MAX_PROFILE_SKILLS = 25;

export function capList<T>(items: T[], max: number): T[] {
  if (max <= 0) return [];
  return items.slice(0, max);
}

export function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}
