import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("text-xs text-muted-foreground", className)}>
      <p>Wellness guidance, not medical advice.</p>
    </footer>
  );
}
