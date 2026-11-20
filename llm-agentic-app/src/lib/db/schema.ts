import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const learners = pgTable("learners", {
  id: uuid("id").primaryKey(),
  goal: text("goal"),
  hoursPerWeek: integer("hours_per_week"),
  profileJson: jsonb("profile_json"),
  profileEmbedding: vector("profile_embedding", { dimensions: 768 }),
  lastReplanAt: timestamp("last_replan_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const courses = pgTable(
  "courses",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    provider: text("provider").notNull(),
    url: text("url").notNull(),
    skills: text("skills").array().notNull(),
    level: text("level").notNull(),
    durationHrs: real("duration_hrs").notNull(),
    prerequisites: text("prerequisites").array(),
    description: text("description"),
    embedding: vector("embedding", { dimensions: 768 }),
  },
  (table) => [
    index("courses_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

export const jobPostings = pgTable(
  "job_postings",
  {
    id: text("id").primaryKey(),
    role: text("role"),
    title: text("title"),
    skills: text("skills").array(),
    description: text("description"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    source: text("source"),
    embedding: vector("embedding", { dimensions: 768 }),
  },
  (table) => [
    index("job_postings_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

export const skillTrends = pgTable(
  "skill_trends",
  {
    id: serial("id").primaryKey(),
    skill: text("skill").notNull(),
    demandScore: real("demand_score").notNull(),
    delta: real("delta").notNull(),
    period: timestamp("period", { withTimezone: true })
      .defaultNow()
      .notNull(),
    source: text("source"),
  },
  (table) => [
    index("skill_trends_skill_period_idx").on(table.skill, table.period),
  ]
);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    learnerId: uuid("learner_id")
      .references(() => learners.id)
      .notNull(),
    version: integer("version").notNull(),
    modulesJson: jsonb("modules_json"),
    summary: text("summary"),
    criticReportJson: jsonb("critic_report_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("plans_learner_id_version_unique").on(
      table.learnerId,
      table.version
    ),
  ]
);

export const progressEvents = pgTable("progress_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  learnerId: uuid("learner_id")
    .references(() => learners.id)
    .notNull(),
  courseId: text("course_id").notNull(),
  type: text("type").notNull(),
  score: real("score"),
  rating: text("rating"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const replanLog = pgTable("replan_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  learnerId: uuid("learner_id")
    .references(() => learners.id)
    .notNull(),
  planFrom: uuid("plan_from"),
  planTo: uuid("plan_to").notNull(),
  trigger: text("trigger").notNull(),
  diffJson: jsonb("diff_json"),
  reason: text("reason"),
  seenAt: timestamp("seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
