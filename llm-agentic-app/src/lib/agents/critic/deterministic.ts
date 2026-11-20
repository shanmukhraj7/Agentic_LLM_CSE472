import { CriticIssue, Level, Plan, Profile, SkillGap } from "@/lib/contracts";

export type CourseLite = {
  id: string;
  level: Level;
  skills: string[];
  prerequisites: string[];
  durationHrs: number;
};

const LEVEL_ORDER: Record<Level, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

export function runDeterministicChecks(input: {
  plan: Plan;
  profile: Profile;
  gaps: SkillGap[];
  courses: Map<string, CourseLite>;
  completedCourseIds: Set<string>;
}): CriticIssue[] {
  const { plan, profile: _profile, gaps, courses, completedCourseIds } = input;
  void _profile;

  const issues: CriticIssue[] = [];

  // EMPTY_PLAN: no modules.
  if (plan.modules.length === 0) {
    issues.push({
      code: "EMPTY_PLAN",
      message: "Plan contains no modules. Add 1 to 12 course modules to the plan.",
    });
    return issues;
  }

  // TOO_MANY_MODULES: more than 12 modules.
  if (plan.modules.length > 12) {
    issues.push({
      code: "TOO_MANY_MODULES",
      message: `Plan contains ${plan.modules.length} modules, which exceeds the limit of 12. Remove at least ${plan.modules.length - 12} module(s) from the plan.`,
    });
  }

  // TOO_LONG: weeksTotal > 52.
  if (plan.weeksTotal > 52) {
    issues.push({
      code: "TOO_LONG",
      message: `Plan duration of ${plan.weeksTotal} weeks exceeds the maximum limit of 52 weeks. Reduce courses or select shorter alternatives to fit within 52 weeks.`,
    });
  }

  // UNKNOWN_COURSE & DUPLICATE_COURSE
  const seenCourseIds = new Set<string>();
  const reportedDuplicates = new Set<string>();
  const seenUnknownCourses = new Set<string>();

  for (const mod of plan.modules) {
    if (!courses.has(mod.courseId)) {
      if (!seenUnknownCourses.has(mod.courseId)) {
        seenUnknownCourses.add(mod.courseId);
        issues.push({
          code: "UNKNOWN_COURSE",
          courseId: mod.courseId,
          message: `Course '${mod.courseId}' is not found in the course catalog. Replace or remove course '${mod.courseId}'.`,
        });
      }
    }

    if (seenCourseIds.has(mod.courseId)) {
      if (!reportedDuplicates.has(mod.courseId)) {
        reportedDuplicates.add(mod.courseId);
        issues.push({
          code: "DUPLICATE_COURSE",
          courseId: mod.courseId,
          message: `Course '${mod.courseId}' appears more than once in the plan. Remove duplicate occurrences of course '${mod.courseId}'.`,
        });
      }
    } else {
      seenCourseIds.add(mod.courseId);
    }
  }

  // PREREQ_ORDER & PREREQ_MISSING
  // - PREREQ_ORDER: a prerequisite is in the plan but placed after the module that needs it.
  // - PREREQ_MISSING: a prerequisite is neither in the plan nor in completedCourseIds.
  const planCourseIds = new Set(plan.modules.map((m) => m.courseId));

  for (let i = 0; i < plan.modules.length; i++) {
    const currentModule = plan.modules[i];
    const course = courses.get(currentModule.courseId);
    if (!course) {
      continue;
    }

    const uniquePrereqs = new Set(course.prerequisites ?? []);
    for (const prereqId of uniquePrereqs) {
      const inPlan = planCourseIds.has(prereqId);
      if (inPlan) {
        const appearsBefore = plan.modules
          .slice(0, i)
          .some((m) => m.courseId === prereqId);
        if (!appearsBefore) {
          issues.push({
            code: "PREREQ_ORDER",
            courseId: currentModule.courseId,
            message: `Course '${currentModule.courseId}' requires prerequisite '${prereqId}', but '${prereqId}' is scheduled after it. Move course '${prereqId}' before course '${currentModule.courseId}'.`,
          });
        }
      } else {
        if (!completedCourseIds.has(prereqId)) {
          issues.push({
            code: "PREREQ_MISSING",
            courseId: currentModule.courseId,
            message: `Course '${currentModule.courseId}' requires prerequisite '${prereqId}', which is neither in the plan nor completed. Add course '${prereqId}' before course '${currentModule.courseId}'.`,
          });
        }
      }
    }
  }

  // GAP_UNCOVERED: any of the 3 highest-importance gaps whose skill is not in any module's skillsCovered nor in a completed course's skills.
  const coveredSkills = new Set<string>();

  for (const mod of plan.modules) {
    for (const skill of mod.skillsCovered ?? []) {
      if (skill) {
        coveredSkills.add(skill.trim().toLowerCase());
      }
    }
  }

  for (const completedId of completedCourseIds) {
    const completedCourse = courses.get(completedId);
    if (completedCourse && completedCourse.skills) {
      for (const skill of completedCourse.skills) {
        if (skill) {
          coveredSkills.add(skill.trim().toLowerCase());
        }
      }
    }
  }

  const topGaps = [...gaps]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3);

  const reportedGaps = new Set<string>();
  for (const gap of topGaps) {
    const normalizedSkill = gap.skill.trim().toLowerCase();
    if (!coveredSkills.has(normalizedSkill)) {
      if (!reportedGaps.has(normalizedSkill)) {
        reportedGaps.add(normalizedSkill);
        issues.push({
          code: "GAP_UNCOVERED",
          message: `High-importance skill gap '${gap.skill}' is not covered by any module or completed course. Add a course that covers '${gap.skill}'.`,
        });
      }
    }
  }

  // LEVEL_REGRESSION: for the same skill, a later module has a lower level than an earlier one (beginner < intermediate < advanced).
  const maxLevelBySkill = new Map<
    string,
    { level: Level; courseId: string }
  >();

  for (const mod of plan.modules) {
    const course = courses.get(mod.courseId);
    if (!course) {
      continue;
    }

    const currentLevelValue = LEVEL_ORDER[course.level];

    const moduleSkills = new Set<string>();
    for (const skill of mod.skillsCovered ?? []) {
      if (skill) {
        moduleSkills.add(skill.trim().toLowerCase());
      }
    }
    for (const skill of course.skills ?? []) {
      if (skill) {
        moduleSkills.add(skill.trim().toLowerCase());
      }
    }

    for (const skill of moduleSkills) {
      const prev = maxLevelBySkill.get(skill);
      if (prev) {
        const prevLevelValue = LEVEL_ORDER[prev.level];
        if (currentLevelValue < prevLevelValue) {
          issues.push({
            code: "LEVEL_REGRESSION",
            courseId: mod.courseId,
            message: `Course '${mod.courseId}' teaches skill '${skill}' at ${course.level} level, which is lower than earlier course '${prev.courseId}' (${prev.level}). Remove '${mod.courseId}' or reschedule it before '${prev.courseId}'.`,
          });
        } else if (currentLevelValue > prevLevelValue) {
          maxLevelBySkill.set(skill, {
            level: course.level,
            courseId: mod.courseId,
          });
        }
      } else {
        maxLevelBySkill.set(skill, {
          level: course.level,
          courseId: mod.courseId,
        });
      }
    }
  }

  return issues;
}
