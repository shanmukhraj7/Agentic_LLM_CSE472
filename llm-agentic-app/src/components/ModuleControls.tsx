"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ModuleControlsProps {
  courseId: string;
  completed: boolean;
  latestScore: number | null;
  latestRating: string | null;
}

const DIFFICULTY_OPTIONS = [
  { value: "too_easy", label: "Too easy" },
  { value: "just_right", label: "Just right" },
  { value: "too_hard", label: "Too hard" },
] as const;

function normalizeRating(val: string | null | undefined): string {
  if (!val) return "";
  const normalized = val.toLowerCase().replace(/\s+/g, "_");
  if (
    normalized === "too_easy" ||
    normalized === "just_right" ||
    normalized === "too_hard"
  ) {
    return normalized;
  }
  return val;
}

export function ModuleControls({
  courseId,
  completed,
  latestScore,
  latestRating,
}: ModuleControlsProps) {
  const router = useRouter();
  const [score, setScore] = useState<number | string>(
    latestScore !== null && latestScore !== undefined ? latestScore : ""
  );
  const [rating, setRating] = useState<string>(normalizeRating(latestRating));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const [prevLatestScore, setPrevLatestScore] = useState(latestScore);
  if (latestScore !== prevLatestScore) {
    setPrevLatestScore(latestScore);
    setScore(
      latestScore !== null && latestScore !== undefined ? latestScore : ""
    );
  }

  const [prevLatestRating, setPrevLatestRating] = useState(latestRating);
  if (latestRating !== prevLatestRating) {
    setPrevLatestRating(latestRating);
    setRating(normalizeRating(latestRating));
  }

  const isDisabled = completed || isSubmitting;

  async function handleAction(progressPayload: {
    courseId: string;
    type: "completed" | "quiz" | "rating";
    score?: number;
    rating?: "too_easy" | "just_right" | "too_hard";
  }) {
    if (completed || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1. POST to /api/progress
      const progressRes = await fetch("/api/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(progressPayload),
      });

      if (!progressRes.ok) {
        let errorMessage = "Failed to record progress";
        try {
          const errData = await progressRes.json();
          if (typeof errData.error === "string") {
            errorMessage = errData.error;
          } else if (errData.error?.message) {
            errorMessage = errData.error.message;
          }
        } catch {
          // ignore
        }
        toast.error(errorMessage);
        return;
      }

      // 2. POST { trigger: "progress" } to /api/replan
      setIsChecking(true);
      const toastId = toast.loading(
        "Checking whether your plan needs to change..."
      );

      try {
        const replanRes = await fetch("/api/replan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ trigger: "progress" }),
        });

        const replanData = await replanRes.json();
        toast.dismiss(toastId);

        if (!replanRes.ok) {
          const errMsg =
            replanData?.error?.message ||
            replanData?.error ||
            "Failed to check plan updates";
          toast.error(
            typeof errMsg === "string" ? errMsg : "Failed to check plan updates"
          );
          return;
        }

        // 3. Toast the outcome
        if (replanData.replanned) {
          const message = `Plan updated to v${replanData.version}: ${replanData.reason}`;
          if (typeof toast.success === "function") {
            toast.success(
              <span>
                {message}{" "}
                <Link
                  href="/dashboard/history"
                  className="underline font-semibold ml-1 hover:text-primary"
                >
                  View history
                </Link>
              </span>,
              {
                action: {
                  label: "History",
                  onClick: () => router.push("/dashboard/history"),
                },
              }
            );
          } else {
            toast(message);
          }
        } else {
          if (typeof toast.info === "function") {
            toast.info("No change needed");
          } else {
            toast("No change needed");
          }
        }

        // 4. Then router.refresh()
        router.refresh();
      } catch (err: unknown) {
        toast.dismiss(toastId);
        const message =
          err instanceof Error ? err.message : "Failed to check plan updates";
        toast.error(message);
      } finally {
        setIsChecking(false);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to record progress";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleMarkComplete = () => {
    handleAction({
      courseId,
      type: "completed",
    });
  };

  const handleQuizSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (score === "" || score === null || score === undefined) {
      toast.error("Please enter a quiz score");
      return;
    }
    const numScore = Number(score);
    if (isNaN(numScore) || numScore < 0 || numScore > 100) {
      toast.error("Score must be between 0 and 100");
      return;
    }
    handleAction({
      courseId,
      type: "quiz",
      score: numScore,
    });
  };

  const handleRatingSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rating) {
      toast.error("Please select a difficulty");
      return;
    }
    const normalized = normalizeRating(rating) as
      | "too_easy"
      | "just_right"
      | "too_hard";
    if (!["too_easy", "just_right", "too_hard"].includes(normalized)) {
      toast.error("Invalid difficulty selection");
      return;
    }
    handleAction({
      courseId,
      type: "rating",
      rating: normalized,
    });
  };

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        {/* Mark complete button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleMarkComplete}
          disabled={isDisabled}
        >
          Mark complete
        </Button>

        {/* Quiz score input and Submit button */}
        <form onSubmit={handleQuizSubmit} className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="Score (0-100)"
            disabled={isDisabled}
            className="w-28 h-8 text-xs"
            aria-label="Quiz score"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={isDisabled}
            aria-label="Submit quiz score"
          >
            Submit
          </Button>
        </form>

        {/* Difficulty select and Submit button */}
        <form
          onSubmit={handleRatingSubmit}
          className="flex items-center gap-1.5"
        >
          <div className="relative">
            <Select
              value={rating}
              items={DIFFICULTY_OPTIONS}
              onValueChange={(val) => {
                if (val) setRating(val);
              }}
              disabled={isDisabled}
            >
              <SelectTrigger
                className="w-32 h-8 text-xs"
                disabled={isDisabled}
                aria-label="Difficulty"
              >
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <select
              aria-hidden="true"
              tabIndex={-1}
              className="sr-only"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              disabled={isDisabled}
            >
              <option value="">Difficulty</option>
              {DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={isDisabled}
            aria-label="Submit difficulty"
          >
            Submit
          </Button>
        </form>
      </div>

      {isChecking && (
        <p className="text-xs text-muted-foreground animate-pulse">
          Checking whether your plan needs to change...
        </p>
      )}
    </div>
  );
}

export default ModuleControls;
