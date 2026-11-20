"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Profile, Level } from "@/lib/contracts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface ProfileEditorProps {
  initial: Profile;
  onSaved: () => void;
}

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export function ProfileEditor({ initial, onSaved }: ProfileEditorProps) {
  const [currentRole, setCurrentRole] = useState(initial.currentRole ?? "");
  const [targetRole, setTargetRole] = useState(initial.targetRole ?? "");
  const [yearsExperience, setYearsExperience] = useState<number | string>(
    initial.yearsExperience ?? 0
  );
  const [hoursPerWeek, setHoursPerWeek] = useState<number | string>(
    initial.hoursPerWeek ?? 10
  );
  const [goalSummary, setGoalSummary] = useState(initial.goalSummary ?? "");
  const [skills, setSkills] = useState<{ name: string; level: Level }[]>(
    () => (initial.skills ? initial.skills.map((s) => ({ ...s })) : [])
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleAddSkill = () => {
    setSkills((prev) => [...prev, { name: "", level: "beginner" }]);
  };

  const handleRemoveSkill = (index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSkillNameChange = (index: number, name: string) => {
    setSkills((prev) =>
      prev.map((skill, i) => (i === index ? { ...skill, name } : skill))
    );
  };

  const handleSkillLevelChange = (index: number, level: Level) => {
    setSkills((prev) =>
      prev.map((skill, i) => (i === index ? { ...skill, level } : skill))
    );
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    const payload = {
      currentRole,
      targetRole,
      yearsExperience:
        typeof yearsExperience === "string"
          ? yearsExperience.trim() === ""
            ? Number.NaN
            : Number(yearsExperience)
          : yearsExperience,
      hoursPerWeek:
        typeof hoursPerWeek === "string"
          ? hoursPerWeek.trim() === ""
            ? Number.NaN
            : Number(hoursPerWeek)
          : hoursPerWeek,
      goalSummary,
      skills,
    };

    const parsed = Profile.safeParse(payload);
    if (!parsed.success) {
      const message =
        parsed.error.issues
          .map((issue) =>
            issue.path.length > 0
              ? `${issue.path.join(".")}: ${issue.message}`
              : issue.message
          )
          .join("; ") || "Validation failed";
      toast.error(message);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed.data),
      });

      if (res.status === 200) {
        onSaved();
        return;
      }

      let errorMessage = `Failed to save profile (${res.status})`;
      try {
        const data = await res.json();
        if (typeof data.error === "string") {
          errorMessage = data.error;
        } else if (data.error && typeof data.error.message === "string") {
          errorMessage = data.error.message;
        } else if (Array.isArray(data.error)) {
          errorMessage = data.error
            .map((issue: { path?: (string | number)[]; message?: string }) =>
              issue.path && issue.path.length > 0
                ? `${issue.path.join(".")}: ${issue.message ?? ""}`
                : (issue.message ?? JSON.stringify(issue))
            )
            .join("; ");
        } else if (typeof data.message === "string") {
          errorMessage = data.message;
        }
      } catch {
        if (res.statusText) {
          errorMessage = `${res.status} ${res.statusText}`;
        }
      }

      toast.error(errorMessage);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save profile";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Edit Profile</CardTitle>
        <CardDescription>
          Update your career goals, experience, and skills.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSave}>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="currentRole">Current Role</Label>
            <Input
              id="currentRole"
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value)}
              placeholder="e.g. Junior Developer"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetRole">Target Role</Label>
            <Input
              id="targetRole"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Senior Full-Stack Engineer"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="yearsExperience">Years of Experience (0-40)</Label>
              <Input
                id="yearsExperience"
                type="number"
                min={0}
                max={40}
                value={yearsExperience}
                onChange={(e) =>
                  setYearsExperience(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hoursPerWeek">Hours per Week (1-60)</Label>
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
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goalSummary">Goal Summary (max 400 chars)</Label>
            <Input
              id="goalSummary"
              value={goalSummary}
              onChange={(e) => setGoalSummary(e.target.value)}
              placeholder="Describe your learning or career goal"
              maxLength={400}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Skills</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSkill}
              >
                Add skill
              </Button>
            </div>

            {skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No skills added yet. Click &quot;Add skill&quot; to add one.
              </p>
            ) : (
              <div className="space-y-3">
                {skills.map((skill, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={skill.name}
                      onChange={(e) =>
                        handleSkillNameChange(index, e.target.value)
                      }
                      placeholder="Skill name (e.g. React, Python)"
                      className="flex-1"
                    />

                    <Select
                      value={skill.level}
                      items={LEVEL_OPTIONS}
                      onValueChange={(val) => {
                        if (val) {
                          handleSkillLevelChange(index, val as Level);
                        }
                      }}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Level" />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveSkill(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-end pt-6">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default ProfileEditor;
