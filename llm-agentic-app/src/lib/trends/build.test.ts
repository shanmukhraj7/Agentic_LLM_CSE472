import { describe, expect, it } from "vitest";
import { computeSkillTrends } from "./build";

describe("computeSkillTrends", () => {
  describe("empty input", () => {
    it("returns an empty array when jobs list is empty", () => {
      const result = computeSkillTrends([]);
      expect(result).toEqual([]);
    });

    it("returns an empty array when all jobs have empty skill lists", () => {
      const result = computeSkillTrends([{ skills: [] }, { skills: [] }]);
      expect(result).toEqual([]);
    });
  });

  describe("max skill scores 100", () => {
    it("assigns demandScore of 100 to the skill with the highest frequency", () => {
      const jobs = [
        { skills: ["TypeScript", "React"] },
        { skills: ["TypeScript"] },
      ];
      const result = computeSkillTrends(jobs);

      const ts = result.find((item) => item.skill === "TypeScript");
      expect(ts).toBeDefined();
      expect(ts?.demandScore).toBe(100);
      expect(ts?.delta).toBe(0);
    });

    it("assigns 100 to all tied skills that share the highest frequency", () => {
      const jobs = [
        { skills: ["TypeScript", "Node.js"] },
        { skills: ["TypeScript", "Node.js"] },
      ];
      const result = computeSkillTrends(jobs);

      for (const item of result) {
        expect(item.demandScore).toBe(100);
        expect(item.delta).toBe(0);
      }
    });

    it("deduplicates multiple occurrences of the same skill in a single job", () => {
      const jobs = [
        { skills: ["TypeScript", "TypeScript", "TypeScript"] },
        { skills: ["TypeScript", "React"] },
      ];
      const result = computeSkillTrends(jobs);

      const ts = result.find((item) => item.skill === "TypeScript");
      const react = result.find((item) => item.skill === "React");

      expect(ts?.demandScore).toBe(100);
      expect(react?.demandScore).toBe(50);
    });
  });

  describe("rounding", () => {
    it("rounds demandScore according to Math.round((100 * count) / maxCount)", () => {
      // maxCount = 3
      // Count 3 -> 100 * 3 / 3 = 100
      // Count 2 -> 100 * 2 / 3 = 66.666... -> rounds up to 67
      // Count 1 -> 100 * 1 / 3 = 33.333... -> rounds down to 33
      const jobs = [
        { skills: ["SkillA", "SkillB", "SkillC"] },
        { skills: ["SkillA", "SkillB"] },
        { skills: ["SkillA"] },
      ];
      const result = computeSkillTrends(jobs);

      const a = result.find((item) => item.skill === "SkillA");
      const b = result.find((item) => item.skill === "SkillB");
      const c = result.find((item) => item.skill === "SkillC");

      expect(a?.demandScore).toBe(100);
      expect(b?.demandScore).toBe(67);
      expect(c?.demandScore).toBe(33);
    });

    it("correctly rounds with other fractional values", () => {
      // maxCount = 6
      // Count 5 -> 500 / 6 = 83.333... -> 83
      // Count 1 -> 100 / 6 = 16.666... -> 17
      const jobs = [
        { skills: ["Main", "Sub5", "Sub1"] },
        { skills: ["Main", "Sub5"] },
        { skills: ["Main", "Sub5"] },
        { skills: ["Main", "Sub5"] },
        { skills: ["Main", "Sub5"] },
        { skills: ["Main"] },
      ];
      const result = computeSkillTrends(jobs);

      const main = result.find((item) => item.skill === "Main");
      const sub5 = result.find((item) => item.skill === "Sub5");
      const sub1 = result.find((item) => item.skill === "Sub1");

      expect(main?.demandScore).toBe(100);
      expect(sub5?.demandScore).toBe(83);
      expect(sub1?.demandScore).toBe(17);
    });
  });
});
