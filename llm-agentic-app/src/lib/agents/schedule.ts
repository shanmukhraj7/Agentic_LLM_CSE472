import { Plan, PlanDraft, PlanModule } from "@/lib/contracts";

export function assignSchedule(
  draft: PlanDraft,
  hoursByCourseId: Map<string, number>,
  hoursPerWeek: number
): Plan {
  let cumBefore = 0;
  let totalHours = 0;

  const modules: PlanModule[] = draft.modules.map((module, index) => {
    const hours = hoursByCourseId.get(module.courseId) ?? 0;
    const cumAfter = cumBefore + hours;
    const startWeek = Math.floor(cumBefore / hoursPerWeek) + 1;
    const endWeek = Math.max(startWeek, Math.ceil(cumAfter / hoursPerWeek));
    const durationWeeks = endWeek - startWeek + 1;

    cumBefore = cumAfter;
    totalHours += hours;

    return {
      ...module,
      order: index + 1,
      hours,
      startWeek,
      durationWeeks,
    };
  });

  const weeksTotal = Math.max(1, Math.ceil(totalHours / hoursPerWeek));

  return {
    summary: draft.summary,
    modules,
    totalHours,
    weeksTotal,
  };
}
