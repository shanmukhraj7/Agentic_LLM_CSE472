import {
  CriticIssue,
  CriticReport,
  CriticVerdict,
  Plan,
  PlanDraft,
  Profile,
  SkillGap,
} from "@/lib/contracts";
import { analyzeGaps } from "@/lib/agents/marketAnalyst";
import { generatePlanDraft } from "@/lib/agents/planner";
import { assignSchedule } from "@/lib/agents/schedule";
import {
  CourseLite,
  runDeterministicChecks,
} from "@/lib/agents/critic/deterministic";
import { judgePlan } from "@/lib/agents/critic/judge";
import { Course, getCoursesByIds } from "@/lib/rag/searchCourses";

export type StatusStage =
  | "analyzing_gaps"
  | "retrieving_courses"
  | "drafting_plan"
  | "validating"
  | "revising"
  | "done";

interface AttemptRecord {
  attempt: number;
  plan: Plan;
  draft: PlanDraft;
  deterministicIssues: CriticIssue[];
  verdict: CriticVerdict | null;
}

export async function createPlan(
  input: {
    learnerId: string;
    profile: Profile;
    completedCourseIds?: string[];
    feedback?: string[];
  },
  onStatus?: (stage: StatusStage) => void
): Promise<{ plan: Plan; criticReport: CriticReport; gaps: SkillGap[] }> {
  onStatus?.("analyzing_gaps");
  const gaps = await analyzeGaps(input.profile);

  const maxAttempts = 3;
  let currentFeedback = input.feedback ? [...input.feedback] : undefined;

  let bestAttempt: AttemptRecord | null = null;
  const allKnownDbCourses = new Map<string, Course>();
  let attemptsRan = 0;
  let passed = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsRan = attempt;

    if (attempt === 1) {
      onStatus?.("drafting_plan");
    } else {
      onStatus?.("revising");
    }

    const { draft } = await generatePlanDraft({
      learnerId: input.learnerId,
      profile: input.profile,
      gaps,
      completedCourseIds: input.completedCourseIds,
      feedback:
        currentFeedback && currentFeedback.length > 0
          ? currentFeedback
          : undefined,
    });

    onStatus?.("retrieving_courses");
    const draftCourseIds = draft.modules.map((m) => m.courseId);
    const dbCourses = await getCoursesByIds(draftCourseIds);

    const coursesMap = new Map<string, CourseLite>();
    const hoursByCourseId = new Map<string, number>();
    const courseTitles = new Map<string, string>();

    for (const course of dbCourses) {
      allKnownDbCourses.set(course.id, course);
      coursesMap.set(course.id, {
        id: course.id,
        level: course.level,
        skills: course.skills,
        prerequisites: course.prerequisites ?? [],
        durationHrs: course.durationHrs,
      });
      hoursByCourseId.set(course.id, course.durationHrs);
      courseTitles.set(course.id, course.title);
    }

    const plan = assignSchedule(
      draft,
      hoursByCourseId,
      input.profile.hoursPerWeek
    );

    onStatus?.("validating");
    const deterministicIssues = runDeterministicChecks({
      plan,
      profile: input.profile,
      gaps,
      courses: coursesMap,
      completedCourseIds: new Set(input.completedCourseIds ?? []),
    });

    const record: AttemptRecord = {
      attempt,
      plan,
      draft,
      deterministicIssues,
      verdict: null,
    };

    if (deterministicIssues.length > 0) {
      if (
        bestAttempt === null ||
        record.deterministicIssues.length <=
          bestAttempt.deterministicIssues.length
      ) {
        bestAttempt = record;
      }
      currentFeedback = deterministicIssues.map((issue) => issue.message);
      continue;
    }

    const verdict = await judgePlan({
      profile: input.profile,
      gaps,
      plan,
      courseTitles,
    });

    record.verdict = verdict;

    if (
      bestAttempt === null ||
      record.deterministicIssues.length <=
        bestAttempt.deterministicIssues.length
    ) {
      bestAttempt = record;
    }

    if (verdict.pass) {
      passed = true;
      bestAttempt = record;
      break;
    } else {
      currentFeedback = [...verdict.issues, ...verdict.suggestions];
    }
  }

  if (!bestAttempt) {
    throw new Error("Failed to generate any plan attempt");
  }

  const warnings = passed
    ? (bestAttempt.verdict?.issues ?? [])
    : Array.from(
        new Set([
          ...bestAttempt.deterministicIssues.map((i) => i.message),
          ...(bestAttempt.verdict?.issues ?? []),
        ])
      );

  const criticReport: CriticReport = {
    attempts: attemptsRan,
    deterministicIssues: bestAttempt.deterministicIssues,
    verdict: bestAttempt.verdict,
    warnings,
    passed,
  };

  const validModules = bestAttempt.plan.modules.filter((m) =>
    allKnownDbCourses.has(m.courseId)
  );

  const cleanedDraft: PlanDraft = {
    summary: bestAttempt.plan.summary,
    modules: validModules.map((m) => ({
      courseId: m.courseId,
      rationale: m.rationale,
      skillsCovered: m.skillsCovered,
      marketTag: m.marketTag,
    })),
  };

  const finalHoursMap = new Map<string, number>();
  for (const [id, c] of allKnownDbCourses.entries()) {
    finalHoursMap.set(id, c.durationHrs);
  }

  const finalPlan = assignSchedule(
    cleanedDraft,
    finalHoursMap,
    input.profile.hoursPerWeek
  );

  onStatus?.("done");

  return {
    plan: Plan.parse(finalPlan),
    criticReport: CriticReport.parse(criticReport),
    gaps,
  };
}
