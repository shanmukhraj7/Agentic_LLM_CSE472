import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learners, replanLog } from "@/lib/db/schema";
import {
  Profile,
  Plan,
  ReplanTrigger,
} from "@/lib/contracts";
import { getLearner } from "@/lib/learners";
import { getLatestPlan, savePlan } from "@/lib/services/plans";
import {
  getProgressEvents,
  getCompletedCourseIds,
} from "@/lib/services/progress";
import { getLatestTrends } from "@/lib/trends/read";
import { getCoursesByIds } from "@/lib/rag/searchCourses";
import {
  decideReplan,
  type ProgressEventSummary,
  type MarketChangeSummary,
} from "@/lib/agents/feedback";
import { createPlan, type StatusStage } from "@/lib/agents/orchestrate";
import { diffPlans } from "@/lib/services/diff";
import { RateLimitError } from "@/lib/errors";

export { RateLimitError } from "@/lib/errors";

export class ProfileMissingError extends Error {
  code = "PROFILE_MISSING";
  constructor(message = "Learner profile not found") {
    super(message);
    this.name = "ProfileMissingError";
    Object.setPrototypeOf(this, ProfileMissingError.prototype);
  }
}

export class NoPlanError extends Error {
  code = "NO_PLAN";
  constructor(message = "No plan found for learner") {
    super(message);
    this.name = "NoPlanError";
    Object.setPrototypeOf(this, NoPlanError.prototype);
  }
}

export interface ReplanLearnerInput {
  learnerId: string;
  trigger: ReplanTrigger;
  onStatus?: (stage: StatusStage) => void;
}

export interface ReplanLearnerResult {
  replanned: boolean;
  reason: string;
  planId?: string;
  version?: number;
  passed?: boolean;
}

export async function replanLearner(
  input: ReplanLearnerInput
): Promise<ReplanLearnerResult> {
  const learner = await getLearner(input.learnerId);
  if (!learner || !learner.profileJson) {
    throw new ProfileMissingError();
  }

  const parsedProfile = Profile.safeParse(learner.profileJson);
  if (!parsedProfile.success) {
    throw new ProfileMissingError("Invalid learner profile");
  }
  const profile = parsedProfile.data;

  const latestPlanRecord = await getLatestPlan(input.learnerId);
  if (!latestPlanRecord) {
    throw new NoPlanError();
  }

  const planCreatedAt = new Date(latestPlanRecord.createdAt);

  if (
    (input.trigger === "manual" || input.trigger === "progress") &&
    Date.now() - planCreatedAt.getTime() < 30_000
  ) {
    throw new RateLimitError();
  }

  const allProgressEvents = await getProgressEvents(input.learnerId);
  const eventsSincePlan: ProgressEventSummary[] = allProgressEvents
    .filter(
      (event) => new Date(event.createdAt).getTime() > planCreatedAt.getTime()
    )
    .map((e) => ({
      courseId: e.courseId,
      type: e.type,
      score: e.score,
      rating: e.rating,
      createdAt: e.createdAt,
    }));

  const completedCourseIds = await getCompletedCourseIds(input.learnerId);

  const skillsCoveredInPlan = new Set<string>();
  for (const mod of latestPlanRecord.plan.modules) {
    if (Array.isArray(mod.skillsCovered)) {
      for (const skill of mod.skillsCovered) {
        skillsCoveredInPlan.add(skill);
      }
    }
  }

  const trendRows = await getLatestTrends();
  const marketChangesInPlan: MarketChangeSummary[] = trendRows
    .filter((row) => {
      const periodAfterPlan =
        new Date(row.period).getTime() > planCreatedAt.getTime();
      const deltaSignificant = Math.abs(row.delta) >= 10;
      const inSkillsCovered = skillsCoveredInPlan.has(row.skill);
      return periodAfterPlan && deltaSignificant && inSkillsCovered;
    })
    .map((row) => ({
      skill: row.skill,
      delta: row.delta,
    }));

  const now = new Date();
  const daysSincePlan = Math.max(
    0,
    Math.floor((now.getTime() - planCreatedAt.getTime()) / (1000 * 60 * 60 * 24))
  );

  const courseTitles = new Map<string, string>();
  const courseIdsToFetch = Array.from(
    new Set([
      ...latestPlanRecord.plan.modules.map((m) => m.courseId),
      ...eventsSincePlan.map((e) => e.courseId),
    ])
  );
  if (courseIdsToFetch.length > 0) {
    const dbCourses = await getCoursesByIds(courseIdsToFetch);
    for (const c of dbCourses) {
      courseTitles.set(c.id, c.title);
    }
  }

  const decision = await decideReplan({
    profile,
    plan: latestPlanRecord.plan,
    courseTitles,
    trigger: input.trigger,
    eventsSincePlan,
    marketChangesInPlan,
    daysSincePlan,
  });

  if (!decision.replan) {
    return {
      replanned: false,
      reason: decision.reason,
    };
  }

  const { plan: newPlan, criticReport } = await createPlan(
    {
      learnerId: input.learnerId,
      profile,
      completedCourseIds,
      feedback: [decision.instructions],
    },
    input.onStatus
  );

  const saved = await savePlan({
    learnerId: input.learnerId,
    plan: newPlan,
    criticReport,
  });

  const completedSet = new Set(completedCourseIds);
  const previousPlanFiltered: Plan = {
    ...latestPlanRecord.plan,
    modules: latestPlanRecord.plan.modules.filter(
      (mod) => !completedSet.has(mod.courseId)
    ),
  };

  const diff = diffPlans(previousPlanFiltered, newPlan);

  await db.insert(replanLog).values({
    learnerId: input.learnerId,
    planFrom: latestPlanRecord.id,
    planTo: saved.id,
    trigger: input.trigger,
    diffJson: diff,
    reason: decision.reason,
    seenAt: null,
  });

  await db
    .update(learners)
    .set({
      lastReplanAt: now,
    })
    .where(eq(learners.id, input.learnerId));

  return {
    replanned: true,
    reason: decision.reason,
    planId: saved.id,
    version: saved.version,
    passed: criticReport.passed,
  };
}
