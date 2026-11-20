import fs from "node:fs";
import path from "node:path";

interface Issue {
  type: "ERROR" | "WARN";
  file: string;
  id: string;
  message: string;
}

interface Course {
  id: string;
  title?: string;
  provider?: string;
  url?: string;
  skills?: string[];
  level?: string;
  durationHrs?: number;
  prerequisites?: string[];
  description?: string;
}

interface Job {
  id: string;
  role?: string;
  title?: string;
  skills?: string[];
  description?: string;
  postedAt?: string;
  source?: string;
}

const VALID_LEVELS = new Set(["beginner", "intermediate", "advanced"]);

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(repoRoot, "data");

  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  function reportError(file: string, id: string, message: string) {
    errors.push({ type: "ERROR", file, id, message });
  }

  function reportWarn(file: string, id: string, message: string) {
    warnings.push({ type: "WARN", file, id, message });
  }

  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found at ${dataDir}`);
    process.exit(1);
  }

  // 1. Load vocabulary
  const skillsFilePath = path.join(dataDir, "skills.json");
  const skillsRelPath = path.relative(repoRoot, skillsFilePath);
  let vocabSkills: Set<string> = new Set();

  if (!fs.existsSync(skillsFilePath)) {
    reportError(skillsRelPath, "skills.json", "skills.json file not found");
  } else {
    try {
      const skillsContent = fs.readFileSync(skillsFilePath, "utf8");
      const parsed = JSON.parse(skillsContent);
      if (Array.isArray(parsed)) {
        vocabSkills = new Set(parsed);
      } else {
        reportError(skillsRelPath, "skills.json", "skills.json must contain a JSON array of strings");
      }
    } catch (err) {
      reportError(skillsRelPath, "skills.json", `Failed to parse skills.json: ${err}`);
    }
  }

  // Find all course and job files
  const allFiles = fs.readdirSync(dataDir).sort();
  const courseFiles = allFiles.filter((f) => /^courses-.*\.json$/.test(f));
  const jobFiles = allFiles.filter((f) => /^jobs-.*\.json$/.test(f));

  // 2. Load and inspect courses
  const loadedCourses: Array<{ course: Course; file: string }> = [];
  const courseIdToFirstFile = new Map<string, string>();
  const courseSkillsUsed = new Set<string>();

  for (const fileName of courseFiles) {
    const fullPath = path.join(dataDir, fileName);
    const relPath = path.relative(repoRoot, fullPath);

    let coursesInFile: Course[] = [];
    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        coursesInFile = parsed;
      } else {
        reportError(relPath, fileName, "Course file content is not an array");
        continue;
      }
    } catch (err) {
      reportError(relPath, fileName, `Failed to parse course file: ${err}`);
      continue;
    }

    for (const course of coursesInFile) {
      const courseId = course.id;
      if (!courseId || typeof courseId !== "string") {
        reportError(relPath, "unknown", "Course is missing a valid 'id' property");
        continue;
      }

      // Check duplicate course id
      if (courseIdToFirstFile.has(courseId)) {
        reportError(
          relPath,
          courseId,
          `Duplicate course id: "${courseId}" (already defined in ${courseIdToFirstFile.get(courseId)})`
        );
      } else {
        courseIdToFirstFile.set(courseId, relPath);
      }

      loadedCourses.push({ course, file: relPath });

      // Check skills
      if (!Array.isArray(course.skills)) {
        reportError(relPath, courseId, "Course is missing 'skills' array");
      } else {
        for (const skill of course.skills) {
          courseSkillsUsed.add(skill);
          if (!vocabSkills.has(skill)) {
            reportError(relPath, courseId, `Skill "${skill}" is not in the skills vocabulary`);
          }
        }
      }

      // Check level
      if (!course.level || !VALID_LEVELS.has(course.level)) {
        reportError(
          relPath,
          courseId,
          `Invalid level "${course.level}". Valid levels: ${Array.from(VALID_LEVELS).join(", ")}`
        );
      }

      // Check durationHrs between 2 and 60
      if (
        typeof course.durationHrs !== "number" ||
        Number.isNaN(course.durationHrs) ||
        course.durationHrs < 2 ||
        course.durationHrs > 60
      ) {
        reportError(
          relPath,
          courseId,
          `Invalid durationHrs: ${course.durationHrs}. Must be between 2 and 60`
        );
      }
    }
  }

  // 3. Load and inspect jobs
  const loadedJobs: Array<{ job: Job; file: string }> = [];
  const jobIdToFirstFile = new Map<string, string>();
  const jobSkillsUsed = new Set<string>();

  for (const fileName of jobFiles) {
    const fullPath = path.join(dataDir, fileName);
    const relPath = path.relative(repoRoot, fullPath);

    let jobsInFile: Job[] = [];
    try {
      const raw = fs.readFileSync(fullPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        jobsInFile = parsed;
      } else {
        reportError(relPath, fileName, "Job file content is not an array");
        continue;
      }
    } catch (err) {
      reportError(relPath, fileName, `Failed to parse job file: ${err}`);
      continue;
    }

    for (const job of jobsInFile) {
      const jobId = job.id;
      if (!jobId || typeof jobId !== "string") {
        reportError(relPath, "unknown", "Job is missing a valid 'id' property");
        continue;
      }

      // Check duplicate job id
      if (jobIdToFirstFile.has(jobId)) {
        reportError(
          relPath,
          jobId,
          `Duplicate job id: "${jobId}" (already defined in ${jobIdToFirstFile.get(jobId)})`
        );
      } else {
        jobIdToFirstFile.set(jobId, relPath);
      }

      // Check cross-entity duplicate id with courses
      if (courseIdToFirstFile.has(jobId)) {
        reportError(
          relPath,
          jobId,
          `Duplicate ID: "${jobId}" is used for both a course (in ${courseIdToFirstFile.get(jobId)}) and a job`
        );
      }

      loadedJobs.push({ job, file: relPath });

      // Check skills
      if (!Array.isArray(job.skills)) {
        reportError(relPath, jobId, "Job is missing 'skills' array");
      } else {
        for (const skill of job.skills) {
          jobSkillsUsed.add(skill);
          if (!vocabSkills.has(skill)) {
            reportError(relPath, jobId, `Skill "${skill}" is not in the skills vocabulary`);
          }
        }
      }

      // Check postedAt parses as a date
      if (!job.postedAt || typeof job.postedAt !== "string" || Number.isNaN(Date.parse(job.postedAt))) {
        reportError(
          relPath,
          jobId,
          `Invalid postedAt date: "${job.postedAt}". Must parse as a valid date`
        );
      }
    }
  }

  // 4. Combined course checks: counts, prerequisites, cycles
  const totalCourses = loadedCourses.length;
  if (totalCourses !== 200) {
    reportError("data/courses-*.json", "course-count", `Expected 200 courses, found ${totalCourses}`);
  }

  const totalJobs = loadedJobs.length;
  if (totalJobs !== 120) {
    reportError("data/jobs-*.json", "job-count", `Expected 120 jobs, found ${totalJobs}`);
  }

  // Combined set of all course ids
  const combinedCourseIds = new Set(courseIdToFirstFile.keys());
  const courseMap = new Map<string, { course: Course; file: string }>();
  for (const item of loadedCourses) {
    // Keep first definition in case of duplicates
    if (!courseMap.has(item.course.id)) {
      courseMap.set(item.course.id, item);
    }
  }

  // Check prerequisites existence and self-reference
  for (const { course, file } of loadedCourses) {
    const prereqs = course.prerequisites || [];
    if (!Array.isArray(prereqs)) {
      reportError(file, course.id, "'prerequisites' must be an array of course IDs");
      continue;
    }

    // Check self-reference
    if (prereqs.includes(course.id)) {
      reportError(file, course.id, "Course lists itself as a prerequisite");
    }

    // Check every prerequisite exists
    for (const prereqId of prereqs) {
      if (!combinedCourseIds.has(prereqId)) {
        reportError(
          file,
          course.id,
          `Prerequisite course ID "${prereqId}" does not exist in the combined course set`
        );
      }
    }
  }

  // Cycle detection on prerequisite graph
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const detectedCycles = new Set<string>();

  function dfs(courseId: string) {
    visited.add(courseId);
    inStack.add(courseId);
    stack.push(courseId);

    const item = courseMap.get(courseId);
    const prereqs = item?.course.prerequisites || [];

    for (const prereqId of prereqs) {
      if (!combinedCourseIds.has(prereqId) || prereqId === courseId) {
        continue;
      }

      if (inStack.has(prereqId)) {
        const cycleStartIndex = stack.indexOf(prereqId);
        const cycleNodes = stack.slice(cycleStartIndex);
        cycleNodes.push(prereqId);

        // Canonical string to avoid reporting rotations of the same cycle
        const core = cycleNodes.slice(0, -1);
        const minIdx = core.reduce((min, val, idx, arr) => (val < arr[min] ? idx : min), 0);
        const canonicalKey = [...core.slice(minIdx), ...core.slice(0, minIdx)].join("->");

        if (!detectedCycles.has(canonicalKey)) {
          detectedCycles.add(canonicalKey);
          const file = item?.file ?? "unknown";
          reportError(file, courseId, `Prerequisite cycle detected: ${cycleNodes.join(" -> ")}`);
        }
      } else if (!visited.has(prereqId)) {
        dfs(prereqId);
      }
    }

    stack.pop();
    inStack.delete(courseId);
  }

  for (const courseId of courseMap.keys()) {
    if (!visited.has(courseId)) {
      dfs(courseId);
    }
  }

  // 5. WARN (not fail) for vocabulary skills that appear in no course or no job
  for (const skill of vocabSkills) {
    if (!courseSkillsUsed.has(skill)) {
      reportWarn(skillsRelPath, skill, "Vocabulary skill does not appear in any course");
    }
    if (!jobSkillsUsed.has(skill)) {
      reportWarn(skillsRelPath, skill, "Vocabulary skill does not appear in any job");
    }
  }

  // 6. Print results
  for (const warn of warnings) {
    console.warn(`WARN  [${warn.file}] [${warn.id}]: ${warn.message}`);
  }

  for (const err of errors) {
    console.error(`ERROR [${err.file}] [${err.id}]: ${err.message}`);
  }

  console.log("\n--- Validation Summary ---");
  console.log(`Courses evaluated: ${loadedCourses.length}`);
  console.log(`Jobs evaluated:    ${loadedJobs.length}`);
  console.log(`Vocabulary skills: ${vocabSkills.size}`);
  console.log(`Errors found:      ${errors.length}`);
  console.log(`Warnings found:    ${warnings.length}`);

  if (errors.length > 0) {
    console.error(`\nValidation FAILED with ${errors.length} error(s).`);
    process.exit(1);
  } else {
    console.log(`\nValidation PASSED with 0 errors and ${warnings.length} warning(s).`);
    process.exit(0);
  }
}

main();
