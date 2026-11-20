import { describe, expect, it } from "vitest";
import {
  ProgressEventSummary,
  shouldConsiderReplan,
} from "./feedback";

function createEvent(
  overrides?: Partial<ProgressEventSummary>
): ProgressEventSummary {
  return {
    courseId: "course-1",
    type: "quiz",
    score: null,
    rating: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("shouldConsiderReplan", () => {
  describe("manual trigger", () => {
    it("always returns consider: true even with no events, market changes, or days passed", () => {
      const result = shouldConsiderReplan({
        trigger: "manual",
        eventsSincePlan: [],
        marketChangesInPlan: [],
        daysSincePlan: 0,
      });

      expect(result.consider).toBe(true);
      expect(result.signals).toEqual(["Manual replan requested by learner"]);
    });

    it("always returns consider: true regardless of elapsed days or activity state", () => {
      const result = shouldConsiderReplan({
        trigger: "manual",
        eventsSincePlan: [createEvent({ type: "quiz", score: 100 })],
        marketChangesInPlan: [{ skill: "TypeScript", delta: 0 }],
        daysSincePlan: 30,
      });

      expect(result.consider).toBe(true);
      expect(result.signals).toEqual(["Manual replan requested by learner"]);
    });
  });

  describe("progress trigger - quiz score", () => {
    it("returns consider: true for quiz score 59", () => {
      const result = shouldConsiderReplan({
        trigger: "progress",
        eventsSincePlan: [
          createEvent({
            courseId: "course-101",
            type: "quiz",
            score: 59,
          }),
        ],
        marketChangesInPlan: [],
        daysSincePlan: 1,
      });

      expect(result.consider).toBe(true);
      expect(result.signals).toContain(
        "Quiz score below 60 (59) in course course-101"
      );
    });

    it("returns consider: false for quiz score 60", () => {
      const result = shouldConsiderReplan({
        trigger: "progress",
        eventsSincePlan: [
          createEvent({
            courseId: "course-101",
            type: "quiz",
            score: 60,
          }),
        ],
        marketChangesInPlan: [],
        daysSincePlan: 1,
      });

      expect(result.consider).toBe(false);
      expect(result.signals).toEqual([]);
    });
  });

  describe("progress trigger - course rating", () => {
    it("returns consider: true for a too_hard rating", () => {
      const result = shouldConsiderReplan({
        trigger: "progress",
        eventsSincePlan: [
          createEvent({
            courseId: "course-102",
            type: "rating",
            rating: "too_hard",
          }),
        ],
        marketChangesInPlan: [],
        daysSincePlan: 1,
      });

      expect(result.consider).toBe(true);
      expect(result.signals).toContain('Course course-102 rated "too_hard"');
    });
  });

  describe("progress trigger - completions", () => {
    it("returns consider: false for one completion", () => {
      const result = shouldConsiderReplan({
        trigger: "progress",
        eventsSincePlan: [
          createEvent({
            courseId: "course-101",
            type: "completed",
          }),
        ],
        marketChangesInPlan: [],
        daysSincePlan: 1,
      });

      expect(result.consider).toBe(false);
      expect(result.signals).toEqual([]);
    });

    it("returns consider: true for two completions", () => {
      const result = shouldConsiderReplan({
        trigger: "progress",
        eventsSincePlan: [
          createEvent({
            courseId: "course-101",
            type: "completed",
          }),
          createEvent({
            courseId: "course-102",
            type: "completed",
          }),
        ],
        marketChangesInPlan: [],
        daysSincePlan: 1,
      });

      expect(result.consider).toBe(true);
      expect(result.signals).toContain(
        "2 courses completed since the last plan"
      );
    });
  });

  describe("market trigger", () => {
    it("returns consider: true at delta 10", () => {
      const result = shouldConsiderReplan({
        trigger: "market",
        eventsSincePlan: [],
        marketChangesInPlan: [{ skill: "TypeScript", delta: 10 }],
        daysSincePlan: 1,
      });

      expect(result.consider).toBe(true);
      expect(result.signals).toContain(
        'Significant market demand shift for skill "TypeScript" (delta: +10)'
      );
    });

    it("returns consider: true at delta -10 (|delta| = 10)", () => {
      const result = shouldConsiderReplan({
        trigger: "market",
        eventsSincePlan: [],
        marketChangesInPlan: [{ skill: "Python", delta: -10 }],
        daysSincePlan: 1,
      });

      expect(result.consider).toBe(true);
      expect(result.signals).toContain(
        'Significant market demand shift for skill "Python" (delta: -10)'
      );
    });

    it("returns consider: false at delta 9", () => {
      const result = shouldConsiderReplan({
        trigger: "market",
        eventsSincePlan: [],
        marketChangesInPlan: [{ skill: "TypeScript", delta: 9 }],
        daysSincePlan: 1,
      });

      expect(result.consider).toBe(false);
      expect(result.signals).toEqual([]);
    });

    it("returns consider: false at delta -9 (|delta| = 9)", () => {
      const result = shouldConsiderReplan({
        trigger: "market",
        eventsSincePlan: [],
        marketChangesInPlan: [{ skill: "Python", delta: -9 }],
        daysSincePlan: 1,
      });

      expect(result.consider).toBe(false);
      expect(result.signals).toEqual([]);
    });
  });

  describe("cron trigger", () => {
    it("returns consider: true after 7 days with no events", () => {
      const result = shouldConsiderReplan({
        trigger: "cron",
        eventsSincePlan: [],
        marketChangesInPlan: [],
        daysSincePlan: 7,
      });

      expect(result.consider).toBe(true);
      expect(result.signals).toContain(
        "Inactivity: 7 days since the last plan with no progress events"
      );
    });

    it("returns consider: false at 6 days with no market change", () => {
      const result = shouldConsiderReplan({
        trigger: "cron",
        eventsSincePlan: [],
        marketChangesInPlan: [],
        daysSincePlan: 6,
      });

      expect(result.consider).toBe(false);
      expect(result.signals).toEqual([]);
    });

    it("returns consider: false at 6 days even with sub-threshold market change (|delta| < 10)", () => {
      const result = shouldConsiderReplan({
        trigger: "cron",
        eventsSincePlan: [],
        marketChangesInPlan: [{ skill: "TypeScript", delta: 9 }],
        daysSincePlan: 6,
      });

      expect(result.consider).toBe(false);
      expect(result.signals).toEqual([]);
    });

    it("returns consider: false at 7 days if there are progress events and no market change", () => {
      const result = shouldConsiderReplan({
        trigger: "cron",
        eventsSincePlan: [
          createEvent({
            type: "quiz",
            score: 85,
          }),
        ],
        marketChangesInPlan: [],
        daysSincePlan: 7,
      });

      expect(result.consider).toBe(false);
      expect(result.signals).toEqual([]);
    });
  });
});
