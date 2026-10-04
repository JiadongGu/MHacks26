"use client";

import { useEffect, useRef, useState } from "react";
import { valueParts } from "@/lib/vitals-card";

const DURATION_MS = 700;

/** The big number of a vitals card. It counts up from zero the first time it is on screen, unless motion is reduced. */
export function CountUp({ metricKey, value, unit }: { metricKey: string; value: number; unit: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [t, setT] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / DURATION_MS);
        setT(1 - Math.pow(1 - p, 3));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      setT(0);
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  const render = (v: number) =>
    valueParts(metricKey, v, unit).map((p, i) => (
      <span key={i} className={i > 0 ? "ml-1.5" : undefined}>
        {p.text}
        {p.unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{p.unit}</span>}
      </span>
    ));

  return (
    <span ref={ref} className="tabular-nums">
      <span aria-hidden="true">{render(value * t)}</span>
      <span className="sr-only">{render(value)}</span>
    </span>
  );
}
