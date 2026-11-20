import { tool } from "ai";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { Level } from "@/lib/contracts";
import { db } from "@/lib/db/client";
import { progressEvents } from "@/lib/db/schema";
import { searchCourses as searchRagCourses, type CourseHit } from "@/lib/rag/searchCourses";
import { getLatestTrends } from "@/lib/trends/read";

export interface TruncatedCourseHit {
  id: string;
  title: string;
  level: Level;
  durationHrs: number;
  skills: string[];
  prerequisites: string[] | null;
  description: string | null;
}

export interface LearnerProgress {
  completedCourseIds: string[];
  latestQuizScores: Record<string, number>;
  latestRatings: Record<string, string>;
  quizScores: Record<string, number>;
  ratings: Record<string, string>;
}

export function makePlannerTools(learnerId: string) {
  const seenCourses = new Map<string, CourseHit>();

  const tools = {
    searchCourses: tool({
      description: "Search for courses by query, level, skills, and limit.",
      inputSchema: z.object({
        query: z.string().describe("Search query for courses"),
        levels: z.array(Level).optional().describe("Optional difficulty levels to filter by"),
        skills: z.array(z.string()).optional().describe("Optional skills to filter by"),
        limit: z.number().max(8).optional().describe("Maximum number of results to return (max 8)"),
      }),
      execute: async ({ query, levels, skills, limit }) => {
        const clampedLimit =
          typeof limit === "number" ? Math.min(Math.max(1, limit), 8) : undefined;

        const hits = await searchRagCourses({
          query,
          levels,
          skills,
          limit: clampedLimit,
        });

        for (const hit of hits) {
          seenCourses.set(hit.id, hit);
        }

        return hits.map((hit): TruncatedCourseHit => ({
          id: hit.id,
          title: hit.title,
          level: hit.level,
          durationHrs: hit.durationHrs,
          skills: hit.skills,
          prerequisites: hit.prerequisites,
          description: hit.description ? hit.description.slice(0, 140) : hit.description,
        }));
      },
    }),

    getMarketTrends: tool({
      description: "Get market trends for the specified skills.",
      inputSchema: z.object({
        skills: z.array(z.string()).max(15).describe("List of skills to get trends for (max 15)"),
      }),
      execute: async ({ skills }) => {
        return await getLatestTrends(skills);
      },
    }),

    getProgress: tool({
      description:
        "Get progress for this learner, including completed course IDs, latest quiz scores, and latest ratings.",
      inputSchema: z.object({}),
      execute: async (): Promise<LearnerProgress> => {
        const events = await db
          .select({
            courseId: progressEvents.courseId,
            type: progressEvents.type,
            score: progressEvents.score,
            rating: progressEvents.rating,
          })
          .from(progressEvents)
          .where(eq(progressEvents.learnerId, learnerId))
          .orderBy(asc(progressEvents.createdAt));

        const completedSet = new Set<string>();
        const latestQuizScores: Record<string, number> = {};
        const latestRatings: Record<string, string> = {};

        for (const event of events) {
          if (event.type === "completed") {
            completedSet.add(event.courseId);
          }
          if (event.type === "quiz" && event.score !== null && event.score !== undefined) {
            latestQuizScores[event.courseId] = event.score;
          }
          if (event.type === "rating" && event.rating !== null && event.rating !== undefined) {
            latestRatings[event.courseId] = event.rating;
          }
        }

        const result: LearnerProgress = {
          completedCourseIds: Array.from(completedSet),
          latestQuizScores,
          latestRatings,
          quizScores: latestQuizScores,
          ratings: latestRatings,
        };

        Object.defineProperty(result, "quizScores", {
          value: latestQuizScores,
          enumerable: false,
          writable: true,
          configurable: true,
        });

        Object.defineProperty(result, "ratings", {
          value: latestRatings,
          enumerable: false,
          writable: true,
          configurable: true,
        });

        return result;
      },
    }),
  };

  return { tools, seenCourses };
}
