import { describe, expect, it } from "vitest";
import { assignSchedule } from "@/lib/agents/schedule";
import { Plan, PlanDraft, PlanDraftModule } from "@/lib/contracts";

function createDraftModule(
  courseId: string,
  overrides?: Partial<PlanDraftModule>
): PlanDraftModule {
  return {
    courseId,
    rationale: `Rationale for ${courseId}`,
    skillsCovered: ["skill-ts"],
    marketTag: "high_demand",
    ...overrides,
  };
}

function createDraft(
  modules: PlanDraftModule[],
  summary = "Draft curriculum summary"
): PlanDraft {
  return {
    summary,
    modules,
  };
}

describe("assignSchedule", () => {
  describe("weeks = ceil(hours / hoursPerWeek) with minimum 1", () => {
    it("assigns duration equal to exact hours / hoursPerWeek for single module on week boundary", () => {
      const draft = createDraft([createDraftModule("course-1")]);
      const hoursMap = new Map([["course-1", 20]]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      // 20 hours / 10 hoursPerWeek = 2 weeks
      expect(plan.modules[0].hours).toBe(20);
      expect(plan.modules[0].durationWeeks).toBe(2);
    });

    it("rounds up fractional weeks via ceil(hours / hoursPerWeek)", () => {
      const draft = createDraft([createDraftModule("course-1")]);
      const hoursMap = new Map([["course-1", 15]]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      // ceil(15 / 10) = 2 weeks
      expect(plan.modules[0].hours).toBe(15);
      expect(plan.modules[0].durationWeeks).toBe(2);
    });

    it("rounds up larger fractional spans (e.g. 25 hours at 10h/week -> 3 weeks)", () => {
      const draft = createDraft([createDraftModule("course-1")]);
      const hoursMap = new Map([["course-1", 25]]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      // ceil(25 / 10) = 3 weeks
      expect(plan.modules[0].hours).toBe(25);
      expect(plan.modules[0].durationWeeks).toBe(3);
    });

    it("enforces minimum of 1 week when hours < hoursPerWeek", () => {
      const draft = createDraft([createDraftModule("course-1")]);
      const hoursMap = new Map([["course-1", 3]]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      // ceil(3 / 10) = 1 with minimum 1
      expect(plan.modules[0].hours).toBe(3);
      expect(plan.modules[0].durationWeeks).toBe(1);
    });

    it("enforces minimum of 1 week when hours = 0", () => {
      const draft = createDraft([createDraftModule("course-1")]);
      const hoursMap = new Map([["course-1", 0]]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      // 0 hours -> endWeek = max(1, ceil(0)) = 1 -> durationWeeks = 1
      expect(plan.modules[0].hours).toBe(0);
      expect(plan.modules[0].durationWeeks).toBe(1);
    });

    it("satisfies PlanModule schema constraint durationWeeks >= 1", () => {
      const draft = createDraft([
        createDraftModule("course-zero"),
        createDraftModule("course-tiny"),
      ]);
      const hoursMap = new Map([
        ["course-zero", 0],
        ["course-tiny", 2],
      ]);
      const plan = assignSchedule(draft, hoursMap, 10);

      for (const m of plan.modules) {
        expect(m.durationWeeks).toBeGreaterThanOrEqual(1);
      }
      expect(() => Plan.parse(plan)).not.toThrow();
    });
  });

  describe("cumulative startWeek", () => {
    it("starts the first module at week 1", () => {
      const draft = createDraft([createDraftModule("course-1")]);
      const hoursMap = new Map([["course-1", 20]]);
      const plan = assignSchedule(draft, hoursMap, 10);

      expect(plan.modules[0].startWeek).toBe(1);
    });

    it("advances startWeek cumulatively when courses fall cleanly on week boundaries", () => {
      const draft = createDraft([
        createDraftModule("course-1"),
        createDraftModule("course-2"),
        createDraftModule("course-3"),
      ]);
      const hoursMap = new Map([
        ["course-1", 20], // 2 weeks (weeks 1-2), cumBefore for next = 20
        ["course-2", 10], // 1 week  (week 3),   cumBefore for next = 30
        ["course-3", 30], // 3 weeks (weeks 4-6), cumBefore for next = 60
      ]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      // Module 1: cumBefore = 0  -> startWeek = floor(0/10) + 1 = 1, duration = 2
      expect(plan.modules[0].startWeek).toBe(1);
      expect(plan.modules[0].durationWeeks).toBe(2);

      // Module 2: cumBefore = 20 -> startWeek = floor(20/10) + 1 = 3, duration = 1
      expect(plan.modules[1].startWeek).toBe(3);
      expect(plan.modules[1].durationWeeks).toBe(1);

      // Module 3: cumBefore = 30 -> startWeek = floor(30/10) + 1 = 4, duration = 3
      expect(plan.modules[2].startWeek).toBe(4);
      expect(plan.modules[2].durationWeeks).toBe(3);
    });

    it("advances startWeek cumulatively with fractional week boundaries", () => {
      const draft = createDraft([
        createDraftModule("course-1"),
        createDraftModule("course-2"),
        createDraftModule("course-3"),
      ]);
      const hoursMap = new Map([
        ["course-1", 15], // cumBefore=0,  cumAfter=15 -> startWeek=1, endWeek=2 (duration=2)
        ["course-2", 15], // cumBefore=15, cumAfter=30 -> startWeek=floor(15/10)+1=2, endWeek=3 (duration=2)
        ["course-3", 10], // cumBefore=30, cumAfter=40 -> startWeek=floor(30/10)+1=4, endWeek=4 (duration=1)
      ]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      expect(plan.modules[0].startWeek).toBe(1);
      expect(plan.modules[0].durationWeeks).toBe(2);

      expect(plan.modules[1].startWeek).toBe(2);
      expect(plan.modules[1].durationWeeks).toBe(2);

      expect(plan.modules[2].startWeek).toBe(4);
      expect(plan.modules[2].durationWeeks).toBe(1);
    });

    it("ensures startWeek is monotonically non-decreasing", () => {
      const draft = createDraft([
        createDraftModule("c1"),
        createDraftModule("c2"),
        createDraftModule("c3"),
        createDraftModule("c4"),
      ]);
      const hoursMap = new Map([
        ["c1", 8],
        ["c2", 6],
        ["c3", 12],
        ["c4", 4],
      ]);
      const plan = assignSchedule(draft, hoursMap, 10);

      for (let i = 1; i < plan.modules.length; i++) {
        expect(plan.modules[i].startWeek).toBeGreaterThanOrEqual(
          plan.modules[i - 1].startWeek
        );
      }
    });
  });

  describe("totalHours and weeksTotal", () => {
    it("sums totalHours across all modules accurately", () => {
      const draft = createDraft([
        createDraftModule("course-1"),
        createDraftModule("course-2"),
        createDraftModule("course-3"),
      ]);
      const hoursMap = new Map([
        ["course-1", 12],
        ["course-2", 18],
        ["course-3", 15],
      ]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      expect(plan.totalHours).toBe(45);
      // ceil(45 / 10) = 5
      expect(plan.weeksTotal).toBe(5);
    });

    it("computes weeksTotal as exact integer when totalHours divides cleanly", () => {
      const draft = createDraft([
        createDraftModule("course-1"),
        createDraftModule("course-2"),
      ]);
      const hoursMap = new Map([
        ["course-1", 20],
        ["course-2", 20],
      ]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      expect(plan.totalHours).toBe(40);
      expect(plan.weeksTotal).toBe(4);
    });

    it("computes weeksTotal rounding up when totalHours has a remainder", () => {
      const draft = createDraft([
        createDraftModule("course-1"),
        createDraftModule("course-2"),
      ]);
      const hoursMap = new Map([
        ["course-1", 10],
        ["course-2", 1],
      ]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      expect(plan.totalHours).toBe(11);
      // ceil(11 / 10) = 2
      expect(plan.weeksTotal).toBe(2);
    });

    it("enforces weeksTotal minimum of 1 when totalHours is 0", () => {
      const draft = createDraft([createDraftModule("course-1")]);
      const hoursMap = new Map([["course-1", 0]]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      expect(plan.totalHours).toBe(0);
      expect(plan.weeksTotal).toBe(1);
    });

    it("preserves draft summary and assigns 1-indexed order to modules", () => {
      const draft = createDraft(
        [
          createDraftModule("course-1"),
          createDraftModule("course-2"),
          createDraftModule("course-3"),
        ],
        "Custom Plan Summary"
      );
      const hoursMap = new Map([
        ["course-1", 10],
        ["course-2", 10],
        ["course-3", 10],
      ]);

      const plan = assignSchedule(draft, hoursMap, 10);

      expect(plan.summary).toBe("Custom Plan Summary");
      expect(plan.modules.map((m) => m.order)).toEqual([1, 2, 3]);
      expect(() => Plan.parse(plan)).not.toThrow();
    });
  });

  describe("an unknown course id (hours 0)", () => {
    it("assigns 0 hours when courseId is not in hoursByCourseId map", () => {
      const draft = createDraft([createDraftModule("unknown-course")]);
      const hoursMap = new Map<string, number>(); // empty map
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      expect(plan.modules[0].hours).toBe(0);
      expect(plan.modules[0].durationWeeks).toBe(1);
      expect(plan.modules[0].startWeek).toBe(1);
      expect(plan.totalHours).toBe(0);
      expect(plan.weeksTotal).toBe(1);
    });

    it("does not advance cumulative hours when encountering an unknown course in a mixed plan", () => {
      const draft = createDraft([
        createDraftModule("known-1"),
        createDraftModule("unknown-course"),
        createDraftModule("known-2"),
      ]);
      const hoursMap = new Map([
        ["known-1", 20],
        // unknown-course is missing from map
        ["known-2", 10],
      ]);
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      // known-1: 20 hrs -> startWeek 1, duration 2, cumBefore advances to 20
      expect(plan.modules[0].courseId).toBe("known-1");
      expect(plan.modules[0].hours).toBe(20);
      expect(plan.modules[0].startWeek).toBe(1);
      expect(plan.modules[0].durationWeeks).toBe(2);

      // unknown-course: 0 hrs -> cumBefore is 20, startWeek = floor(20/10) + 1 = 3, duration = 1, cumBefore stays 20
      expect(plan.modules[1].courseId).toBe("unknown-course");
      expect(plan.modules[1].hours).toBe(0);
      expect(plan.modules[1].startWeek).toBe(3);
      expect(plan.modules[1].durationWeeks).toBe(1);

      // known-2: 10 hrs -> cumBefore is still 20! startWeek = floor(20/10) + 1 = 3, duration = 1
      expect(plan.modules[2].courseId).toBe("known-2");
      expect(plan.modules[2].hours).toBe(10);
      expect(plan.modules[2].startWeek).toBe(3);
      expect(plan.modules[2].durationWeeks).toBe(1);

      // totalHours only counts known courses (20 + 0 + 10 = 30)
      expect(plan.totalHours).toBe(30);
      expect(plan.weeksTotal).toBe(3);
    });

    it("handles all courses being unknown gracefully", () => {
      const draft = createDraft([
        createDraftModule("unknown-1"),
        createDraftModule("unknown-2"),
      ]);
      const hoursMap = new Map<string, number>();
      const hoursPerWeek = 10;

      const plan = assignSchedule(draft, hoursMap, hoursPerWeek);

      expect(plan.totalHours).toBe(0);
      expect(plan.weeksTotal).toBe(1);
      expect(plan.modules[0].hours).toBe(0);
      expect(plan.modules[0].startWeek).toBe(1);
      expect(plan.modules[0].durationWeeks).toBe(1);
      expect(plan.modules[1].hours).toBe(0);
      expect(plan.modules[1].startWeek).toBe(1);
      expect(plan.modules[1].durationWeeks).toBe(1);
      expect(() => Plan.parse(plan)).not.toThrow();
    });
  });
});
