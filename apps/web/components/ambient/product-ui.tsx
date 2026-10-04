import { CalendarClock, CheckCircle2, HeartPulse, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spark({
  points,
  color = "#FF2D55",
  width = 120,
  height = 36,
  baseline,
  className,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
  baseline?: number;
  className?: string;
}) {
  const all = baseline === undefined ? points : [...points, baseline];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const pad = 3;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const step = (width - pad * 2) / (points.length - 1);
  const d = points.map((v, i) => `${i ? "L" : "M"}${(pad + i * step).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const lastX = pad + (points.length - 1) * step;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("block w-full", className)}
      style={{ height }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {baseline !== undefined && (
        <line
          x1={pad}
          x2={width - pad}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="#8E8E93"
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={y(points[points.length - 1])} r="3" fill={color} />
    </svg>
  );
}

export function Status({ kind }: { kind: "normal" | "borderline" }) {
  const Icon = kind === "normal" ? CheckCircle2 : TriangleAlert;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        kind === "normal" ? "text-[#1F7A3A]" : "text-[#9A5400]",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {kind === "normal" ? "Normal" : "Borderline"}
    </span>
  );
}

export const RHR_SERIES = [61, 62, 61, 63, 62, 64, 63, 65, 66, 68, 67, 70, 71];

export function MetricCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D70043]">
          <HeartPulse className="size-3.5" aria-hidden="true" />
          Resting heart rate
        </span>
        <Status kind="borderline" />
      </div>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight tabular-nums">71</span>
        <span className="text-sm text-muted-foreground">bpm</span>
        <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">+8 vs baseline</span>
      </p>
      <Spark points={RHR_SERIES} baseline={63} height={44} className="mt-3" />
    </div>
  );
}

export function ApprovalCard({ className, interactive = false }: { className?: string; interactive?: boolean }) {
  const btn = "inline-flex h-8 flex-1 items-center justify-center rounded-lg text-sm font-medium";
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarClock className="size-3.5" aria-hidden="true" />
        Waiting for your approval
      </p>
      <p className="mt-2 text-sm font-semibold">Move run to tomorrow</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
        <span className="line-through">Today 3:00 PM</span>
        <span aria-hidden="true">→</span>
        <span className="font-medium text-foreground">Tomorrow 3:00 PM</span>
      </div>
      <div className="mt-3 flex gap-2" aria-hidden={interactive ? undefined : true}>
        <span className={cn(btn, "bg-primary text-primary-foreground")}>Approve</span>
        <span className={cn(btn, "border border-border bg-background")}>Decline</span>
      </div>
    </div>
  );
}

function Bubble({ from, children }: { from: "pulse" | "you"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "max-w-[84%] rounded-[18px] px-3.5 py-2 text-[0.8125rem] leading-[1.35]",
        from === "you"
          ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
          : "mr-auto rounded-bl-md bg-[#E9E9EB] text-[#1c1c1e]",
      )}
    >
      {children}
    </p>
  );
}

export function ThreadCard({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-full bg-[#FF2D55]/10">
          <HeartPulse className="size-4 text-[#FF2D55]" aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Pulse</p>
          <p className="text-[0.6875rem] text-muted-foreground">iMessage</p>
        </div>
        <span className="ml-auto text-[0.6875rem] text-muted-foreground tabular-nums">7:42 AM</span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <Bubble from="pulse">
          Your resting heart rate is 8 bpm above your 30-day baseline and you slept 5 h 40 min. Move today&apos;s 3 pm
          run to tomorrow? Reply YES to approve.
        </Bubble>
        <Bubble from="you">YES</Bubble>
        <Bubble from="pulse">Done. The run is now tomorrow at 3 pm. Nothing else changed.</Bubble>
        <p className="mr-1 text-right text-[0.6875rem] text-muted-foreground">Delivered</p>
      </div>
    </div>
  );
}

export function RangeBar({
  label,
  value,
  unit,
  lo,
  hi,
  min,
  max,
  status,
}: {
  label: string;
  value: number;
  unit: string;
  lo: number;
  hi: number;
  min: number;
  max: number;
  status: "normal" | "borderline";
}) {
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums">
          <span className="font-semibold">{value}</span> <span className="text-muted-foreground">{unit}</span>
        </span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-secondary">
        <span
          className="absolute inset-y-0 rounded-full bg-[#34C759]/35"
          style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }}
        />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground"
          style={{ left: pct(value) }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>
          Your range {lo} to {hi}
        </span>
        <Status kind={status} />
      </div>
    </div>
  );
}
