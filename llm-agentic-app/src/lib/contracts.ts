import { z } from "zod";

export const Level = z.enum(["beginner", "intermediate", "advanced"]);
export type Level = z.infer<typeof Level>;

export const Profile = z.object({
  currentRole: z.string(),
  targetRole: z.string(),
  yearsExperience: z.number().min(0).max(40),
  skills: z.array(
    z.object({
      name: z.string(),
      level: Level,
    })
  ),
  hoursPerWeek: z.number().min(1).max(60),
  goalSummary: z.string().max(400),
});
export type Profile = z.infer<typeof Profile>;

export const SkillGap = z.object({
  skill: z.string(),
  importance: z.number().min(0).max(1),
  currentLevel: z.union([Level, z.literal("none")]),
  demandScore: z.number().min(0).max(100),
  delta: z.number(),
});
export type SkillGap = z.infer<typeof SkillGap>;

export const PlanDraftModule = z.object({
  courseId: z.string(),
  rationale: z.string().max(240),
  skillsCovered: z.array(z.string()),
  marketTag: z.enum(["high_demand", "rising"]).nullable(),
});
export type PlanDraftModule = z.infer<typeof PlanDraftModule>;

export const PlanDraft = z.object({
  summary: z.string().max(500),
  modules: z.array(PlanDraftModule).min(1).max(12),
});
export type PlanDraft = z.infer<typeof PlanDraft>;

export const PlanModule = PlanDraftModule.extend({
  order: z.number().int().min(1),
  hours: z.number(),
  startWeek: z.number().int().min(1),
  durationWeeks: z.number().int().min(1),
});
export type PlanModule = z.infer<typeof PlanModule>;

export const Plan = z.object({
  summary: z.string(),
  modules: z.array(PlanModule),
  totalHours: z.number(),
  weeksTotal: z.number(),
});
export type Plan = z.infer<typeof Plan>;

export const CriticIssueCode = z.enum([
  "EMPTY_PLAN",
  "UNKNOWN_COURSE",
  "DUPLICATE_COURSE",
  "PREREQ_ORDER",
  "PREREQ_MISSING",
  "TOO_LONG",
  "TOO_MANY_MODULES",
  "GAP_UNCOVERED",
  "LEVEL_REGRESSION",
]);
export type CriticIssueCode = z.infer<typeof CriticIssueCode>;

export const CriticIssue = z.object({
  code: CriticIssueCode,
  message: z.string(),
  courseId: z.string().optional(),
});
export type CriticIssue = z.infer<typeof CriticIssue>;

export const CriticVerdict = z.object({
  pass: z.boolean(),
  scores: z.object({
    goalAlignment: z.number().int().min(1).max(5),
    pacing: z.number().int().min(1).max(5),
    rationaleQuality: z.number().int().min(1).max(5),
    marketRelevance: z.number().int().min(1).max(5),
  }),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});
export type CriticVerdict = z.infer<typeof CriticVerdict>;

export const CriticReport = z.object({
  attempts: z.number(),
  deterministicIssues: z.array(CriticIssue),
  verdict: CriticVerdict.nullable(),
  warnings: z.array(z.string()),
  passed: z.boolean(),
});
export type CriticReport = z.infer<typeof CriticReport>;

export const ProgressType = z.enum(["completed", "quiz", "rating"]);
export type ProgressType = z.infer<typeof ProgressType>;

export const Rating = z.enum(["too_easy", "just_right", "too_hard"]);
export type Rating = z.infer<typeof Rating>;

export const ProgressEventInput = z.object({
  courseId: z.string(),
  type: ProgressType,
  score: z.number().min(0).max(100).optional(),
  rating: Rating.optional(),
});
export type ProgressEventInput = z.infer<typeof ProgressEventInput>;

export const ReplanTrigger = z.enum(["progress", "market", "cron", "manual"]);
export type ReplanTrigger = z.infer<typeof ReplanTrigger>;

export const FeedbackDecision = z.object({
  replan: z.boolean(),
  reason: z.string().max(300),
  signals: z.array(z.string()),
  instructions: z.string(),
});
export type FeedbackDecision = z.infer<typeof FeedbackDecision>;

export const PlanDiff = z.object({
  added: z.array(
    z.object({
      courseId: z.string(),
      rationale: z.string(),
    })
  ),
  removed: z.array(
    z.object({
      courseId: z.string(),
    })
  ),
  moved: z.array(
    z.object({
      courseId: z.string(),
      fromOrder: z.number(),
      toOrder: z.number(),
    })
  ),
  unchangedCount: z.number(),
});
export type PlanDiff = z.infer<typeof PlanDiff>;
