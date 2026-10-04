import Link from "next/link";
import { Wordmark } from "@/components/ambient/wordmark";
import { cn } from "@/lib/utils";

export function SiteFooter({ className, variant = "compact" }: { className?: string; variant?: "compact" | "full" }) {
  if (variant === "full") {
    return (
      <footer className={cn("border-t border-border text-sm text-muted-foreground", className)}>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1fr_auto] md:px-8">
          <div className="space-y-3">
            <Wordmark className="text-foreground" />
            <p className="max-w-[48ch]">
              Wellness guidance, not medical advice. Pulse is not a medical device. In an emergency, call your local
              emergency number.
            </p>
            <p className="text-xs">Built for MHacks 2026.</p>
          </div>
          <nav aria-label="Footer" className="flex gap-8 md:gap-12">
            <ul className="space-y-2">
              <li className="text-xs font-semibold tracking-wide text-foreground uppercase">Product</li>
              <li>
                <Link href="/#how" className="hover:text-foreground">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/#features" className="hover:text-foreground">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/#safety" className="hover:text-foreground">
                  Safety
                </Link>
              </li>
            </ul>
            <ul className="space-y-2">
              <li className="text-xs font-semibold tracking-wide text-foreground uppercase">Account</li>
              <li>
                <Link href="/auth/sign-in" className="hover:text-foreground">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/auth/sign-up" className="hover:text-foreground">
                  Get started
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground">
                  Privacy
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    );
  }
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
