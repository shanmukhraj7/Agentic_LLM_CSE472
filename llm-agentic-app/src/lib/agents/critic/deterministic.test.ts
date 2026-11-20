import { describe, expect, it } from "vitest";
import {
  runDeterministicChecks,
  type CourseLite,
} from "./deterministic";
import type { Plan, PlanModule, Profile, SkillGap } from "@/lib/contracts";

function createProfile(overrides?: Partial<Profile>): Profile {
  return {
    currentRole: "Junior Developer",
    targetRole: "Full Stack Engineer",
    yearsExperience: 2,
    skills: [{ name: "JavaScript", level: "intermediate" }],
    hoursPerWeek: 10,
    goalSummary: "Upskill to Full Stack Engineer",
    ...overrides,
  };
}

function createCourse(overrides?: Partial<CourseLite>): CourseLite {
  return {
    id: "course-ts",
    level: "beginner",
    skills: ["TypeScript"],
    prerequisites: [],
    durationHrs: 20,
    ...overrides,
  };
}

function createPlanModule(overrides?: Partial<PlanModule>): PlanModule {
  return {
    courseId: "course-ts",
    rationale: "Learn foundational TypeScript concepts",
    skillsCovered: ["TypeScript"],
    marketTag: "high_demand",
    order: 1,
    hours: 20,
    startWeek: 1,
    durationWeeks: 2,
    ...overrides,
  };
}

function createPlan(overrides?: Partial<Plan>): Plan {
  return {
    summary: "Personalized upskilling curriculum",
    totalHours: 20,
    weeksTotal: 2,
    modules: [createPlanModule()],
    ...overrides,
  };
}

