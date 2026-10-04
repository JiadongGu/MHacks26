import { ArrowDown, ArrowUp, CircleCheck, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { TONE_COLORS, TONE_WORD, type Tone } from "@/lib/vitals-card";
import { cn } from "@/lib/utils";

const ICON: Record<Tone, LucideIcon> = { normal: CircleCheck, borderline: TriangleAlert, out: OctagonAlert };

/** Status as an icon and one word. Color backs it up and never carries the meaning alone. */
export function StatusPill({
  tone,
  word = TONE_WORD[tone],
  direction = null,
  variant = "inline",
  className,
}: {
  tone: Tone;
  word?: string;
  direction?: "above" | "below" | null;
  variant?: "inline" | "pill";
  className?: string;
}) {
  const Icon = ICON[tone];
  const c = TONE_COLORS[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold",
        variant === "pill" && "h-6 rounded-full px-2.5 text-[0.8125rem]",
        className,
      )}
      style={{ color: c.ink, background: variant === "pill" ? c.tint : undefined }}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {word}
      {direction && (
        <>
          {direction === "above" ? (
            <ArrowUp className="size-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3" aria-hidden="true" />
          )}
          <span className="sr-only">{direction === "above" ? "above usual" : "below usual"}</span>
        </>
      )}
    </span>
  );
}
