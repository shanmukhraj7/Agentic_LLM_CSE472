import crypto from "node:crypto";
import { createPlan, type StatusStage } from "@/lib/agents/orchestrate";
import { type Profile } from "@/lib/contracts";
import { client } from "@/lib/db/client";
import { getCoursesByIds } from "@/lib/rag/searchCourses";

async function main() {
  const profile: Profile = {
    currentRole: "Retail associate",
    targetRole: "Data Analyst",
    yearsExperience: 2,
    skills: [
      { name: "customer success", level: "beginner" },
      { name: "problem solving", level: "beginner" },
      { name: "presentation skills", level: "beginner" },
    ],
    hoursPerWeek: 8,
    goalSummary: "Transition from retail associate to an entry-level data analyst.",
  };

  const learnerId = crypto.randomUUID();
  const startTime = Date.now();

  console.log(`Starting plan generation for learner ${learnerId}...`);

  const { plan, criticReport } = await createPlan(
    {
      learnerId,
      profile,
    },
    (stage: StatusStage) => {
      console.log(`[Status] ${stage}`);
    }
  );

  const elapsedMs = Date.now() - startTime;

  const courseIds = plan.modules.map((m) => m.courseId);
  const dbCourses = await getCoursesByIds(courseIds);
  const courseMap = new Map(dbCourses.map((c) => [c.id, c]));

  console.log("\n=== Plan Modules ===");
  for (const mod of plan.modules) {
    const course = courseMap.get(mod.courseId);
    if (!course) {
      throw new Error(`Course id ${mod.courseId} does not exist in database!`);
    }
    console.log(
      `Order: ${mod.order} | Title: "${course.title}" | Level: ${course.level} | Hours: ${mod.hours} | Weeks: ${mod.durationWeeks}`
    );
  }

  console.log("\n=== Critic Report ===");
  console.log(JSON.stringify(criticReport, null, 2));

  console.log(`\nElapsed: ${elapsedMs}ms`);
}

main()
  .catch((err) => {
    console.error("Test plan failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
