import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-12 max-w-[60ch]">
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
