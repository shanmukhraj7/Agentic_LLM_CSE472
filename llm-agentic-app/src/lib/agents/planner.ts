import { generateObject } from "ai";
import { Level, PlanDraft, Profile, SkillGap } from "@/lib/contracts";
import { runWithFallback } from "@/lib/llm/call";
import {
  getCoursesByIds,
  searchCourses,
  type CourseHit,
} from "@/lib/rag/searchCourses";

function getLevelsForGap(currentLevel: SkillGap["currentLevel"]): Level[] {
  switch (currentLevel) {
    case "none":
      return ["beginner"];
    case "beginner":
      return ["beginner", "intermediate"];
    case "intermediate":
      return ["intermediate", "advanced"];
    default:
      return ["advanced"];
  }
}

export async function generatePlanDraft(input: {
  learnerId: string;
  profile: Profile;
  gaps: SkillGap[];
  completedCourseIds?: string[];
  feedback?: string[];
}): Promise<{ draft: PlanDraft; candidates: Map<string, CourseHit> }> {
  const topGaps = [...input.gaps]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);

  const candidates = new Map<string, CourseHit>();

  for (const gap of topGaps) {
    const levels = getLevelsForGap(gap.currentLevel);
    const hits = await searchCourses({
      query: gap.skill,
      limit: 6,
      levels,
    });
    for (const hit of hits) {
      const existing = candidates.get(hit.id);
      if (!existing || hit.score > existing.score) {
        candidates.set(hit.id, hit);
      }
    }
  }

  const completedSet = new Set(input.completedCourseIds ?? []);
  for (const id of completedSet) {
    candidates.delete(id);
  }

  const checkedPrereqIds = new Set<string>();
  while (true) {
    const missingPrereqIds = new Set<string>();
    for (const course of candidates.values()) {
      for (const prereqId of course.prerequisites ?? []) {
        if (
          !candidates.has(prereqId) &&
          !completedSet.has(prereqId) &&
          !checkedPrereqIds.has(prereqId)
        ) {
          missingPrereqIds.add(prereqId);
        }
      }
    }

    if (missingPrereqIds.size === 0) {
      break;
    }

    for (const id of missingPrereqIds) {
      checkedPrereqIds.add(id);
    }

    const fetchedCourses = await getCoursesByIds(Array.from(missingPrereqIds));
    for (const course of fetchedCourses) {
      candidates.set(course.id, {
        ...course,
        score: 0,
      });
    }
  }

  const sortedCandidates = Array.from(candidates.values()).sort(
    (a, b) => b.score - a.score
  );

  const keptIds = new Set<string>();

  function getPrereqClosure(
    courseId: string,
    visited = new Set<string>()
  ): Set<string> {
    if (visited.has(courseId)) return visited;
    visited.add(courseId);
    const course = candidates.get(courseId);
    if (course?.prerequisites) {
      for (const prereqId of course.prerequisites) {
        if (candidates.has(prereqId)) {
          getPrereqClosure(prereqId, visited);
        }
      }
    }
    return visited;
  }

  for (const course of sortedCandidates) {
    if (keptIds.has(course.id)) continue;
    const closure = getPrereqClosure(course.id);
    const neededToAdd = Array.from(closure).filter((id) => !keptIds.has(id));
    if (keptIds.size + neededToAdd.length <= 24) {
      for (const id of neededToAdd) {
        keptIds.add(id);
      }
    }
  }

  const finalCandidates = new Map<string, CourseHit>();
  for (const course of sortedCandidates) {
    if (keptIds.has(course.id)) {
      finalCandidates.set(course.id, course);
    }
  }

  const LEVEL_ORDER: Record<Level, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  };

  const sortedFinalCandidates = Array.from(finalCandidates.values()).sort((a, b) => {
    const diff = (LEVEL_ORDER[a.level] ?? 1) - (LEVEL_ORDER[b.level] ?? 1);
    if (diff !== 0) return diff;
    return b.score - a.score;
  });

  const candidateLines = sortedFinalCandidates.map((c) => {
    const prereqs =
      c.prerequisites && c.prerequisites.length > 0
        ? c.prerequisites.join(", ")
        : "none";
    return `${c.id} | ${c.title} | ${c.level} | ${c.durationHrs} | ${c.skills.join(", ")} | ${prereqs}`;
  });

  const stage2System =
    "You are an expert curriculum planner. Create a structured PlanDraft learning plan based on the learner profile, skill gaps, and candidate courses list.";

  let stage2Prompt = `Learner Profile:
${JSON.stringify(input.profile, null, 2)}

Skill Gaps:
${JSON.stringify(input.gaps, null, 2)}

Candidate Courses (id | title | level | hours | skills | prereq ids):
${candidateLines.join("\n")}
`;

  if (input.completedCourseIds && input.completedCourseIds.length > 0) {
    stage2Prompt += `\nCompleted Course IDs:\n${JSON.stringify(input.completedCourseIds, null, 2)}\n`;
  }

  stage2Prompt += `\nRules:
- use ONLY candidate ids
- You MUST cover all top skill gaps (especially the top 3-5 gaps with highest importance). Ensure every high-importance skill gap is covered by at least one course's skillsCovered.
- Include intermediate candidate courses needed to reach the target role, scheduling all beginner courses strictly before any intermediate courses, and all intermediate before advanced. NEVER schedule a beginner course after an intermediate course.
- Prerequisites must always appear earlier in the plan than the course that requires them.
- skip completedCourseIds
- rationale ties each course to this learner's goal in under 240 chars
- each rationale must mention the learner's current role or one of their existing skills and say how this course builds on it
- do not include two courses that cover the same primary skill at the same level; pick the better one
- the summary must not mention weeks, hours or durations, and every marketTag must be null
`;

  if (input.feedback && input.feedback.length > 0) {
    stage2Prompt += `\nCRITICAL FIXES REQUIRED from previous attempt:\n${input.feedback
      .map((f) => `- ${f}`)
      .join("\n")}\nFollow these fixes strictly.\n`;
  }

  const { object: draft } = await runWithFallback((model, signal) =>
    generateObject({
      model,
      schema: PlanDraft,
      system: stage2System,
      prompt: stage2Prompt,
      maxOutputTokens: 1200,
      providerOptions: {
        groq: {
          reasoningEffort: "low",
        },
      },
      maxRetries: 0,
      abortSignal: signal,
    })
  );

  for (const mod of draft.modules) {
    const coveredSkills = new Set(
      mod.skillsCovered.map((s) => s.trim().toLowerCase())
    );
    const matchingGaps = input.gaps.filter(
      (gap) =>
        coveredSkills.has(gap.skill.trim().toLowerCase()) ||
        mod.skillsCovered.includes(gap.skill)
    );

    if (matchingGaps.some((gap) => gap.demandScore >= 70)) {
      mod.marketTag = "high_demand";
    } else if (matchingGaps.some((gap) => gap.delta >= 5)) {
      mod.marketTag = "rising";
    } else {
      mod.marketTag = null;
    }
  }

  return {
    draft,
    candidates: finalCandidates,
  };
}
