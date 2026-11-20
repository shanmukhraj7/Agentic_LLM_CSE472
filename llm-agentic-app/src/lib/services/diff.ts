import { type Plan, type PlanDiff } from "@/lib/contracts";

/**
 * Pure function comparing two learning plans.
 *
 * - added: courseIds in next not in prev (with next's rationale)
 * - removed: in prev not in next
 * - moved: courseIds in both whose position among the SHARED modules
 *   (ordered by each plan's own order) differs, with fromOrder and toOrder
 *   taken from each plan's own order field
 * - unchangedCount: shared modules whose shared-position is the same
 */
export function diffPlans(prev: Plan, next: Plan): PlanDiff {
  const prevModules = [...(prev.modules ?? [])].sort((a, b) => a.order - b.order);
  const nextModules = [...(next.modules ?? [])].sort((a, b) => a.order - b.order);

  const prevMap = new Map<string, Plan["modules"][number]>();
  for (const m of prevModules) {
    if (!prevMap.has(m.courseId)) {
      prevMap.set(m.courseId, m);
    }
  }

  const nextMap = new Map<string, Plan["modules"][number]>();
  for (const m of nextModules) {
    if (!nextMap.has(m.courseId)) {
      nextMap.set(m.courseId, m);
    }
  }

  // added = courseIds in next not in prev (with next's rationale)
  const added: PlanDiff["added"] = [];
  const addedSeen = new Set<string>();
  for (const m of nextModules) {
    if (!prevMap.has(m.courseId) && !addedSeen.has(m.courseId)) {
      addedSeen.add(m.courseId);
      added.push({
        courseId: m.courseId,
        rationale: m.rationale,
      });
    }
  }

  // removed = in prev not in next
  const removed: PlanDiff["removed"] = [];
  const removedSeen = new Set<string>();
  for (const m of prevModules) {
    if (!nextMap.has(m.courseId) && !removedSeen.has(m.courseId)) {
      removedSeen.add(m.courseId);
      removed.push({
        courseId: m.courseId,
      });
    }
  }

  // Shared modules ordered by each plan's own order
  const prevShared: Plan["modules"][number][] = [];
  const prevSharedSeen = new Set<string>();
  for (const m of prevModules) {
    if (nextMap.has(m.courseId) && !prevSharedSeen.has(m.courseId)) {
      prevSharedSeen.add(m.courseId);
      prevShared.push(m);
    }
  }

  const nextShared: Plan["modules"][number][] = [];
  const nextSharedSeen = new Set<string>();
  for (const m of nextModules) {
    if (prevMap.has(m.courseId) && !nextSharedSeen.has(m.courseId)) {
      nextSharedSeen.add(m.courseId);
      nextShared.push(m);
    }
  }

  const prevSharedPos = new Map<string, number>();
  prevShared.forEach((m, idx) => {
    prevSharedPos.set(m.courseId, idx);
  });

  const nextSharedPos = new Map<string, number>();
  nextShared.forEach((m, idx) => {
    nextSharedPos.set(m.courseId, idx);
  });

  const moved: PlanDiff["moved"] = [];
  let unchangedCount = 0;

  for (let i = 0; i < nextShared.length; i++) {
    const nextMod = nextShared[i];
    const prevPos = prevSharedPos.get(nextMod.courseId);

    if (prevPos !== i) {
      const prevMod = prevMap.get(nextMod.courseId)!;
      moved.push({
        courseId: nextMod.courseId,
        fromOrder: prevMod.order,
        toOrder: nextMod.order,
      });
    } else {
      unchangedCount++;
    }
  }

  return {
    added,
    removed,
    moved,
    unchangedCount,
  };
}

export default diffPlans;
