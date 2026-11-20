"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Profile } from "@/lib/contracts";
import { ProfileEditor } from "@/components/ProfileEditor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [goalText, setGoalText] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState<number | string>(6);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error("File size exceeds 4 MB limit");
      e.target.value = "";
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (file && file.size > MAX_FILE_SIZE) {
      toast.error("File size exceeds 4 MB limit");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("goalText", goalText);
      formData.append("hoursPerWeek", String(hoursPerWeek));
      if (file) {
        formData.append("file", file);
      }

      const res = await fetch("/api/profile/draft", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        const message =
          data?.error?.message ||
          (typeof data?.error === "string" ? data.error : null) ||
          data?.message ||
          "Failed to draft profile";
        toast.error(message);
        return;
      }

      if (data.profile) {
        setProfile(data.profile);
        setStep(2);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to draft profile";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 2 && profile) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground text-center">
          Check what we extracted from your resume and fix anything wrong
        </p>
        <ProfileEditor
          initial={profile}
          onSaved={() => router.push("/dashboard?generate=1")}
        />
      </div>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Welcome! Let&apos;s get started</CardTitle>
        <CardDescription>
          Tell us about your learning goals and schedule to generate your profile.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="goalText">What do you want to become or learn?</Label>
            <Textarea
              id="goalText"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              placeholder="What do you want to become or learn?"
              rows={4}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hoursPerWeek">Hours per week</Label>
            <Input
              id="hoursPerWeek"
              type="number"
              min={1}
              max={60}
              value={hoursPerWeek}
              onChange={(e) =>
                setHoursPerWeek(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="resume">Resume (optional)</Label>
            <Input
              id="resume"
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileChange}
              disabled={loading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Drafting profile..." : "Continue"}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}

export default OnboardingForm;
