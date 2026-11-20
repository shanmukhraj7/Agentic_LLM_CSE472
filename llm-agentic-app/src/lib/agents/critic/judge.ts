import { generateObject } from "ai";
import { CriticVerdict, Plan, Profile, SkillGap } from "@/lib/contracts";
import { runWithFallback } from "@/lib/llm/call";
import { MAX_OUTPUT_TOKENS } from "@/lib/llm/limits";
import { PLANNER_MODEL } from "@/lib/llm/models";

export interface JudgePlanInput {
  profile: Profile;
  gaps: SkillGap[];
  plan: Plan;
  courseTitles: Map<string, string>;
}

export async function judgePlan(input: {
  profile: Profile;
  gaps: SkillGap[];
  plan: Plan;
  courseTitles: Map<string, string>;
}): Promise<CriticVerdict> {
  const { profile, gaps, plan, courseTitles } = input;

  const hoursPerWeek = profile.hoursPerWeek;
  const totalHours = plan.totalHours;
  const weeksTotal = plan.weeksTotal;

  const modulesDescription = plan.modules
    .map((planModule) => {
      const title = courseTitles.get(planModule.courseId) ?? planModule.courseId;
      return `Module ${planModule.order}:
  - Course ID: ${planModule.courseId}
  - Title: ${title}
  - Duration: ${planModule.hours} hours across ${planModule.durationWeeks} weeks (Starts Week ${planModule.startWeek})
  - Skills Covered: ${planModule.skillsCovered.join(", ") || "None specified"}
  - Market Tag: ${planModule.marketTag ?? "none"}
  - Rationale: ${planModule.rationale}`;
    })
    .join("\n\n");

  const skillsList = profile.skills
    .map((s) => `- ${s.name} (${s.level})`)
    .join("\n");

  const sortedGaps = [...gaps].sort((a, b) => b.importance - a.importance);
  const gapsList = sortedGaps
    .map(
      (g, index) =>
        `- [Rank ${index + 1}] ${g.skill} (importance: ${g.importance}, current level: ${g.currentLevel}, demand score: ${g.demandScore}, delta: ${g.delta})`
    )
    .join("\n");

  const system = `You are an expert curriculum evaluator and critic.
Your role is to evaluate a proposed personalized learning plan against a learner's profile, target role, skill gaps, and time commitment.
Score the plan from 1 to 5 across four key dimensions based on the evaluation rubric, and identify concrete issues and actionable suggestions.`;

  const prompt = `Evaluate the following learning plan according to the scoring rubric.

## Facts
- hoursPerWeek: ${hoursPerWeek}
- totalHours: ${totalHours}
- weeksTotal: ${weeksTotal}

## Learner Profile
- Current Role: ${profile.currentRole}
- Target Role: ${profile.targetRole}
- Years of Experience: ${profile.yearsExperience}
- Available Study Time: ${hoursPerWeek} hours/week
- Goal Summary: ${profile.goalSummary}
- Current Skills:
${skillsList || "- None specified"}

## Target Skill Gaps
${gapsList || "- None specified"}

## Proposed Learning Plan
- Summary: ${plan.summary}
- Total Study Hours: ${totalHours} hours
- Total Duration: ${weeksTotal} weeks
- Modules:
${modulesDescription || "No modules in plan."}

## Evaluation Rubric
Score each of the following dimensions on an integer scale from 1 to 5 (1 = very poor, 3 = acceptable, 5 = excellent):

Evaluation Rules:
- Pacing is judged ONLY on whether totalHours and weeksTotal are realistic for hoursPerWeek. Modules may share a week by design and the weekly workload never exceeds hoursPerWeek; never penalise overlapping week ranges and never compute weekly load yourself.
- Judge coverage against the top 5 gaps only; ignore lower-ranked gaps.
- The plan can contain only courses from the catalogue. Do not ask for capstones, projects, portfolios or any course not already in the plan; every issue and suggestion must be fixable by swapping, adding, removing or reordering catalogue courses.
- marketTag values are computed from data. Do not comment on tags.
- Report at most 3 issues and at most 3 suggestions.

1. goalAlignment (1-5):
   How effectively does the curriculum bridge the identified skill gaps and guide the learner toward their target role of "${profile.targetRole}"?
   Judge coverage against the top 5 gaps only; ignore lower-ranked gaps.
   - 1: Fails to align with target role or omits vital skill gaps among the top 5 gaps.
   - 3: Moderately aligned; addresses key skill gaps among the top 5 gaps.
   - 5: Highly targeted; systematically closes the top 5 skill gaps for the target role.

2. pacing (1-5):
   Pacing is judged ONLY on whether totalHours and weeksTotal are realistic for hoursPerWeek. Modules may share a week by design and the weekly workload never exceeds hoursPerWeek; never penalise overlapping week ranges and never compute weekly load yourself.
   - 1: Unrealistic workload; totalHours and weeksTotal are not realistic for ${hoursPerWeek} hours/week.
   - 3: Feasible; totalHours and weeksTotal are reasonable for ${hoursPerWeek} hours/week.
   - 5: Exceptionally well-paced; totalHours and weeksTotal are realistic, balanced, and sustainable for ${hoursPerWeek} hours/week.

3. rationaleQuality (1-5):
   How clear, specific, and tailored are the rationales for each module?
   - 1: Generic boilerplate or absent justifications.
   - 3: Basic justifications explaining what the course covers without deep personalization.
   - 5: Compelling, personalized rationales explaining exactly how each course advances the learner's specific career trajectory.

4. marketRelevance (1-5):
   How well does the plan emphasize high-demand skills, current technologies, and rising market trends?
   Note: marketTag values are computed from data. Do not comment on tags.
   - 1: Focuses on obsolete or low-demand technologies.
   - 3: Standard market relevance with average industry demand.
   - 5: Strongly aligned with cutting-edge industry demands, high-demand skills, and rising trends.

## Issues and Suggestions
- The plan can contain only courses from the catalogue. Do not ask for capstones, projects, portfolios or any course not already in the plan; every issue and suggestion must be fixable by swapping, adding, removing or reordering catalogue courses.
- marketTag values are computed from data. Do not comment on tags.
- Report at most 3 issues and at most 3 suggestions.
- issues: List concrete problems, deficiencies, or risks identified in the plan (at most 3 issues; empty array if none).
- suggestions: List actionable, practical recommendations to improve the plan (at most 3 suggestions; empty array if none).`;

  const { object } = await runWithFallback(
    (model, signal) =>
      generateObject({
        model,
        schema: CriticVerdict,
        temperature: 0,
        system,
        prompt,
        maxRetries: 0,
        abortSignal: signal,
        maxOutputTokens: MAX_OUTPUT_TOKENS.judge,
        providerOptions: {
          groq: {
            reasoningEffort: "low",
          },
        },
      }),
    { primary: PLANNER_MODEL }
  );

  const verdict = object;
  verdict.issues = verdict.issues.slice(0, 3);
  verdict.suggestions = verdict.suggestions.slice(0, 3);
  verdict.pass =
    verdict.scores.goalAlignment >= 3 &&
    verdict.scores.pacing >= 3 &&
    verdict.scores.rationaleQuality >= 3 &&
    verdict.scores.marketRelevance >= 3;

  return verdict;
}
