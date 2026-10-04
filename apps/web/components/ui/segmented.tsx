"use client"

import { cn } from "@/lib/utils"

type Option<T extends string> = { value: T; label: string; count?: number }

/** A segmented control built on radio inputs, so arrow keys, focus and screen readers work without extra code. */
function Segmented<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  className,
}: {
  name: string
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-slot="segmented"
      className={cn("inline-flex rounded-lg bg-secondary p-0.5", className)}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "relative flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-[background-color,color,box-shadow] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            value === o.value
              ? "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
              : "text-foreground/70 hover:text-foreground"
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
          {o.count !== undefined && (
            <span className="num text-xs text-muted-foreground">{o.count}</span>
          )}
        </label>
      ))}
    </div>
  )
}

export { Segmented }
