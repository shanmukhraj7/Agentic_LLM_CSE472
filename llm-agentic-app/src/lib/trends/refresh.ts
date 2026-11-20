import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { skillTrends } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import { SKILL_VOCAB } from "@/lib/skills/vocab";
import { getLatestTrends } from "@/lib/trends/read";

export type TrendSource = "remotive" | "drift";

export interface ChangedSkill {
  skill: string;
  delta: number;
}

export interface RefreshTrendsResult {
  changedSkills: ChangedSkill[];
  source: TrendSource;
}

function extractCount(data: unknown): number {
  if (typeof data !== "object" || data === null) {
    return 0;
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj["job-count"] === "number") {
    return obj["job-count"];
  }
  if (typeof obj.count === "number") {
    return obj.count;
  }
  if (typeof obj["total-job-count"] === "number") {
    return obj["total-job-count"];
  }
  if (Array.isArray(obj.jobs)) {
    return obj.jobs.length;
  }
  return 0;
}

export function computeDriftDelta(skill: string, dateStr: string): number {
  const hash = crypto
    .createHash("sha256")
    .update(`${skill}-${dateStr}`)
    .digest();

  // 10% chance of a spike: randVal % 100 < 10
  const randVal = hash.readUInt32BE(0);
  const isSpike = randVal % 100 < 10;

  if (isSpike) {
    // Spike of +/-10 to +/-20
    const magnitude = 10 + (hash.readUInt16BE(4) % 11);
    const sign = (hash.readUInt8(6) & 1) === 0 ? 1 : -1;
    return sign * magnitude;
  }

  // The rest: +/-0 to 4
  return (hash.readUInt16BE(4) % 9) - 4;
}

async function refreshWithRemotive(
  topSkills: { skill: string; demandScore: number }[]
): Promise<ChangedSkill[]> {
  const baseUrl = env.REMOTIVE_API_URL || "https://remotive.com/api/remote-jobs";

  const skillCounts = await Promise.all(
    topSkills.map(async ({ skill, demandScore: latestStored }) => {
      const endpoint = new URL(baseUrl);
      endpoint.searchParams.set("search", skill);
      endpoint.searchParams.set("limit", "1");

      const rawData = await withRetry(async () => {
        const res = await fetch(endpoint.toString(), {
          headers: {
            Accept: "application/json",
          },
        });
        if (!res.ok) {
          throw new Error(
            `Remotive API returned ${res.status}: ${res.statusText}`
          );
        }
        return (await res.json()) as unknown;
      });

      const count = extractCount(rawData);
      return { skill, latestStored, count };
    })
  );

  let maxCount = 0;
  for (const item of skillCounts) {
    if (item.count > maxCount) {
      maxCount = item.count;
    }
  }

  const now = new Date();
  const changedSkills: ChangedSkill[] = [];
  const recordsToInsert: (typeof skillTrends.$inferInsert)[] = [];

  for (const item of skillCounts) {
    const demandScore =
      maxCount > 0 ? Math.round((100 * item.count) / maxCount) : 0;
    const delta = demandScore - item.latestStored;

    if (delta !== 0) {
      changedSkills.push({ skill: item.skill, delta });
      recordsToInsert.push({
        skill: item.skill,
        demandScore,
        delta,
        period: now,
        source: "remotive",
      });
    }
  }

  if (recordsToInsert.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
      const chunk = recordsToInsert.slice(i, i + chunkSize);
      await db.insert(skillTrends).values(chunk);
    }
  }

  return changedSkills;
}

async function refreshWithDrift(
  latestTrends: { skill: string; demandScore: number }[]
): Promise<ChangedSkill[]> {
  const latestMap = new Map<string, number>();
  for (const t of latestTrends) {
    latestMap.set(t.skill, t.demandScore);
  }

  const allSkills = Array.from(
    new Set([...latestMap.keys(), ...SKILL_VOCAB])
  ).sort();

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const changedSkills: ChangedSkill[] = [];
  const recordsToInsert: (typeof skillTrends.$inferInsert)[] = [];

  for (const skill of allSkills) {
    const latest = latestMap.get(skill) ?? 0;
    const delta = computeDriftDelta(skill, dateStr);
    const demandScore = Math.max(0, Math.min(100, Math.round(latest + delta)));
    const finalDelta = demandScore - latest;

    if (finalDelta !== 0) {
      changedSkills.push({ skill, delta: finalDelta });
      recordsToInsert.push({
        skill,
        demandScore,
        delta: finalDelta,
        period: now,
        source: "drift",
      });
    }
  }

  if (recordsToInsert.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
      const chunk = recordsToInsert.slice(i, i + chunkSize);
      await db.insert(skillTrends).values(chunk);
    }
  }

  return changedSkills;
}

export async function refreshTrends(): Promise<RefreshTrendsResult> {
  const latestTrends = await getLatestTrends();

  const sorted = [...latestTrends].sort(
    (a, b) => b.demandScore - a.demandScore
  );
  const top30 = sorted.slice(0, 30);

  if (top30.length > 0) {
    try {
      const changedSkills = await refreshWithRemotive(top30);
      return { changedSkills, source: "remotive" };
    } catch (err: unknown) {
      console.warn("Remotive refresh failed, falling back to drift:", err);
    }
  }

  const changedSkills = await refreshWithDrift(latestTrends);
  return { changedSkills, source: "drift" };
}

export default refreshTrends;
