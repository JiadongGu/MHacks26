"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fixed background behind the app content. A faint glow follows the pointer.
 * `children` is the slot for the canvas dot field, <PulseField intensity="ambient" bpm={n} />.
 * With reduced motion, or without a fine pointer, the glow stays at the top of the page.
 */
export function AmbientLayer({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (still || !fine) return;

    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="ambient-layer print:hidden">
      <div className="ambient-glow" />
      {children}
    </div>
  );
}
