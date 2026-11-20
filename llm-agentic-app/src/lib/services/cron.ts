import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learners, plans, progressEvents } from "@/lib/db/schema";
import { getLatestTrends } from "@/lib/trends/read";
import { refreshTrends } from "@/lib/trends/refresh";
import { replanLearner } from "@/lib/services/replan";

export const CRON_MAX_LEARNERS = 4;

function extractSkillsCovered(modulesJson: unknown): Set<string> {
  const skills = new Set<string>();
  if (!modulesJson || typeof modulesJson !== "object") {
    return skills;
  }
  const raw = modulesJson as { modules?: unknown };
  const modulesList = Array.isArray(raw.modules)
    ? raw.modules
    : Array.isArray(modulesJson)
      ? (modulesJson as unknown[])
      : [];

  for (const mod of modulesList) {
    if (mod && typeof mod === "object") {
      const skillsCovered = (mod as { skillsCovered?: unknown }).skillsCovered;
      if (Array.isArray(skillsCovered)) {
        for (const s of skillsCovered) {
          if (typeof s === "string") {
            skills.add(s);
            skills.add(s.toLowerCase());
          }
        }
      }
    }
  }
  return skills;
}

export async function selectLearnersForReplan(
  limit: number
): Promise<string[]> {
  if (limit <= 0) {
    return [];
  }

  // 1. Load getLatestTrends() rows with |delta| >= 10
  const latestTrends = await getLatestTrends();
  const significantTrends = latestTrends.filter((t) => Math.abs(t.delta) >= 10);

  // 2. Load every learner's latest plan (in memory is fine at this scale)
  const allPlans = await db
    .select()
    .from(plans)
    .orderBy(desc(plans.version), desc(plans.createdAt));

  const latestPlansByLearner = new Map<string, (typeof allPlans)[number]>();
  for (const p of allPlans) {
    if (!latestPlansByLearner.has(p.learnerId)) {
      latestPlansByLearner.set(p.learnerId, p);
    }
  }

  // 3. Load all learners
  const allLearners = await db
    .select({
      id: learners.id,
      lastReplanAt: learners.lastReplanAt,
    })
    .from(learners);

  // 4. Load progress events to evaluate inactivity
  const allProgressEvents = await db
    .select({
      learnerId: progressEvents.learnerId,
      createdAt: progressEvents.createdAt,
    })
    .from(progressEvents);

  const progressEventsByLearner = new Map<string, Date[]>();
  for (const pe of allProgressEvents) {
    const list = progressEventsByLearner.get(pe.learnerId);
    if (list) {
      list.push(pe.createdAt);
    } else {
      progressEventsByLearner.set(pe.learnerId, [pe.createdAt]);
    }
  }

  const now = new Date();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // 5. Evaluate qualifications
  // A learner qualifies if:
  // - a trend row has period later than their plan's createdAt AND its skill is in their plan's skillsCovered
  // OR
  // - their latest plan is 7+ days old with no progress events since
  const qualifying: { id: string; lastReplanAt: Date | null }[] = [];

  for (const learner of allLearners) {
    const latestPlan = latestPlansByLearner.get(learner.id);
    if (!latestPlan) {
      continue;
    }

    const planCreatedAt = new Date(latestPlan.createdAt);
    const planCreatedAtMs = planCreatedAt.getTime();

    // Trend shift qualification
    const skillsCovered = extractSkillsCovered(latestPlan.modulesJson);
    const qualifiesByTrend = significantTrends.some(
      (trend) =>
        new Date(trend.period).getTime() > planCreatedAtMs &&
        (skillsCovered.has(trend.skill) ||
          skillsCovered.has(trend.skill.toLowerCase()))
    );

    // Inactivity qualification: 7+ days old with no progress events since
    let qualifiesByInactivity = false;
    if (now.getTime() - planCreatedAtMs >= SEVEN_DAYS_MS) {
      const learnerEvents = progressEventsByLearner.get(learner.id) ?? [];
      const hasProgressSince = learnerEvents.some(
        (evDate) => new Date(evDate).getTime() > planCreatedAtMs
      );
      if (!hasProgressSince) {
        qualifiesByInactivity = true;
      }
    }

    if (qualifiesByTrend || qualifiesByInactivity) {
      qualifying.push({
        id: learner.id,
        lastReplanAt: learner.lastReplanAt,
      });
    }
  }

  // 6. Order by learners.lastReplanAt ascending with nulls first; return first limit ids.
  qualifying.sort((a, b) => {
    const timeA = a.lastReplanAt ? new Date(a.lastReplanAt).getTime() : null;
    const timeB = b.lastReplanAt ? new Date(b.lastReplanAt).getTime() : null;

    if (timeA === null && timeB === null) {
      return a.id.localeCompare(b.id);
    }
    if (timeA === null) {
      return -1;
    }
    if (timeB === null) {
      return 1;
    }
    const diff = timeA - timeB;
    if (diff !== 0) {
      return diff;
    }
    return a.id.localeCompare(b.id);
  });

  return qualifying.slice(0, limit).map((l) => l.id);
}

export async function runCronReplan(): Promise<{
  changedSkills: number;
  selected: number;
  replanned: number;
  errors: { learnerId: string; message: string }[];
}> {
  const trendResult = await refreshTrends();
  const changedSkills = trendResult.changedSkills.length;

  const selectedLearnerIds = await selectLearnersForReplan(CRON_MAX_LEARNERS);
  const selected = selectedLearnerIds.length;

  let replanned = 0;
  const errors: { learnerId: string; message: string }[] = [];

  for (const learnerId of selectedLearnerIds) {
    try {
      const result = await replanLearner({
        learnerId,
        trigger: "cron",
      });
      if (result.replanned) {
        replanned++;
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : typeof err === "string"
            ? err
            : "Unknown error during replan";
      errors.push({
        learnerId,
        message,
      });
    }
  }

  return {
    changedSkills,
    selected,
    replanned,
    errors,
  };
}
