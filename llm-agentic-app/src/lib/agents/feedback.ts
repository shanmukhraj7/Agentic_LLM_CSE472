import { generateObject } from "ai";
import {
  FeedbackDecision,
  Plan,
  Profile,
  ReplanTrigger,
} from "@/lib/contracts";
import { runWithFallback } from "@/lib/llm/call";
import {
  capList,
  MAX_EVENTS_IN_PROMPT,
  MAX_OUTPUT_TOKENS,
} from "@/lib/llm/limits";
import { PLANNER_MODEL } from "@/lib/llm/models";

export interface ProgressEventSummary {
  courseId: string;
  type: string;
  score: number | null;
  rating: string | null;
  createdAt: Date;
}

export interface MarketChangeSummary {
  skill: string;
  delta: number;
}

export interface ShouldConsiderReplanInput {
  trigger: ReplanTrigger;
  eventsSincePlan: ProgressEventSummary[];
  marketChangesInPlan: MarketChangeSummary[];
  daysSincePlan: number;
}

export function shouldConsiderReplan(input: ShouldConsiderReplanInput): {
  consider: boolean;
  signals: string[];
} {
  const signals: string[] = [];

  switch (input.trigger) {
    case "manual": {
      return {
        consider: true,
        signals: ["Manual replan requested by learner"],
      };
    }

    case "progress": {
      for (const event of input.eventsSincePlan) {
        if (event.type === "quiz" && event.score !== null && event.score < 60) {
          signals.push(
            `Quiz score below 60 (${event.score}) in course ${event.courseId}`
          );
        }
        if (
          event.type === "rating" &&
          (event.rating === "too_hard" || event.rating === "too_easy")
        ) {
          signals.push(`Course ${event.courseId} rated "${event.rating}"`);
        }
      }

      const completedCount = input.eventsSincePlan.filter(
        (e) => e.type === "completed"
      ).length;
      if (completedCount >= 2) {
        signals.push(
          `${completedCount} courses completed since the last plan`
        );
      }

      return {
        consider: signals.length > 0,
        signals,
      };
    }

    case "market": {
      for (const change of input.marketChangesInPlan) {
        if (Math.abs(change.delta) >= 10) {
          signals.push(
            `Significant market demand shift for skill "${change.skill}" (delta: ${change.delta >= 0 ? "+" : ""}${change.delta})`
          );
        }
      }

      return {
        consider: signals.length > 0,
        signals,
      };
    }

    case "cron": {
      for (const change of input.marketChangesInPlan) {
        if (Math.abs(change.delta) >= 10) {
          signals.push(
            `Significant market demand shift for skill "${change.skill}" (delta: ${change.delta >= 0 ? "+" : ""}${change.delta})`
          );
        }
      }

      if (input.daysSincePlan >= 7 && input.eventsSincePlan.length === 0) {
        signals.push(
          `Inactivity: ${input.daysSincePlan} days since the last plan with no progress events`
        );
      }

      return {
        consider: signals.length > 0,
        signals,
      };
    }

    default:
      return {
        consider: false,
        signals: [],
      };
  }
}

export interface DecideReplanInput {
  profile: Profile;
  plan: Plan;
  courseTitles: Map<string, string>;
  trigger: ReplanTrigger;
  eventsSincePlan: ProgressEventSummary[];
  marketChangesInPlan: MarketChangeSummary[];
  daysSincePlan: number;
}

export async function decideReplan(
  input: DecideReplanInput
): Promise<FeedbackDecision> {
  const { consider, signals } = shouldConsiderReplan({
    trigger: input.trigger,
    eventsSincePlan: input.eventsSincePlan,
    marketChangesInPlan: input.marketChangesInPlan,
    daysSincePlan: input.daysSincePlan,
  });

  if (!consider) {
    return {
      replan: false,
      reason: "No meaningful change since the last plan",
      signals: [],
      instructions: "",
    };
  }

  const { profile, plan, courseTitles } = input;

  const skillsList = profile.skills
    .map((s) => `${s.name} (${s.level})`)
    .join(", ");

  const modulesDescription = plan.modules
    .map((m) => {
      const title = courseTitles.get(m.courseId) ?? m.courseId;
      return `Module ${m.order}:
  - Course ID: ${m.courseId}
  - Title: ${title}
  - Duration: ${m.hours} hours across ${m.durationWeeks} weeks (Starts Week ${m.startWeek})
  - Skills Covered: ${m.skillsCovered.join(", ") || "None"}
  - Market Tag: ${m.marketTag ?? "none"}
  - Rationale: ${m.rationale}`;
    })
    .join("\n\n");

  const promptEvents = capList(
    [...input.eventsSincePlan].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    MAX_EVENTS_IN_PROMPT
  );

  const eventsDescription =
    promptEvents.length > 0
      ? promptEvents
          .map((e) => {
            const title = courseTitles.get(e.courseId) ?? e.courseId;
            const extra: string[] = [];
            if (e.score !== null) extra.push(`score: ${e.score}`);
            if (e.rating) extra.push(`rating: ${e.rating}`);
            const extraStr = extra.length > 0 ? ` (${extra.join(", ")})` : "";
            return `- [${e.type.toUpperCase()}] "${title}" (ID: ${e.courseId})${extraStr}`;
          })
          .join("\n")
      : "None";

  const marketDescription =
    input.marketChangesInPlan.length > 0
      ? input.marketChangesInPlan
          .map(
            (m) =>
              `- Skill "${m.skill}": delta ${m.delta >= 0 ? "+" : ""}${m.delta}`
          )
          .join("\n")
      : "None";

  const systemPrompt = `You are an expert curriculum feedback agent.
Analyze the learner's current learning plan, recent progress events, and market changes to determine whether a replan is warranted.
Requirements:
- "replan": boolean indicating whether to generate a new plan.
- "reason": concise explanation for the decision (at most 300 characters).
- "signals": list of notable signals or observations that influenced the decision.
- "instructions": if replanning, provide concrete, actionable guidance for the Planner on what courses/skills to add, drop, or reorder and why. If not replanning, keep this empty.`;

  const prompt = `Evaluate whether to replan the curriculum.

## Trigger & Context
- Trigger: ${input.trigger}
- Days Since Last Plan: ${input.daysSincePlan}
- Detected Heuristic Signals:
${signals.map((s) => `- ${s}`).join("\n")}

## Learner Profile
- Current Role: ${profile.currentRole}
- Target Role: ${profile.targetRole}
- Years Experience: ${profile.yearsExperience}
- Available Hours Per Week: ${profile.hoursPerWeek}
- Goal Summary: ${profile.goalSummary}
- Current Skills: ${skillsList || "None"}

## Current Plan Modules
${modulesDescription || "No modules"}

## Events Since Last Plan
${eventsDescription}

## Market Changes for Skills in Plan
${marketDescription}`;

  const { object } = await runWithFallback(
    (model, signal) =>
      generateObject({
        model,
        schema: FeedbackDecision,
        system: systemPrompt,
        prompt,
        maxRetries: 0,
        abortSignal: signal,
        maxOutputTokens: MAX_OUTPUT_TOKENS.feedback,
        providerOptions: {
          groq: {
            reasoningEffort: "low",
          },
        },
      }),
    { primary: PLANNER_MODEL }
  );

  return {
    ...object,
    replan: input.trigger === "manual" ? true : object.replan,
  };
}
