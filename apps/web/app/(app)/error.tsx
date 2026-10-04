"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div role="alert" className="reveal mx-auto mt-8 max-w-md rounded-lg border border-border bg-card p-6 md:mt-16">
      <span className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground">
        <CloudOff className="size-5" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl">This page did not load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The database or the agent may be unreachable. Your data is safe. Try again in a moment.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
