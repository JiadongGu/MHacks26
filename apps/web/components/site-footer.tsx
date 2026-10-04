import Link from "next/link";
import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("text-xs text-muted-foreground", className)}>
      <p>
        Wellness guidance, not medical advice.{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy
        </Link>
      </p>
    </footer>
  );
}
