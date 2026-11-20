"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold tracking-tight mb-2">Something went wrong</h2>
      <p className="text-muted-foreground mb-6 text-sm">
        An unexpected error occurred. Please try again.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
