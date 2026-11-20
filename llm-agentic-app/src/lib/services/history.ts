import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { plans, replanLog } from "@/lib/db/schema";
import { PlanDiff } from "@/lib/contracts";

export interface ReplanHistoryRow {
  id: string;
  learnerId: string;
  planFrom: string | null;
  planTo: string;
  trigger: string;
  reason: string | null;
  seenAt: Date | null;
  createdAt: Date;
  fromVersion: number | null;
  toVersion: number | null;
  diff: PlanDiff;
  diffJson: PlanDiff;
}

function parsePlanDiff(raw: unknown): PlanDiff {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      // ignore
    }
  }

  const result = PlanDiff.safeParse(value);
  if (result.success) {
    return result.data;
  }

  return {
    added: [],
    removed: [],
    moved: [],
    unchangedCount: 0,
  };
}

export async function getReplanHistory(
  learnerId: string
): Promise<ReplanHistoryRow[]> {
  const fromPlan = alias(plans, "from_plan");
  const toPlan = alias(plans, "to_plan");

  const rows = await db
    .select({
      id: replanLog.id,
      learnerId: replanLog.learnerId,
      planFrom: replanLog.planFrom,
      planTo: replanLog.planTo,
      trigger: replanLog.trigger,
      diffJson: replanLog.diffJson,
      reason: replanLog.reason,
      seenAt: replanLog.seenAt,
      createdAt: replanLog.createdAt,
      fromVersion: fromPlan.version,
      toVersion: toPlan.version,
    })
    .from(replanLog)
    .leftJoin(fromPlan, eq(replanLog.planFrom, fromPlan.id))
    .leftJoin(toPlan, eq(replanLog.planTo, toPlan.id))
    .where(eq(replanLog.learnerId, learnerId))
    .orderBy(desc(replanLog.createdAt));

  return rows.map((row) => {
    const diff = parsePlanDiff(row.diffJson);
    return {
      id: row.id,
      learnerId: row.learnerId,
      planFrom: row.planFrom,
      planTo: row.planTo,
      trigger: row.trigger,
      reason: row.reason,
      seenAt: row.seenAt,
      createdAt: row.createdAt,
      fromVersion: row.fromVersion,
      toVersion: row.toVersion,
      diff,
      diffJson: diff,
    };
  });
}

export async function getUnseenReplans(
  learnerId: string
): Promise<ReplanHistoryRow[]> {
  const fromPlan = alias(plans, "from_plan");
  const toPlan = alias(plans, "to_plan");

  const rows = await db
    .select({
      id: replanLog.id,
      learnerId: replanLog.learnerId,
      planFrom: replanLog.planFrom,
      planTo: replanLog.planTo,
      trigger: replanLog.trigger,
      diffJson: replanLog.diffJson,
      reason: replanLog.reason,
      seenAt: replanLog.seenAt,
      createdAt: replanLog.createdAt,
      fromVersion: fromPlan.version,
      toVersion: toPlan.version,
    })
    .from(replanLog)
    .leftJoin(fromPlan, eq(replanLog.planFrom, fromPlan.id))
    .leftJoin(toPlan, eq(replanLog.planTo, toPlan.id))
    .where(
      and(
        eq(replanLog.learnerId, learnerId),
        isNull(replanLog.seenAt)
      )
    )
    .orderBy(desc(replanLog.createdAt));

  return rows.map((row) => {
    const diff = parsePlanDiff(row.diffJson);
    return {
      id: row.id,
      learnerId: row.learnerId,
      planFrom: row.planFrom,
      planTo: row.planTo,
      trigger: row.trigger,
      reason: row.reason,
      seenAt: row.seenAt,
      createdAt: row.createdAt,
      fromVersion: row.fromVersion,
      toVersion: row.toVersion,
      diff,
      diffJson: diff,
    };
  });
}

export async function markReplansSeen(learnerId: string): Promise<void> {
  await db
    .update(replanLog)
    .set({
      seenAt: new Date(),
    })
    .where(
      and(
        eq(replanLog.learnerId, learnerId),
        isNull(replanLog.seenAt)
      )
    );
}
