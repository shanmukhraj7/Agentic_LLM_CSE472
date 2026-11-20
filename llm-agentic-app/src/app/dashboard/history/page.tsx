import { redirect } from "next/navigation";
import { getUserOrNull } from "@/lib/auth";
import { getLearner } from "@/lib/learners";
import { getReplanHistory } from "@/lib/services/history";
import { getCoursesByIds } from "@/lib/rag/searchCourses";
import { PlanDiffView } from "@/components/PlanDiffView";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const instant = false;

export default async function HistoryPage() {
  const user = await getUserOrNull();
  if (!user) {
    redirect("/login");
  }

  const learner = await getLearner(user.id);
  if (!learner || learner.profileJson === null) {
    redirect("/onboarding");
  }

  const history = await getReplanHistory(user.id);

  if (history.length === 0) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Plan History</h1>
          <p className="text-sm text-muted-foreground">
            View how your learning plan changes over time.
          </p>
        </header>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No re-plans yet</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const courseIds = new Set<string>();
  for (const row of history) {
    for (const a of row.diff.added) {
      if (a.courseId) courseIds.add(a.courseId);
    }
    for (const r of row.diff.removed) {
      if (r.courseId) courseIds.add(r.courseId);
    }
    for (const m of row.diff.moved) {
      if (m.courseId) courseIds.add(m.courseId);
    }
  }

  const courseList = await getCoursesByIds(Array.from(courseIds));
  const titles: Record<string, string> = {};
  for (const course of courseList) {
    titles[course.id] = course.title;
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Plan History</h1>
        <p className="text-sm text-muted-foreground">
          View how your learning plan changes over time.
        </p>
      </header>

      <div className="space-y-6">
        {history.map((row) => {
          const from = row.fromVersion ?? 1;
          const to = row.toVersion ?? 2;
          const formattedDate = new Date(row.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });

          return (
            <Card key={row.id}>
              <CardHeader className="space-y-3 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-semibold">
                      {`v${from} -> v${to}`}
                    </CardTitle>
                    <Badge variant="secondary">{row.trigger}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formattedDate}
                  </span>
                </div>
                {row.reason && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {row.reason}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <PlanDiffView diff={row.diff} titles={titles} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
