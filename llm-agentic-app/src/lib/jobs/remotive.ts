import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { jobPostings, skillTrends } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { embedDocuments } from "@/lib/llm/embed";
import { withRetry } from "@/lib/retry";

export const RemotiveJobSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((val) => String(val)),
  url: z.string().url().catch(""),
  title: z.string(),
  company_name: z.string().optional().default(""),
  company_logo: z.string().optional().nullable(),
  category: z.string().optional().default("Software Development"),
  tags: z.array(z.string()).default([]),
  job_type: z.string().optional().nullable(),
  publication_date: z.string(),
  candidate_required_location: z.string().optional().nullable(),
  salary: z.string().optional().nullable(),
  description: z.string().default(""),
});

export type RemotiveJob = z.infer<typeof RemotiveJobSchema>;

export const RemotiveApiResponseSchema = z.object({
  "job-count": z.number().optional(),
  "total-job-count": z.number().optional(),
  jobs: z.array(RemotiveJobSchema),
});

export type RemotiveApiResponse = z.infer<typeof RemotiveApiResponseSchema>;

export interface FetchRemotiveJobsOptions {
  category?: string;
  search?: string;
  limit?: number;
}

export interface SyncRemotiveJobsOptions extends FetchRemotiveJobsOptions {
  withEmbeddings?: boolean;
  updateTrends?: boolean;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>?/gm, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function transformToJobPosting(job: RemotiveJob) {
  const normalizedSkills = Array.from(
    new Set(
      job.tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0 && tag.length <= 50)
    )
  );

  return {
    id: `remotive-${job.id}`,
    role: job.category || "Software Development",
    title: job.title,
    skills: normalizedSkills,
    description: stripHtml(job.description),
    postedAt: new Date(job.publication_date),
    source: "remotive",
  };
}

export async function fetchRemotiveJobs(
  options: FetchRemotiveJobsOptions = {}
): Promise<RemotiveJob[]> {
  const { category = "software-dev", search, limit } = options;

  const endpoint = new URL(
    env.REMOTIVE_API_URL || "https://remotive.com/api/remote-jobs"
  );

  if (category) {
    endpoint.searchParams.set("category", category);
  }
  if (search) {
    endpoint.searchParams.set("search", search);
  }
  if (typeof limit === "number" && limit > 0) {
    endpoint.searchParams.set("limit", String(limit));
  }

  const rawData = await withRetry(async () => {
    const res = await fetch(endpoint.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(
        `Failed to fetch from Remotive API: ${res.status} ${res.statusText}`
      );
    }

    return (await res.json()) as unknown;
  });

  const parsed = RemotiveApiResponseSchema.safeParse(rawData);
  if (!parsed.success) {
    throw new Error(
      `Remotive API response validation failed: ${parsed.error.message}`
    );
  }

  return parsed.data.jobs;
}

export function calculateSkillFrequencies(
  jobs: Array<{ skills: string[] }>
): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const job of jobs) {
    for (const skill of job.skills) {
      frequencies.set(skill, (frequencies.get(skill) ?? 0) + 1);
    }
  }
  return frequencies;
}

export async function syncRemotiveJobs(
  options: SyncRemotiveJobsOptions = {}
): Promise<{
  insertedCount: number;
  totalFetched: number;
  uniqueSkillsCount: number;
}> {
  const { withEmbeddings = false, updateTrends = true, ...fetchOptions } = options;
  const jobs = await fetchRemotiveJobs(fetchOptions);

  if (jobs.length === 0) {
    return { insertedCount: 0, totalFetched: 0, uniqueSkillsCount: 0 };
  }

  const transformedPostings = jobs.map(transformToJobPosting);

  let embeddings: (number[] | null)[] = transformedPostings.map(() => null);

  if (withEmbeddings) {
    const textsToEmbed = transformedPostings.map(
      (p) => `${p.title}. Skills: ${p.skills.join(", ")}. ${p.description.slice(0, 600)}`
    );
    embeddings = await embedDocuments(textsToEmbed);
  }

  const recordsToInsert = transformedPostings.map((posting, idx) => ({
    ...posting,
    embedding: embeddings[idx] ?? null,
  }));

  // Batch insert in chunks of 50
  const chunkSize = 50;
  for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
    const chunk = recordsToInsert.slice(i, i + chunkSize);
    await db
      .insert(jobPostings)
      .values(chunk)
      .onConflictDoUpdate({
        target: jobPostings.id,
        set: {
          title: sql`excluded.title`,
          role: sql`excluded.role`,
          skills: sql`excluded.skills`,
          description: sql`excluded.description`,
          postedAt: sql`excluded.posted_at`,
          source: sql`excluded.source`,
          ...(withEmbeddings
            ? { embedding: sql`excluded.embedding` }
            : {}),
        },
      });
  }

  const skillCounts = calculateSkillFrequencies(transformedPostings);

  if (updateTrends && skillCounts.size > 0) {
    const totalJobs = transformedPostings.length;
    const now = new Date();
    const trendRecords = Array.from(skillCounts.entries()).map(([skill, count]) => {
      const demandScore = Math.min(100, (count / totalJobs) * 100);
      return {
        skill,
        demandScore,
        delta: 0,
        period: now,
        source: "remotive",
      };
    });

    for (let i = 0; i < trendRecords.length; i += chunkSize) {
      const chunk = trendRecords.slice(i, i + chunkSize);
      await db.insert(skillTrends).values(chunk);
    }
  }

  return {
    insertedCount: recordsToInsert.length,
    totalFetched: jobs.length,
    uniqueSkillsCount: skillCounts.size,
  };
}