describe("runDeterministicChecks", () => {
  it("asserts an empty issue list for a valid plan (happy path)", () => {
    const profile = createProfile();
    const course = createCourse();
    const courses = new Map<string, CourseLite>([[course.id, course]]);
    const gaps: SkillGap[] = [
      {
        skill: "TypeScript",
        importance: 0.9,
        currentLevel: "none",
        demandScore: 85,
        delta: 1,
      },
    ];
    const plan = createPlan({
      modules: [
        createPlanModule({
          courseId: course.id,
          skillsCovered: ["TypeScript"],
        }),
      ],
      weeksTotal: 2,
      totalHours: 20,
    });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps,
      courses,
      completedCourseIds: new Set(),
    });

    expect(issues).toEqual([]);
  });

  it("raises EMPTY_PLAN when the plan contains no modules", () => {
    const profile = createProfile();
    const plan = createPlan({ modules: [] });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps: [],
      courses: new Map(),
      completedCourseIds: new Set(),
    });

    expect(issues.some((issue) => issue.code === "EMPTY_PLAN")).toBe(true);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("EMPTY_PLAN");
  });

  it("raises UNKNOWN_COURSE when a module references a course not in the catalog", () => {
    const profile = createProfile();
    const plan = createPlan({
      modules: [
        createPlanModule({
          courseId: "unknown-course-id",
          skillsCovered: [],
        }),
      ],
    });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps: [],
      courses: new Map(), // empty catalog
      completedCourseIds: new Set(),
    });

    expect(issues.some((issue) => issue.code === "UNKNOWN_COURSE")).toBe(true);
    const unknownIssue = issues.find((issue) => issue.code === "UNKNOWN_COURSE");
    expect(unknownIssue?.courseId).toBe("unknown-course-id");
  });

  it("raises DUPLICATE_COURSE when a course appears more than once in the plan", () => {
    const profile = createProfile();
    const course = createCourse({ id: "course-duplicate" });
    const courses = new Map<string, CourseLite>([[course.id, course]]);
    const plan = createPlan({
      modules: [
        createPlanModule({
          order: 1,
          courseId: "course-duplicate",
          skillsCovered: ["TypeScript"],
        }),
        createPlanModule({
          order: 2,
          courseId: "course-duplicate",
          skillsCovered: ["TypeScript"],
        }),
      ],
    });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps: [],
      courses,
      completedCourseIds: new Set(),
    });

    expect(issues.some((issue) => issue.code === "DUPLICATE_COURSE")).toBe(true);
    const dupIssue = issues.find((issue) => issue.code === "DUPLICATE_COURSE");
    expect(dupIssue?.courseId).toBe("course-duplicate");
  });

  it("raises PREREQ_ORDER when a prerequisite is scheduled after the module needing it", () => {
    const profile = createProfile();
    const prereqCourse = createCourse({
      id: "course-prereq",
      skills: ["TypeScript"],
      prerequisites: [],
    });
    const advancedCourse = createCourse({
      id: "course-adv",
      skills: ["TypeScript"],
      prerequisites: ["course-prereq"],
    });
    const courses = new Map<string, CourseLite>([
      [prereqCourse.id, prereqCourse],
      [advancedCourse.id, advancedCourse],
    ]);

    // Scheduled in inverted order: advancedCourse before prereqCourse
    const plan = createPlan({
      modules: [
        createPlanModule({
          order: 1,
          courseId: "course-adv",
          skillsCovered: ["TypeScript"],
        }),
        createPlanModule({
          order: 2,
          courseId: "course-prereq",
          skillsCovered: ["TypeScript"],
        }),
      ],
    });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps: [],
      courses,
      completedCourseIds: new Set(),
    });

    expect(issues.some((issue) => issue.code === "PREREQ_ORDER")).toBe(true);
    const orderIssue = issues.find((issue) => issue.code === "PREREQ_ORDER");
    expect(orderIssue?.courseId).toBe("course-adv");
  });

  it("raises PREREQ_MISSING when a prerequisite is neither in the plan nor completed", () => {
    const profile = createProfile();
    const courseWithPrereq = createCourse({
      id: "course-with-missing-prereq",
      skills: ["TypeScript"],
      prerequisites: ["missing-prereq-course"],
    });
    const courses = new Map<string, CourseLite>([
      [courseWithPrereq.id, courseWithPrereq],
    ]);

    const plan = createPlan({
      modules: [
        createPlanModule({
          order: 1,
          courseId: "course-with-missing-prereq",
          skillsCovered: ["TypeScript"],
        }),
      ],
    });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps: [],
      courses,
      completedCourseIds: new Set(),
    });

    expect(issues.some((issue) => issue.code === "PREREQ_MISSING")).toBe(true);
    const missingIssue = issues.find((issue) => issue.code === "PREREQ_MISSING");
    expect(missingIssue?.courseId).toBe("course-with-missing-prereq");
  });

  it("does not raise PREREQ_MISSING when a prerequisite is in completedCourseIds", () => {
    const profile = createProfile();
    const courseWithPrereq = createCourse({
      id: "course-advanced-react",
      skills: ["React"],
      prerequisites: ["completed-intro-react"],
    });
    const completedCourse = createCourse({
      id: "completed-intro-react",
      skills: ["React"],
      prerequisites: [],
    });
    const courses = new Map<string, CourseLite>([
      [courseWithPrereq.id, courseWithPrereq],
      [completedCourse.id, completedCourse],
    ]);

    const plan = createPlan({
      modules: [
        createPlanModule({
          order: 1,
          courseId: "course-advanced-react",
          skillsCovered: ["React"],
        }),
      ],
    });

    const gaps: SkillGap[] = [
      {
        skill: "React",
        importance: 0.9,
        currentLevel: "beginner",
        demandScore: 90,
        delta: 1,
      },
    ];

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps,
      courses,
      completedCourseIds: new Set(["completed-intro-react"]),
    });

    expect(issues.some((issue) => issue.code === "PREREQ_MISSING")).toBe(false);
    expect(issues).toEqual([]);
  });

  it("raises TOO_LONG when total duration exceeds 52 weeks", () => {
    const profile = createProfile();
    const course = createCourse();
    const courses = new Map<string, CourseLite>([[course.id, course]]);
    const plan = createPlan({
      weeksTotal: 53,
      modules: [
        createPlanModule({
          courseId: course.id,
          skillsCovered: ["TypeScript"],
        }),
      ],
    });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps: [],
      courses,
      completedCourseIds: new Set(),
    });

    expect(issues.some((issue) => issue.code === "TOO_LONG")).toBe(true);
  });

  it("raises TOO_MANY_MODULES when plan contains more than 12 modules", () => {
    const profile = createProfile();
    const courses = new Map<string, CourseLite>();
    const modules: PlanModule[] = [];

    for (let i = 1; i <= 13; i++) {
      const id = `course-${i}`;
      courses.set(id, createCourse({ id, skills: ["TypeScript"] }));
      modules.push(
        createPlanModule({
          order: i,
          courseId: id,
          skillsCovered: ["TypeScript"],
        })
      );
    }

    const plan = createPlan({
      weeksTotal: 13,
      modules,
    });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps: [],
      courses,
      completedCourseIds: new Set(),
    });

    expect(issues.some((issue) => issue.code === "TOO_MANY_MODULES")).toBe(true);
  });

  it("raises GAP_UNCOVERED when a top-3 high-importance skill gap is not covered", () => {
    const profile = createProfile();
    const course = createCourse({ skills: ["TypeScript"] });
    const courses = new Map<string, CourseLite>([[course.id, course]]);

    const gaps: SkillGap[] = [
      {
        skill: "Rust",
        importance: 0.95,
        currentLevel: "none",
        demandScore: 90,
        delta: 2,
      },
      {
        skill: "TypeScript",
        importance: 0.8,
        currentLevel: "none",
        demandScore: 80,
        delta: 1,
      },
    ];

    const plan = createPlan({
      modules: [
        createPlanModule({
          courseId: course.id,
          skillsCovered: ["TypeScript"],
        }),
      ],
    });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps,
      courses,
      completedCourseIds: new Set(),
    });

    expect(issues.some((issue) => issue.code === "GAP_UNCOVERED")).toBe(true);
    const gapIssue = issues.find((issue) => issue.code === "GAP_UNCOVERED");
    expect(gapIssue?.message).toContain("Rust");
  });

  it("raises LEVEL_REGRESSION when a later module has a lower level than an earlier one for the same skill", () => {
    const profile = createProfile();
    const advancedCourse = createCourse({
      id: "course-adv",
      level: "advanced",
      skills: ["Python"],
    });
    const beginnerCourse = createCourse({
      id: "course-beg",
      level: "beginner",
      skills: ["Python"],
    });

    const courses = new Map<string, CourseLite>([
      [advancedCourse.id, advancedCourse],
      [beginnerCourse.id, beginnerCourse],
    ]);

    const plan = createPlan({
      modules: [
        createPlanModule({
          order: 1,
          courseId: "course-adv",
          skillsCovered: ["Python"],
        }),
        createPlanModule({
          order: 2,
          courseId: "course-beg",
          skillsCovered: ["Python"],
        }),
      ],
    });

    const issues = runDeterministicChecks({
      plan,
      profile,
      gaps: [],
      courses,
      completedCourseIds: new Set(),
    });

    expect(issues.some((issue) => issue.code === "LEVEL_REGRESSION")).toBe(true);
    const regressionIssue = issues.find(
      (issue) => issue.code === "LEVEL_REGRESSION"
    );
    expect(regressionIssue?.courseId).toBe("course-beg");
  });
});
