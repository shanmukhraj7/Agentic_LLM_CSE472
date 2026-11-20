"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MarketShiftButtonProps {
  skills: string[];
}

export function MarketShiftButton({ skills }: MarketShiftButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string>("");
  const [delta, setDelta] = useState<number>(25);
  const [isLoading, setIsLoading] = useState(false);

  const activeSkill = selectedSkill || skills[0] || "";

  const skillItems = useMemo(
    () => skills.map((s) => ({ label: s, value: s })),
    [skills]
  );

  async function handleConfirm() {
    if (!activeSkill) {
      toast.error("Please select a skill");
      return;
    }

    if (delta < -30 || delta > 30) {
      toast.error("Delta must be an integer between -30 and 30");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/market/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          skill: activeSkill,
          delta,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error?.message || "Failed to simulate market shift"
        );
      }

      if (data.replanned) {
        toast.success(
          `Market shift applied! Plan updated to v${data.version}. ${data.reason || ""}`.trim()
        );
      } else {
        toast.info(
          data.reason || "Market shift applied, no plan change needed."
        );
      }

      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to simulate market shift";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <TrendingUp className="size-4" />
            Simulate market shift
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Simulate market shift</DialogTitle>
          <DialogDescription>
            Adjust market demand for skills covered in your current learning plan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="market-skill-select">Skill</Label>
            <Select
              value={activeSkill}
              items={skillItems}
              onValueChange={(val) => {
                if (val) setSelectedSkill(val);
              }}
              disabled={isLoading || skills.length === 0}
            >
              <SelectTrigger id="market-skill-select" className="w-full">
                <SelectValue placeholder="Select a skill" />
              </SelectTrigger>
              <SelectContent>
                {skills.map((skill) => (
                  <SelectItem key={skill} value={skill}>
                    {skill}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {skills.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No skills covered in current plan.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="market-delta-input">Delta (-30 to 30)</Label>
            <Input
              id="market-delta-input"
              type="number"
              min={-30}
              max={30}
              step={1}
              value={delta}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                setDelta(Number.isNaN(parsed) ? 0 : parsed);
              }}
              disabled={isLoading}
            />
          </div>

          <p className="text-xs text-muted-foreground italic">
            Demo only: market data is shared by all users
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !activeSkill || skills.length === 0}
          >
            {isLoading ? "Simulating..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
