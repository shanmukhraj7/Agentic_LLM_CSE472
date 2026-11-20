import { describe, expect, it } from "vitest";
import { diffPlans } from "@/lib/services/diff";
import { Plan, PlanDiff, PlanModule } from "@/lib/contracts";

function createModule(
  courseId: string,
  order: number,
  overrides?: Partial<PlanModule>
): PlanModule {
  return {
    courseId,
    rationale: `Rationale for ${courseId}`,
    skillsCovered: ["skill-1"],
    marketTag: null,
    order,
    hours: 10,
    startWeek: order,
    durationWeeks: 1,
    ...overrides,
  };
}

function createPlan(modules: PlanModule[], summary = "Test plan"): Plan {
  return {
    summary,
    totalHours: modules.reduce((sum, m) => sum + m.hours, 0),
    weeksTotal: modules.length,
    modules,
  };
}

describe("diffPlans", () => {
  describe("added", () => {
    it("identifies a newly added course with its rationale from the next plan", () => {
      const prev = createPlan([createModule("course-a", 1)]);
      const next = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2, { rationale: "Learn Course B for backend" }),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.added).toEqual([
        {
          courseId: "course-b",
          rationale: "Learn Course B for backend",
        },
      ]);
      expect(diff.removed).toEqual([]);
      expect(diff.moved).toEqual([]);
      expect(diff.unchangedCount).toBe(1);
    });

    it("identifies multiple added courses preserving order from the next plan", () => {
      const prev = createPlan([createModule("course-a", 1)]);
      const next = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2, { rationale: "Rationale B" }),
        createModule("course-c", 3, { rationale: "Rationale C" }),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.added).toEqual([
        { courseId: "course-b", rationale: "Rationale B" },
        { courseId: "course-c", rationale: "Rationale C" },
      ]);
      expect(diff.removed).toEqual([]);
      expect(diff.unchangedCount).toBe(1);
    });

    it("handles adding modules when prev plan was empty", () => {
      const prev = createPlan([]);
      const next = createPlan([
        createModule("course-a", 1, { rationale: "Start with course A" }),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.added).toEqual([
        { courseId: "course-a", rationale: "Start with course A" },
      ]);
      expect(diff.removed).toEqual([]);
      expect(diff.moved).toEqual([]);
      expect(diff.unchangedCount).toBe(0);
    });
  });

  describe("removed", () => {
    it("identifies a removed course present in prev but absent in next", () => {
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
      ]);
      const next = createPlan([createModule("course-a", 1)]);

      const diff = diffPlans(prev, next);

      expect(diff.removed).toEqual([{ courseId: "course-b" }]);
      expect(diff.added).toEqual([]);
      expect(diff.moved).toEqual([]);
      expect(diff.unchangedCount).toBe(1);
    });

    it("identifies multiple removed courses", () => {
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
        createModule("course-c", 3),
      ]);
      const next = createPlan([createModule("course-b", 1)]);

      const diff = diffPlans(prev, next);

      expect(diff.removed).toEqual([
        { courseId: "course-a" },
        { courseId: "course-c" },
      ]);
      expect(diff.added).toEqual([]);
      expect(diff.moved).toEqual([]);
      expect(diff.unchangedCount).toBe(1);
    });

    it("handles removing all modules from prev", () => {
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
      ]);
      const next = createPlan([]);

      const diff = diffPlans(prev, next);

      expect(diff.removed).toEqual([
        { courseId: "course-a" },
        { courseId: "course-b" },
      ]);
      expect(diff.added).toEqual([]);
      expect(diff.moved).toEqual([]);
      expect(diff.unchangedCount).toBe(0);
    });
  });

  describe("moved (position among shared modules)", () => {
    it("detects swapped modules when relative order among shared modules changes", () => {
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
      ]);
      const next = createPlan([
        createModule("course-b", 1),
        createModule("course-a", 2),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.moved).toEqual([
        { courseId: "course-b", fromOrder: 2, toOrder: 1 },
        { courseId: "course-a", fromOrder: 1, toOrder: 2 },
      ]);
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
      expect(diff.unchangedCount).toBe(0);
    });

    it("does NOT mark shared modules as moved when an added module shifts absolute order but not shared position", () => {
      // In prev, shared order is [A, B] (orders 1, 2)
      // In next, shared order is still [A, B], but an added module X is inserted between them (orders 1, 2, 3)
      // B's absolute order changes from 2 to 3, but its relative position among shared modules is still index 1.
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
      ]);
      const next = createPlan([
        createModule("course-a", 1),
        createModule("course-new", 2, { rationale: "New inserted course" }),
        createModule("course-b", 3),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.moved).toEqual([]);
      expect(diff.added).toEqual([
        { courseId: "course-new", rationale: "New inserted course" },
      ]);
      expect(diff.removed).toEqual([]);
      expect(diff.unchangedCount).toBe(2);
    });

    it("does NOT mark shared modules as moved when a removed module shifts absolute order but not shared position", () => {
      // In prev: A (1), X (2), B (3). Shared modules between prev and next are [A, B].
      // In next: A (1), B (2).
      // Relative position of A (idx 0) and B (idx 1) among shared modules is unchanged.
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-removed", 2),
        createModule("course-b", 3),
      ]);
      const next = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.moved).toEqual([]);
      expect(diff.removed).toEqual([{ courseId: "course-removed" }]);
      expect(diff.added).toEqual([]);
      expect(diff.unchangedCount).toBe(2);
    });

    it("detects partially moved modules where some retain relative position and others change", () => {
      // prev: [A, B, C]
      // next: [B, A, C]
      // Shared: prev [A(0), B(1), C(2)], next [B(0), A(1), C(2)]
      // B moved (from 2 to 1), A moved (from 1 to 2), C unchanged at index 2 (fromOrder 3, toOrder 3)
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
        createModule("course-c", 3),
      ]);
      const next = createPlan([
        createModule("course-b", 1),
        createModule("course-a", 2),
        createModule("course-c", 3),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.moved).toEqual([
        { courseId: "course-b", fromOrder: 2, toOrder: 1 },
        { courseId: "course-a", fromOrder: 1, toOrder: 2 },
      ]);
      expect(diff.unchangedCount).toBe(1);
    });

    it("detects moving a module from the end to the beginning among shared modules", () => {
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
        createModule("course-c", 3),
      ]);
      const next = createPlan([
        createModule("course-c", 1),
        createModule("course-a", 2),
        createModule("course-b", 3),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.moved).toEqual([
        { courseId: "course-c", fromOrder: 3, toOrder: 1 },
        { courseId: "course-a", fromOrder: 1, toOrder: 2 },
        { courseId: "course-b", fromOrder: 2, toOrder: 3 },
      ]);
      expect(diff.unchangedCount).toBe(0);
    });
  });

  describe("unchanged count", () => {
    it("reports unchangedCount equal to number of shared modules when relative positions match", () => {
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
        createModule("course-c", 3),
      ]);
      const next = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
        createModule("course-c", 3),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.unchangedCount).toBe(3);
      expect(diff.moved).toEqual([]);
    });

    it("reports unchangedCount correctly when additions and removals occur without reordering shared items", () => {
      const prev = createPlan([
        createModule("course-drop", 1),
        createModule("course-a", 2),
        createModule("course-b", 3),
      ]);
      const next = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
        createModule("course-add", 3),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.removed).toEqual([{ courseId: "course-drop" }]);
      expect(diff.added).toEqual([
        { courseId: "course-add", rationale: "Rationale for course-add" },
      ]);
      expect(diff.moved).toEqual([]);
      expect(diff.unchangedCount).toBe(2);
    });

    it("reports unchangedCount of 0 when all shared modules are reordered", () => {
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
      ]);
      const next = createPlan([
        createModule("course-b", 1),
        createModule("course-a", 2),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.unchangedCount).toBe(0);
    });
  });

  describe("identical plans", () => {
    it("returns zero added, zero removed, zero moved, and full unchanged count for identical plans", () => {
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
        createModule("course-c", 3),
      ]);
      const next = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
        createModule("course-c", 3),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff).toEqual({
        added: [],
        removed: [],
        moved: [],
        unchangedCount: 3,
      });
      expect(() => PlanDiff.parse(diff)).not.toThrow();
    });

    it("handles two empty plans as identical", () => {
      const prev = createPlan([]);
      const next = createPlan([]);

      const diff = diffPlans(prev, next);

      expect(diff).toEqual({
        added: [],
        removed: [],
        moved: [],
        unchangedCount: 0,
      });
      expect(() => PlanDiff.parse(diff)).not.toThrow();
    });
  });

  describe("fully disjoint plans", () => {
    it("reports all next modules as added, all prev modules as removed, 0 moved, and 0 unchanged", () => {
      const prev = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
      ]);
      const next = createPlan([
        createModule("course-c", 1, { rationale: "Rationale C" }),
        createModule("course-d", 2, { rationale: "Rationale D" }),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff).toEqual({
        added: [
          { courseId: "course-c", rationale: "Rationale C" },
          { courseId: "course-d", rationale: "Rationale D" },
        ],
        removed: [
          { courseId: "course-a" },
          { courseId: "course-b" },
        ],
        moved: [],
        unchangedCount: 0,
      });
      expect(() => PlanDiff.parse(diff)).not.toThrow();
    });
  });

  describe("input normalization and edge cases", () => {
    it("sorts modules by the order field when array elements are not pre-sorted", () => {
      // Prev passed in reverse array order, but orders are 1, 2
      const prev = createPlan([
        createModule("course-b", 2),
        createModule("course-a", 1),
      ]);
      // Next passed in natural order
      const next = createPlan([
        createModule("course-a", 1),
        createModule("course-b", 2),
      ]);

      const diff = diffPlans(prev, next);

      expect(diff.moved).toEqual([]);
      expect(diff.unchangedCount).toBe(2);
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
    });
  });
});
