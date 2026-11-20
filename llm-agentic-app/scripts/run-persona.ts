import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildProfile } from "@/lib/agents/profiler";
import { createPlan, type StatusStage } from "@/lib/agents/orchestrate";
import { client } from "@/lib/db/client";
import { getCoursesByIds } from "@/lib/rag/searchCourses";

interface Persona {
  name: string;
  goalText: string;
  hoursPerWeek: number;
}

function loadPersonas(): Persona[] {
  const filePath = path.resolve(process.cwd(), "data/personas.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Personas file not found at ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(content);
  if (Array.isArray(data)) {
    return data;
  }
  if (typeof data === "object" && data !== null) {
    return Object.values(data);
  }
  throw new Error("Invalid personas.json format: expected an array or object of personas");
}

function getPersonaName(): string | undefined {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith("--name=")) {
      return arg.split("=")[1]?.trim();
    }
    if (arg.startsWith("--persona=")) {
      return arg.split("=")[1]?.trim();
    }
    if (!arg.startsWith("-")) {
      return arg.trim();
    }
  }
  return undefined;
}

async function main() {
  const personas = loadPersonas();
  const availableNames = personas.map((p) => p.name).join(", ");
  const personaName = getPersonaName();

  if (!personaName) {
    console.error("Error: Persona name is required.");
    console.error("Usage: npm run persona <name>");
    console.error(`Available personas: ${availableNames}`);
    process.exitCode = 1;
    return;
  }

  const persona = personas.find(
    (p) => p.name.toLowerCase() === personaName.toLowerCase()
  );

  if (!persona) {
    console.error(`Error: Persona "${personaName}" not found.`);
    console.error(`Available personas: ${availableNames}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Running persona: "${persona.name}"`);
  console.log(`Goal: ${persona.goalText}`);
  console.log(`Hours per week: ${persona.hoursPerWeek}`);

  const startTime = Date.now();

  console.log("\nBuilding profile...");
  const profile = await buildProfile({
    goalText: persona.goalText,
    hoursPerWeek: persona.hoursPerWeek,
  });

  console.log("\n=== Skills Found ===");
  if (!profile.skills || profile.skills.length === 0) {
    console.log("No skills found.");
  } else {
    for (const skill of profile.skills) {
      console.log(`- ${skill.name} (${skill.level})`);
    }
  }

  const learnerId = crypto.randomUUID();
  console.log(`\nGenerating plan for learnerId: ${learnerId}...`);

  const { plan, criticReport } = await createPlan(
    {
      learnerId,
      profile,
    },
    (stage: StatusStage) => {
      console.log(`[Status] ${stage}`);
    }
  );

  const courseIds = plan.modules.map((m) => m.courseId);
  const dbCourses = await getCoursesByIds(courseIds);
  const courseMap = new Map(dbCourses.map((c) => [c.id, c]));

  console.log("\n=== Plan Modules ===");
  for (const mod of plan.modules) {
    const course = courseMap.get(mod.courseId);
    const title = course ? course.title : "Unknown Title";
    const level = course ? course.level : "unknown";
    console.log(
      `Order: ${mod.order} | Title: "${title}" | Level: ${level} | Hours: ${mod.hours} | Weeks: ${mod.durationWeeks}`
    );
  }

  console.log("\n=== Critic Report ===");
  console.log(JSON.stringify(criticReport, null, 2));

  const elapsedMs = Date.now() - startTime;
  console.log(`\nElapsed time: ${(elapsedMs / 1000).toFixed(2)}s (${elapsedMs}ms)`);
}

main()
  .catch((err) => {
    console.error("Run persona failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
