import { redirect } from "next/navigation";
import { getUserOrNull } from "@/lib/auth";
import { getLearner } from "@/lib/learners";
import { getLatestPlan } from "@/lib/services/plans";
import { getCoursesByIds, type Course } from "@/lib/rag/searchCourses";
import { getProgressEvents } from "@/lib/services/progress";
import { type CriticReport } from "@/lib/contracts";
import { GeneratePlan } from "@/components/GeneratePlan";
import { PlanRoadmap } from "@/components/PlanRoadmap";
import { ProgressChart } from "@/components/ProgressChart";
import { MarketShiftButton } from "@/components/MarketShiftButton";
import { RefreshButton } from "@/components/RefreshButton";
import { ReplanBanner } from "@/components/ReplanBanner";

export const instant = false;

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getUserOrNull();
  if (!user) {
    redirect("/login");
  }

  const learner = await getLearner(user.id);
  if (!learner || learner.profileJson === null) {
    redirect("/onboarding");
  }

  const latestPlan = await getLatestPlan(user.id);
  const resolvedSearchParams = await searchParams;
  const generateParam = resolvedSearchParams.generate;
  const isGenerateRequested =
    generateParam === "1" ||
    (Array.isArray(generateParam) && generateParam.includes("1"));

  if (!latestPlan || isGenerateRequested) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-8">
        <ReplanBanner learnerId={user.id} />
        <GeneratePlan />
      </div>
    );
  }

  const courseIds = latestPlan.plan.modules.map((m) => m.courseId);
  const [courseList, progressEvents] = await Promise.all([
    getCoursesByIds(courseIds),
    getProgressEvents(user.id),
  ]);
  const courses: Record<string, Course> = {};
  for (const course of courseList) {
    courses[course.id] = course;
  }

  const criticReport: CriticReport = latestPlan.criticReport ?? {
    attempts: 1,
    deterministicIssues: [],
    verdict: null,
    warnings: [],
    passed: true,
  };

  const completedCourseIds = new Set(
    progressEvents
      .filter((e) => e.type === "completed" && e.courseId)
      .map((e) => e.courseId)
  );
  const completedCount = completedCourseIds.size;

  const planModuleList = latestPlan.plan.modules || [];
  const planCourseIdSet = new Set(planModuleList.map((m) => m.courseId));
  const completedNotInPlanCount = Array.from(completedCourseIds).filter(
    (id) => !planCourseIdSet.has(id)
  ).length;
  const totalCount = planModuleList.length + completedNotInPlanCount;

  const quizEvents = progressEvents.filter(
    (e) => e.type === "quiz" && e.score !== null && e.score !== undefined
  );
  const sortedQuizEvents = [...quizEvents].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });
  const quizScores = sortedQuizEvents.map((e) => ({
    date: e.createdAt
      ? new Date(e.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "",
    score: Number(e.score),
  }));

  const coveredSkills = Array.from(
    new Set(
      (latestPlan.plan.modules || [])
        .flatMap((m) => m.skillsCovered || [])
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-8">
      <ReplanBanner learnerId={user.id} />
      <div className="flex items-center justify-end gap-2">
        <RefreshButton />
        <MarketShiftButton skills={coveredSkills} />
      </div>
      <ProgressChart
        completedCount={completedCount}
        totalCount={totalCount}
        quizScores={quizScores}
      />
      <PlanRoadmap
        plan={latestPlan.plan}
        version={latestPlan.version}
        criticReport={criticReport}
        courses={courses}
        events={progressEvents}
      />
    </div>
  );
}
