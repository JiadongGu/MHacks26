"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import styles from "./ambient.module.css";

let observer: IntersectionObserver | null = null;

function watch(el: Element) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add(styles.in);
        observer?.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  observer.observe(el);
  return () => observer?.unobserve(el);
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? watch(ref.current) : undefined), []);
  return (
    <div
      ref={ref}
      className={cn(styles.reveal, className)}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
