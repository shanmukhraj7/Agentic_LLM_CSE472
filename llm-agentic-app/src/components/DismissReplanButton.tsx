"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export type DismissReplanButtonProps = React.ComponentProps<typeof Button>;

export function DismissReplanButton({
  children = "Dismiss",
  variant = "outline",
  size = "sm",
  disabled,
  onClick,
  ...props
}: DismissReplanButtonProps) {
  const router = useRouter();

  const [loading, setLoading] = React.useState(false);

  const handleClick: DismissReplanButtonProps["onClick"] = async (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;

    setLoading(true);
    try {
      await fetch("/api/replan/seen", {
        method: "POST",
      });
      if (router) {
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to dismiss replan notification:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {children}
    </Button>
  );
}

export default DismissReplanButton;
