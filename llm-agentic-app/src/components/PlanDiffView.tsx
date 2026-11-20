import React from "react";
import { type PlanDiff } from "@/lib/contracts";

export interface PlanDiffViewProps {
  diff: PlanDiff;
  titles: Record<string, string>;
}

export function PlanDiffView({ diff, titles }: PlanDiffViewProps) {
  const added = diff?.added ?? [];
  const removed = diff?.removed ?? [];
  const moved = diff?.moved ?? [];
  const unchangedCount = diff?.unchangedCount ?? 0;

  return (
    <div className="space-y-3">
      {added.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Added
          </div>
          <ul className="space-y-1">
            {added.map((item) => (
              <li
                key={item.courseId}
                className="text-sm font-medium text-emerald-600 dark:text-emerald-400"
              >
                <span>+ {titles[item.courseId] || item.courseId}</span>
                {item.rationale && (
                  <p className="text-xs font-normal text-muted-foreground mt-0.5 pl-3">
                    {item.rationale}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {removed.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
            Removed
          </div>
          <ul className="space-y-1">
            {removed.map((item) => (
              <li
                key={item.courseId}
                className="text-sm font-medium text-red-600 dark:text-red-400 line-through"
              >
                - {titles[item.courseId] || item.courseId}
              </li>
            ))}
          </ul>
        </div>
      )}

      {moved.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Moved
          </div>
          <ul className="space-y-1">
            {moved.map((item) => (
              <li
                key={item.courseId}
                className="text-sm text-foreground flex flex-wrap items-center gap-2"
              >
                <span className="font-medium">
                  {titles[item.courseId] || item.courseId}
                </span>
                <span className="text-xs text-muted-foreground">
                  from #{item.fromOrder} to #{item.toOrder}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-muted-foreground pt-1">
        {unchangedCount} unchanged
      </div>
    </div>
  );
}

export default PlanDiffView;
