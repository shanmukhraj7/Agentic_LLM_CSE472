"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StepId =
  | "analyzing_gaps"
  | "retrieving_courses"
  | "drafting_plan"
  | "validating"
  | "done";

export function GeneratePlan() {
  const router = useRouter();
  const [currentStage, setCurrentStage] = useState<string>("analyzing_gaps");
  const [visitedStages, setVisitedStages] = useState<Set<string>>(new Set());
  const [hasRevised, setHasRevised] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const mountedRef = useRef(false);

  const steps: { id: StepId; label: string }[] = [
    { id: "analyzing_gaps", label: "Analyzing skill gaps" },
    { id: "retrieving_courses", label: "Retrieving courses" },
    { id: "drafting_plan", label: "Drafting plan" },
    { id: "validating", label: hasRevised ? "Revising" : "Validating" },
    { id: "done", label: "Done" },
  ];

  const startGeneration = useCallback(async () => {
    setError(null);
    setIsProcessing(true);
    setCurrentStage("analyzing_gaps");
    setVisitedStages(new Set());
    setHasRevised(false);

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
      });

      if (!response.ok) {
        let errorMsg = "Failed to generate plan";
        try {
          const data = await response.json();
          errorMsg = data?.error?.message || data?.message || errorMsg;
        } catch {
          // ignore
        }
        setError(errorMsg);
        setIsProcessing(false);
        return;
      }

      if (!response.body) {
        setError("No response stream received");
        setIsProcessing(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const data = JSON.parse(trimmed);
          if (data.type === "status") {
            const stage = data.stage as string;
            if (stage === "revising") {
              setHasRevised(true);
            }
            setCurrentStage(stage);
            setVisitedStages((prev) => {
              const next = new Set(prev);
              if (stage === "drafting_plan") {
                next.add("analyzing_gaps");
              } else if (stage === "retrieving_courses") {
                next.add("analyzing_gaps");
                next.add("drafting_plan");
              } else if (stage === "validating") {
                next.add("analyzing_gaps");
                next.add("retrieving_courses");
                next.add("drafting_plan");
              } else if (stage === "revising") {
                next.add("analyzing_gaps");
                next.add("drafting_plan");
                next.add("retrieving_courses");
              } else if (stage === "done") {
                next.add("analyzing_gaps");
                next.add("retrieving_courses");
                next.add("drafting_plan");
                next.add("validating");
                next.add("done");
              }
              return next;
            });
          } else if (data.type === "result") {
            setCurrentStage("done");
            setVisitedStages(
              new Set([
                "analyzing_gaps",
                "retrieving_courses",
                "drafting_plan",
                "validating",
                "done",
              ])
            );
            router.replace("/dashboard");
            router.refresh();
          } else if (data.type === "error") {
            setError(data.message || "Failed to generate plan");
          }
        } catch (e) {
          console.error("Failed to parse stream chunk", e);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          handleLine(line);
        }
      }

      if (buffer.trim()) {
        handleLine(buffer.trim());
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate plan";
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  }, [router]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void startGeneration();
  }, [startGeneration]);

  const isStepCurrent = (stepId: StepId) => {
    if (stepId === "validating") {
      return currentStage === "validating" || currentStage === "revising";
    }
    return currentStage === stepId;
  };

  const isStepCompleted = (stepId: StepId) => {
    if (currentStage === "done") return true;
    if (isStepCurrent(stepId)) return false;
    return visitedStages.has(stepId);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Generating Plan</CardTitle>
        <CardDescription>
          Crafting your personalized learning curriculum
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-0">
          {steps.map((step, index) => {
            const isCurrent = isStepCurrent(step.id);
            const isCompleted = isStepCompleted(step.id);
            const isLast = index === steps.length - 1;

            return (
              <div key={step.id} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                      isCurrent &&
                        "border-primary bg-primary/10 text-primary font-bold shadow-xs",
                      isCompleted &&
                        "border-primary bg-primary text-primary-foreground",
                      !isCurrent &&
                        !isCompleted &&
                        "border-muted-foreground/30 bg-muted/20 text-muted-foreground/40"
                    )}
                  >
                    {isCurrent ? (
                      step.id === "done" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )
                    ) : isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </div>
                  {!isLast && (
                    <div
                      className={cn(
                        "w-0.5 h-8 my-1 transition-colors",
                        isCompleted ? "bg-primary" : "bg-border"
                      )}
                    />
                  )}
                </div>
                <div className="pt-1">
                  <p
                    className={cn(
                      "text-sm font-medium transition-colors",
                      isCurrent && "text-foreground font-semibold",
                      isCompleted && "text-muted-foreground",
                      !isCurrent && !isCompleted && "text-muted-foreground/50"
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
            <Button
              onClick={startGeneration}
              disabled={isProcessing}
              className="w-full"
            >
              Retry
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default GeneratePlan;
