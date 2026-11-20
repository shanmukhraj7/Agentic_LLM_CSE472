import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { progressEvents } from "@/lib/db/schema";
import { ProgressEventInput } from "@/lib/contracts";

export type ProgressEvent = typeof progressEvents.$inferSelect;

export async function recordProgress(
  learnerId: string,
  input: ProgressEventInput
): Promise<ProgressEvent | null> {
  if (input.type === "completed") {
    const [existing] = await db
      .select({ id: progressEvents.id })
      .from(progressEvents)
      .where(
        and(
          eq(progressEvents.learnerId, learnerId),
          eq(progressEvents.courseId, input.courseId),
          eq(progressEvents.type, "completed")
        )
      )
      .limit(1);

    if (existing) {
      return null;
    }
  }

  const [inserted] = await db
    .insert(progressEvents)
    .values({
      learnerId,
      courseId: input.courseId,
      type: input.type,
      score: input.score ?? null,
      rating: input.rating ?? null,
    })
    .returning();

  return inserted ?? null;
}

export async function getProgressEvents(
  learnerId: string
): Promise<ProgressEvent[]> {
  return await db
    .select()
    .from(progressEvents)
    .where(eq(progressEvents.learnerId, learnerId))
    .orderBy(desc(progressEvents.createdAt));
}

export async function getCompletedCourseIds(
  learnerId: string
): Promise<string[]> {
  const rows = await db
    .select({ courseId: progressEvents.courseId })
    .from(progressEvents)
    .where(
      and(
        eq(progressEvents.learnerId, learnerId),
        eq(progressEvents.type, "completed")
      )
    );

  return Array.from(new Set(rows.map((r) => r.courseId)));
}
