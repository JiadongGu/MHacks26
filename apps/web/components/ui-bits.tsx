import type { ReactNode } from "react";
import {
  CircleAlert,
  Info,
  Lightbulb,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A titled section. A hairline and a heading, not a box, so the page keeps one weight of surface. */
export function Section({
  title,
  action,
  children,
  className,
  headingId,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headingId?: string;
}) {
  return (
    <section aria-labelledby={headingId} className={cn("border-t border-border pt-4", className)}>
      <div className="mb-4 flex min-h-8 items-center justify-between gap-4">
        <h2 id={headingId} className="text-xl">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border px-4 py-6 text-sm",
        className,
      )}
    >
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-[60ch] text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error text with an icon, so color is not the only signal. */
export function ErrorNote({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/40 px-4 py-3 text-sm",
        className,
      )}
    >
      <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="min-w-0 flex-1">{children}</p>
      {action}
    </div>
  );
}

export function ListSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

const SEVERITY: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  info: { label: "Info", icon: Info, className: "border-border text-muted-foreground" },
  nudge: { label: "Nudge", icon: Lightbulb, className: "border-border text-foreground" },
  warning: {
    label: "Warning",
    icon: TriangleAlert,
    className: "border-foreground/60 text-foreground",
  },
  urgent: {
    label: "Urgent",
    icon: OctagonAlert,
    className: "border-destructive bg-destructive/10 text-destructive",
  },
};

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-xs font-medium",
        s.className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** Label, optional hint, control, and error text wired with aria attributes. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Props that link a control to its hint and error text. */
export function describedBy(id: string, hint?: string, error?: string) {
  return {
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
    "aria-invalid": error ? true : undefined,
  } as const;
}
