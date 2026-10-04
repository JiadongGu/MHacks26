import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Eyebrow, bold title, optional description (children), and an actions slot on the right. */
export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
  className,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "reveal mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 print:mb-4",
        className,
      )}
    >
      <div className="min-w-0 max-w-[60ch]">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="text-3xl">{title}</h1>
        {children && <p className="mt-2 text-base text-muted-foreground">{children}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </header>
  );
}
