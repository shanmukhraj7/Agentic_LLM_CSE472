import { and, arrayOverlaps, asc, cosineDistance, inArray, isNotNull, lte, notInArray, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { courses } from "@/lib/db/schema";
import { embedQuery } from "@/lib/llm/embed";
import { type Level } from "@/lib/contracts";

export interface Course {
  id: string;
  title: string;
  provider: string;
  url: string;
  skills: string[];
  level: Level;
  durationHrs: number;
  prerequisites: string[] | null;
  description: string | null;
}

export interface CourseHit extends Course {
  score: number;
}

export interface SearchCoursesOptions {
  query: string;
  levels?: Level[];
  skills?: string[];
  maxDurationHrs?: number;
  excludeIds?: string[];
  limit?: number; /* default 8, max 15 */
}

export async function searchCourses(opts: SearchCoursesOptions): Promise<CourseHit[]> {
  const trimmedQuery = opts.query?.trim();
  if (!trimmedQuery) {
    return [];
  }

  const queryVector = await embedQuery(trimmedQuery);
  const distance = cosineDistance(courses.embedding, queryVector);

  const conditions: SQL[] = [isNotNull(courses.embedding)];

  if (opts.levels && opts.levels.length > 0) {
    const uniqueLevels = Array.from(new Set(opts.levels));
    if (uniqueLevels.length > 0) {
      conditions.push(inArray(courses.level, uniqueLevels));
    }
  }

  if (opts.skills && opts.skills.length > 0) {
    const normalizedSkills = Array.from(
      new Set(opts.skills.map((s) => s.trim().toLowerCase()).filter(Boolean))
    );
    if (normalizedSkills.length > 0) {
      conditions.push(arrayOverlaps(courses.skills, normalizedSkills));
    }
  }

  if (typeof opts.maxDurationHrs === "number") {
    conditions.push(lte(courses.durationHrs, opts.maxDurationHrs));
  }

  if (opts.excludeIds && opts.excludeIds.length > 0) {
    const validExcludeIds = Array.from(new Set(opts.excludeIds.filter(Boolean)));
    if (validExcludeIds.length > 0) {
      conditions.push(notInArray(courses.id, validExcludeIds));
    }
  }

  const rawLimit = typeof opts.limit === "number" && !isNaN(opts.limit) ? opts.limit : 8;
  const limit = Math.min(Math.max(1, Math.floor(rawLimit)), 15);

  const rows = await db
    .select({
      id: courses.id,
      title: courses.title,
      provider: courses.provider,
      url: courses.url,
      skills: courses.skills,
      level: courses.level,
      durationHrs: courses.durationHrs,
      prerequisites: courses.prerequisites,
      description: courses.description,
      distance,
    })
    .from(courses)
    .where(and(...conditions))
    .orderBy(asc(distance))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    provider: row.provider,
    url: row.url,
    skills: row.skills,
    level: row.level as Level,
    durationHrs: row.durationHrs,
    prerequisites: row.prerequisites,
    description: row.description,
    score: 1 - Number(row.distance),
  }));
}

export async function getCoursesByIds(ids: string[]): Promise<Course[]> {
  if (!ids || ids.length === 0) {
    return [];
  }

  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: courses.id,
      title: courses.title,
      provider: courses.provider,
      url: courses.url,
      skills: courses.skills,
      level: courses.level,
      durationHrs: courses.durationHrs,
      prerequisites: courses.prerequisites,
      description: courses.description,
    })
    .from(courses)
    .where(inArray(courses.id, uniqueIds));

  const map = new Map<string, Course>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      title: r.title,
      provider: r.provider,
      url: r.url,
      skills: r.skills,
      level: r.level as Level,
      durationHrs: r.durationHrs,
      prerequisites: r.prerequisites,
      description: r.description,
    });
  }

  const results: Course[] = [];
  for (const id of uniqueIds) {
    const course = map.get(id);
    if (course) {
      results.push(course);
    }
  }

  return results;
}
