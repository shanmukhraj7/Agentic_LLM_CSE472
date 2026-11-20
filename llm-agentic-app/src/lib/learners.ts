import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learners } from "@/lib/db/schema";

export type Learner = typeof learners.$inferSelect;
export type NewLearner = typeof learners.$inferInsert;

export async function ensureLearner(userId: string): Promise<Learner | null> {
  await db
    .insert(learners)
    .values({ id: userId })
    .onConflictDoNothing();

  return getLearner(userId);
}

export async function getLearner(userId: string): Promise<Learner | null> {
  const result = await db
    .select()
    .from(learners)
    .where(eq(learners.id, userId))
    .limit(1);

  return result[0] ?? null;
}
