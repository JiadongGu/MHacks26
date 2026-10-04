import { sparkGeometry } from "@/lib/vitals-card";
import type { Band } from "@/lib/trends";
import { cn } from "@/lib/utils";
import "./vitals.css";

/** A smooth line over a faint band for the usual range, with a dot on the last value. Draws in once, unless motion is reduced. */
export function Sparkline({
  values,
  band = null,
  color,
  label,
  className,
  width = 200,
  height = 56,
}: {
  values: (number | null)[];
  band?: Band | null;
  color: string;
  /** Read by screen readers. Leave empty when text next to the chart says the same. */
  label?: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const g = sparkGeometry(values, band, width, height);
  return (
    <svg
      viewBox={`0 0 ${g.w} ${g.h}`}
      className={cn("block h-auto w-full overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {g.band && <rect x={0} y={g.band.y} width={g.w} height={g.band.height} rx={3} fill={color} fillOpacity={0.1} />}
      {g.line && (
        <path
          d={g.line}
          pathLength={1}
          className="spark-line"
          fill="none"
          stroke={color}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {g.last && (
        <circle className="spark-dot" cx={g.last.x} cy={g.last.y} r={3.5} fill={color} stroke="#fff" strokeWidth={1.75} />
      )}
    </svg>
  );
}
