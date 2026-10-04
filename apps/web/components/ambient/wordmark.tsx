import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("inline-flex items-center gap-2 rounded-md text-xl font-semibold tracking-tight", className)}
    >
      <HeartPulse className="size-5 text-[#FF2D55]" aria-hidden="true" />
      Pulse
    </Link>
  );
}
