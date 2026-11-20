import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { count, sql } from "drizzle-orm";
import { client, db } from "@/lib/db/client";
import { courses, jobPostings, skillTrends } from "@/lib/db/schema";
import { embedDocuments } from "@/lib/llm/embed";
import { computeSkillTrends } from "@/lib/trends/build";

interface CourseInput {
  id: string;
  title: string;
  provider: string;
  url: string;
  skills: string[];
  level: string;
  durationHrs: number;
  prerequisites?: string[];
  description?: string;
}

interface JobInput {
  id: string;
  role?: string;
  title?: string;
  skills?: string[];
  description?: string;
  postedAt?: string;
  source?: string;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function buildEmbedText(item: {
  title?: string | null;
  skills?: string[] | null;
  description?: string | null;
}): string {
  const title = item.title ?? "";
  const skills = (item.skills ?? []).join(", ");
  const description = item.description ?? "";
  return `${title}. Skills: ${skills}. ${description}`;
}

async function seed() {
  const repoRoot = path.resolve(__dirname, "..");
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(repoRoot, "data");

  if (!fs.existsSync(dataDir)) {
    throw new Error(`Data directory not found at ${dataDir}`);
  }

  const allFiles = fs.readdirSync(dataDir).sort();
  const courseFiles = allFiles.filter((f) => /^courses.*\.json$/.test(f));
  const jobFiles = allFiles.filter((f) => /^jobs.*\.json$/.test(f));

  // 1. Load courses
  const loadedCourses: CourseInput[] = [];
  for (const fileName of courseFiles) {
    const filePath = path.join(dataDir, fileName);
    const content = JSON.parse(fs.readFileSync(filePath, "utf8")) as CourseInput[];
    loadedCourses.push(...content);
  }

  // Deduplicate courses by id (keep last occurrence)
  const courseMap = new Map<string, CourseInput>();
  for (const course of loadedCourses) {
    courseMap.set(course.id, course);
  }
  const coursesToUpsert = Array.from(courseMap.values());

  // 2. Load jobs
  const loadedJobs: JobInput[] = [];
  for (const fileName of jobFiles) {
    const filePath = path.join(dataDir, fileName);
    const content = JSON.parse(fs.readFileSync(filePath, "utf8")) as JobInput[];
    loadedJobs.push(...content);
  }

  // Deduplicate jobs by id (keep last occurrence)
  const jobMap = new Map<string, JobInput>();
  for (const job of loadedJobs) {
    jobMap.set(job.id, job);
  }
  const jobsToUpsert = Array.from(jobMap.values());

  console.log(`Loaded ${coursesToUpsert.length} courses and ${jobsToUpsert.length} jobs.`);

  // 3. Load or initialize embedding cache
  const cacheFilePath = path.join(dataDir, ".embed-cache.json");
  let embedCache: Record<string, number[]> = {};

  if (fs.existsSync(cacheFilePath)) {
    try {
      embedCache = JSON.parse(fs.readFileSync(cacheFilePath, "utf8"));
    } catch (err) {
      console.warn("Could not parse existing embed cache; starting fresh:", err);
      embedCache = {};
    }
  }

  // 4. Determine missing embeddings
  const missingHashMap = new Map<string, string>(); // hash -> text

  for (const course of coursesToUpsert) {
    const text = buildEmbedText(course);
    const hash = sha256(text);
    if (!embedCache[hash] && !missingHashMap.has(hash)) {
      missingHashMap.set(hash, text);
    }
  }

  for (const job of jobsToUpsert) {
    const text = buildEmbedText(job);
    const hash = sha256(text);
    if (!embedCache[hash] && !missingHashMap.has(hash)) {
      missingHashMap.set(hash, text);
    }
  }

  if (missingHashMap.size > 0) {
    const missingHashes = Array.from(missingHashMap.keys());
    const missingTexts = missingHashes.map((h) => missingHashMap.get(h)!);
    console.log(
      `Embedding ${missingTexts.length} missing texts (${Object.keys(embedCache).length} already cached)...`
    );

    const newVectors = await embedDocuments(missingTexts, {
      onBatch: async (batchVectors, startIndex) => {
        for (let j = 0; j < batchVectors.length; j++) {
          embedCache[missingHashes[startIndex + j]] = batchVectors[j];
        }
        fs.writeFileSync(cacheFilePath, JSON.stringify(embedCache, null, 2), "utf8");
        const done = Math.min(startIndex + batchVectors.length, missingTexts.length);
        console.log(
          `Progress: ${done}/${missingTexts.length} embeddings generated and cached to disk.`
        );
      },
    });

    for (let i = 0; i < missingHashes.length; i++) {
      embedCache[missingHashes[i]] = newVectors[i];
    }

    fs.writeFileSync(cacheFilePath, JSON.stringify(embedCache, null, 2), "utf8");
    console.log(`Saved updated embedding cache (${Object.keys(embedCache).length} items) to ${cacheFilePath}`);
  } else {
    console.log(`All embeddings cached (${Object.keys(embedCache).length} cached). No API calls needed.`);
  }

  // 5. Upsert courses
  const courseRows = coursesToUpsert.map((c) => {
    const text = buildEmbedText(c);
    const hash = sha256(text);
    return {
      id: c.id,
      title: c.title,
      provider: c.provider,
      url: c.url,
      skills: c.skills,
      level: c.level,
      durationHrs: c.durationHrs,
      prerequisites: c.prerequisites ?? [],
      description: c.description ?? null,
      embedding: embedCache[hash] ?? null,
    };
  });

  const BATCH_SIZE = 50;
  for (let i = 0; i < courseRows.length; i += BATCH_SIZE) {
    const chunk = courseRows.slice(i, i + BATCH_SIZE);
    await db
      .insert(courses)
      .values(chunk)
      .onConflictDoUpdate({
        target: courses.id,
        set: {
          title: sql`excluded.title`,
          provider: sql`excluded.provider`,
          url: sql`excluded.url`,
          skills: sql`excluded.skills`,
          level: sql`excluded.level`,
          durationHrs: sql`excluded.duration_hrs`,
          prerequisites: sql`excluded.prerequisites`,
          description: sql`excluded.description`,
          embedding: sql`excluded.embedding`,
        },
      });
  }
  console.log(`Upserted ${courseRows.length} courses.`);

  // 6. Upsert job postings
  const jobRows = jobsToUpsert.map((j) => {
    const text = buildEmbedText(j);
    const hash = sha256(text);
    return {
      id: j.id,
      role: j.role ?? null,
      title: j.title ?? null,
      skills: j.skills ?? [],
      description: j.description ?? null,
      postedAt: j.postedAt ? new Date(j.postedAt) : null,
      source: j.source ?? null,
      embedding: embedCache[hash] ?? null,
    };
  });

  for (let i = 0; i < jobRows.length; i += BATCH_SIZE) {
    const chunk = jobRows.slice(i, i + BATCH_SIZE);
    await db
      .insert(jobPostings)
      .values(chunk)
      .onConflictDoUpdate({
        target: jobPostings.id,
        set: {
          role: sql`excluded.role`,
          title: sql`excluded.title`,
          skills: sql`excluded.skills`,
          description: sql`excluded.description`,
          postedAt: sql`excluded.posted_at`,
          source: sql`excluded.source`,
          embedding: sql`excluded.embedding`,
        },
      });
  }
  console.log(`Upserted ${jobRows.length} job postings.`);

  // 7. Insert skill trends snapshot (skip if skillTrends already has rows)
  const existingTrends = await db
    .select({ id: skillTrends.id })
    .from(skillTrends)
    .limit(1);

  if (existingTrends.length > 0) {
    console.log("skillTrends already has rows; skipping trend snapshot creation.");
  } else {
    console.log("Computing skill trends over all jobs...");
    const trends = computeSkillTrends(
      jobsToUpsert.map((j) => ({ skills: j.skills ?? [] }))
    );
    const trendRows = trends.map((t) => ({
      skill: t.skill,
      demandScore: t.demandScore,
      delta: t.delta,
      source: "seed",
      period: new Date(),
    }));

    for (let i = 0; i < trendRows.length; i += BATCH_SIZE) {
      const chunk = trendRows.slice(i, i + BATCH_SIZE);
      await db.insert(skillTrends).values(chunk);
    }
    console.log(`Inserted ${trendRows.length} skill trends snapshots with source "seed".`);
  }

  // 8. Log counts at the end
  const [{ val: courseCount }] = await db.select({ val: count() }).from(courses);
  const [{ val: jobCount }] = await db.select({ val: count() }).from(jobPostings);
  const [{ val: trendCount }] = await db.select({ val: count() }).from(skillTrends);

  console.log("Seeding complete. Final database counts:");
  console.log(`- Courses: ${courseCount}`);
  console.log(`- Job Postings: ${jobCount}`);
  console.log(`- Skill Trends: ${trendCount}`);
}

async function main() {
  try {
    await seed();
  } catch (error) {
    console.error("Seed error:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
