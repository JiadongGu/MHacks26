"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui-bits";

export default function AppError({
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
    <div className="max-w-[60ch]">
      <ErrorNote
        action={
          <Button variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
        }
      >
        This page could not load. The database or the agent may be unreachable.
      </ErrorNote>
    </div>
  );
}
