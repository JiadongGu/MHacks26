import type { CSSProperties, ReactNode } from "react";
import {
  CircleAlert,
  CircleCheck,
  Info,
  Lightbulb,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Inline style that sets the stagger step for `.reveal`. */
export const stagger = (n: number) => ({ "--stagger": n }) as CSSProperties;

/** A titled white card. `index` staggers its entrance. */
export function Section({
  title,
  description,
  action,
  children,
  className,
  headingId,
  index,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headingId?: string;
  index?: number;
}) {
  return (
    <section
      aria-labelledby={headingId}
      style={index === undefined ? undefined : stagger(index)}
      className={cn(
        "rounded-lg border border-border bg-card p-4 md:p-5",
        index !== undefined && "reveal",
        className,
      )}
    >
      <div className="mb-4 flex min-h-8 items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** An iOS-style grouped list: a small label above, one white card below, rows split by inset hairlines. */
export function Group({
  title,
  footer,
  children,
  className,
  index,
  id,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  index?: number;
  id?: string;
}) {
  return (
    <section
      aria-labelledby={title && id ? id : undefined}
      style={index === undefined ? undefined : stagger(index)}
      className={cn(index !== undefined && "reveal", className)}
    >
      {title && (
        <h2
          id={id}
          className="mb-2 px-4 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          {title}
        </h2>
      )}
      <div className="overflow-hidden rounded-lg border border-border bg-card [&>*+*]:border-t [&>*+*]:border-border">
        {children}
      </div>
      {footer && <div className="mt-2 px-4 text-xs text-muted-foreground">{footer}</div>}
    </section>
  );
}

/** A small neutral label, for sources and channels. */
export function Chip({
  children,
  icon: Icon,
  className,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md bg-secondary px-1.5 text-xs font-medium text-foreground/75",
        className,
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

const STATUS = {
  normal: { label: "Normal", icon: CircleCheck, className: "bg-ok/15 text-ok-ink" },
  borderline: { label: "Borderline", icon: TriangleAlert, className: "bg-warn/15 text-warn-ink" },
  out_of_range: { label: "Out of range", icon: OctagonAlert, className: "bg-bad/12 text-bad-ink" },
} as const;

export type StatusKind = keyof typeof STATUS;

/** Status is always an icon and a word, never color alone. */
export function StatusPill({ status, className }: { status: StatusKind; className?: string }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        s.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
  className,
  icon: Icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: LucideIcon;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-dashed border-border bg-card/60 px-4 py-6 text-sm",
        className,
      )}
    >
      {Icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {children && <p className="mt-1 max-w-[60ch] text-muted-foreground">{children}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
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
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-bad/8 px-4 py-3 text-sm",
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
  info: { label: "Info", icon: Info, className: "bg-secondary text-foreground/75" },
  nudge: { label: "Nudge", icon: Lightbulb, className: "bg-primary/10 text-sidebar-accent-foreground" },
  warning: { label: "Warning", icon: TriangleAlert, className: "bg-warn/15 text-warn-ink" },
  urgent: { label: "Urgent", icon: OctagonAlert, className: "bg-bad/12 text-bad-ink" },
};

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
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
