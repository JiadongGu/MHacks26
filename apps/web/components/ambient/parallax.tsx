"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import styles from "./ambient.module.css";

export function ParallaxStage({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (!fine.matches) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--px", String((e.clientX / window.innerWidth - 0.5) * 2));
        el.style.setProperty("--py", String((e.clientY / window.innerHeight - 0.5) * 2));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function ParallaxLayer({
  depth,
  float,
  children,
  className,
}: {
  depth: number;
  float?: "a" | "b" | "c";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(styles.layer, className)} style={{ "--depth": depth } as React.CSSProperties}>
      <div className={float === "a" ? styles.floatA : float === "b" ? styles.floatB : float === "c" ? styles.floatC : ""}>
        {children}
      </div>
    </div>
  );
}

export function BeatingHeart({ children }: { children: React.ReactNode }) {
  return <span className={cn("inline-block", styles.beat)}>{children}</span>;
}
