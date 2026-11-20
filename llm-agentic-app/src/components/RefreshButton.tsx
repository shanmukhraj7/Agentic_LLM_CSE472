"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RefreshButtonProps = React.ComponentProps<typeof Button>;

export function RefreshButton({
  children,
  className,
  variant = "outline",
  size = "sm",
  disabled,
  ...props
}: RefreshButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleRefresh() {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/market/refresh", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error?.message || "Failed to refresh market trends"
        );
      }

      if (data.replanned) {
        toast.success(
          `Market refreshed (${data.changedSkills} skills updated)! Plan updated to v${data.version}. ${data.reason || ""}`.trim()
        );
      } else {
        toast.info(
          data.reason ||
            `Market refreshed (${data.changedSkills} skills updated), no plan change needed.`
        );
      }

      router.refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to refresh market";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("gap-1.5", className)}
      disabled={disabled || isLoading}
      onClick={handleRefresh}
      aria-busy={isLoading}
      aria-label="Refresh market and re-plan now"
      {...props}
    >
      <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
      <span>
        {isLoading
          ? "Refreshing..."
          : children ?? "Refresh market and re-plan now"}
      </span>
    </Button>
  );
}

export default RefreshButton;
