"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface ProgressChartProps {
  completedCount: number;
  totalCount: number;
  quizScores: { date: string; score: number }[];
  className?: string;
}

export function ProgressChart({
  completedCount,
  totalCount,
  quizScores = [],
  className,
}: ProgressChartProps) {
  const percentage =
    totalCount > 0
      ? Math.min(100, Math.max(0, Math.round((completedCount / totalCount) * 100)))
      : 0;

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>
              {completedCount} of {totalCount} modules
            </span>
            <span className="text-muted-foreground font-normal">
              {percentage}%
            </span>
          </div>
          <Progress
            value={percentage}
            className="w-full"
            aria-label={`${completedCount} of ${totalCount} modules`}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">
            Quiz Scores Over Time
          </div>
          {!quizScores || quizScores.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              No quiz scores yet
            </div>
          ) : (
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 500, height: 240 }}
              >
                <LineChart
                  data={quizScores}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                  <XAxis
                    dataKey="date"
                    className="text-xs text-muted-foreground"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    className="text-xs text-muted-foreground"
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ProgressChart;
