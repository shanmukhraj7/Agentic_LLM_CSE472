import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plans } from "@/lib/db/schema";
import { CriticReport, Plan } from "@/lib/contracts";

export interface SavePlanInput {
  learnerId: string;
  plan: Plan;
  criticReport?: CriticReport | null;
}

export interface PlanRecord {
  id: string;
  version: number;
  plan: Plan;
  criticReport: CriticReport | null;
  createdAt: Date;
}

function mapRowToPlanRecord(row: typeof plans.$inferSelect): PlanRecord {
  const raw = (
    row.modulesJson && typeof row.modulesJson === "object"
      ? row.modulesJson
      : {}
  ) as {
    summary?: unknown;
    modules?: unknown;
    totalHours?: unknown;
    weeksTotal?: unknown;
  };

  const planData = {
    summary:
      row.summary ?? (typeof raw.summary === "string" ? raw.summary : ""),
    modules: Array.isArray(raw.modules) ? raw.modules : [],
    totalHours:
      typeof raw.totalHours === "number"
        ? raw.totalHours
        : Number(raw.totalHours ?? 0),
    weeksTotal:
      typeof raw.weeksTotal === "number"
        ? raw.weeksTotal
        : Number(raw.weeksTotal ?? 0),
  };

  const parsedPlan = Plan.safeParse(planData);
  const plan: Plan = parsedPlan.success ? parsedPlan.data : (planData as Plan);

  const parsedReport = row.criticReportJson
    ? CriticReport.safeParse(row.criticReportJson)
    : null;
  const criticReport: CriticReport | null = parsedReport?.success
    ? parsedReport.data
    : (row.criticReportJson as CriticReport | null);

  return {
    id: row.id,
    version: row.version,
    plan,
    criticReport,
    createdAt: row.createdAt,
  };
}

export async function savePlan({
  learnerId,
  plan,
  criticReport,
}: SavePlanInput): Promise<{ id: string; version: number }> {
  return await db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: plans.version })
      .from(plans)
      .where(eq(plans.learnerId, learnerId))
      .orderBy(desc(plans.version))
      .limit(1);

    const version = (latest?.version ?? 0) + 1;

    const [inserted] = await tx
      .insert(plans)
      .values({
        learnerId,
        version,
        summary: plan.summary,
        modulesJson: {
          modules: plan.modules,
          totalHours: plan.totalHours,
          weeksTotal: plan.weeksTotal,
        },
        criticReportJson: criticReport ?? null,
      })
      .returning({ id: plans.id, version: plans.version });

    if (!inserted) {
      throw new Error("Failed to save plan");
    }

    return {
      id: inserted.id,
      version: inserted.version,
    };
  });
}

export async function getLatestPlan(
  learnerId: string
): Promise<PlanRecord | null> {
  const [row] = await db
    .select()
    .from(plans)
    .where(eq(plans.learnerId, learnerId))
    .orderBy(desc(plans.version), desc(plans.createdAt))
    .limit(1);

  if (!row) {
    return null;
  }

  return mapRowToPlanRecord(row);
}

export async function getPlanHistory(
  learnerId: string
): Promise<PlanRecord[]> {
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.learnerId, learnerId))
    .orderBy(desc(plans.version), desc(plans.createdAt));

  return rows.map(mapRowToPlanRecord);
}
