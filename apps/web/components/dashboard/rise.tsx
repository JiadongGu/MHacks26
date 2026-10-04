import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import "@/components/vitals/vitals.css";

/** Fades a block up on first paint. `i` is its place in the stagger. */
export function Rise({ i = 0, className, children }: { i?: number; className?: string; children: ReactNode }) {
  return (
    <div className={cn("pulse-rise", className)} style={{ "--i": i } as CSSProperties}>
      {children}
    </div>
  );
}

/** A titled group with no card of its own, so the cards inside sit on the gray page. */
export function GroupSection({
  title,
  headingId,
  action,
  children,
}: {
  title: string;
  headingId: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex min-h-7 items-center justify-between gap-4">
        <h2 id={headingId} className="text-xl font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
