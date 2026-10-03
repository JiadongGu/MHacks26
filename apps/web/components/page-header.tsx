import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-12 max-w-[60ch]", className)}>
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {eyebrow}
      </p>
      <h1 className="text-3xl">{title}</h1>
      {children && (
        <p className="mt-3 text-base text-muted-foreground">{children}</p>
      )}
    </header>
  );
}
