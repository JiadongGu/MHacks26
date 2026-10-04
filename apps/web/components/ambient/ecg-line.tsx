"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  bpm?: number;
  tone?: "light" | "dark";
  color?: string;
  height?: number;
  className?: string;
  label?: string;
};

const SPEED = 110;
const GAUSS: [number, number, number][] = [
  [0.16, 0.13, 0.03],
  [0.3, -0.12, 0.008],
  [0.335, 1, 0.011],
  [0.37, -0.24, 0.011],
  [0.62, 0.3, 0.055],
];

function beatValue(phase: number, beat: number) {
  const jitter = 1 + (((beat * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.08;
  let v = 0;
  for (let i = 0; i < GAUSS.length; i++) {
    const [mu, amp, sd] = GAUSS[i];
    const z = (phase - mu) / sd;
    v += amp * (i === 2 ? jitter : 1) * Math.exp(-0.5 * z * z);
  }
  return v;
}

function signal(time: number, bpm: number) {
  const beats = time * (bpm / 60);
  const beat = Math.floor(beats);
  return beatValue(beats - beat, beat) + Math.sin(time * 7.3) * 0.012;
}

export function EcgLine({
  bpm = 64,
  tone = "light",
  color = "#FF2D55",
  height = 120,
  className,
  label = "Simulated ECG trace",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const bpmRef = useRef(bpm);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const tip = tipRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !tip || !ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const dark = tone === "dark";
    const grid = dark ? "rgba(255,255,255,0.06)" : "rgba(60,60,67,0.07)";
    const cross = dark ? "rgba(255,255,255,0.35)" : "rgba(60,60,67,0.35)";

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;
    let onscreen = true;
    let last = 0;
    let clock = 0;
    let hoverX = -1;

    const yOf = (v: number) => h * 0.72 - v * h * 0.58;

    const draw = () => {
      const bp = bpmRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 24) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
      }
      for (let y = 0; y <= h; y += 24) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
      }
      ctx.stroke();

      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "rgba(255,45,85,0)");
      g.addColorStop(0.55, color);
      g.addColorStop(1, color);
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let x = 0; x <= w; x += 1) {
        const y = yOf(signal(clock - (w - x) / SPEED, bp));
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const hy = yOf(signal(clock, bp));
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(w - 2, hy, 9, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(w - 2, hy, 3.2, 0, 6.2832);
      ctx.fill();

      if (hoverX >= 0) {
        const age = (w - hoverX) / SPEED;
        const v = signal(clock - age, bp);
        ctx.strokeStyle = cross;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hoverX + 0.5, 0);
        ctx.lineTo(hoverX + 0.5, h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = dark ? "#fff" : "#1c1c1e";
        ctx.beginPath();
        ctx.arc(hoverX, yOf(v), 3.5, 0, 6.2832);
        ctx.fill();
        tip.textContent = `${(v * 1.2).toFixed(2)} mV  ·  ${age < 0.05 ? "now" : `${age.toFixed(1)} s ago`}`;
        tip.style.opacity = "1";
        tip.style.transform = `translateX(${Math.min(Math.max(hoverX - 52, 4), Math.max(w - 150, 4))}px)`;
      } else {
        tip.style.opacity = "0";
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 15) return;
      clock += Math.min((now - last) / 1000, 0.1);
      last = now;
      draw();
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const start = () => {
      if (running || motion.matches || document.hidden || !onscreen) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(box.width));
      h = Math.max(1, Math.round(box.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) {
        if (motion.matches && clock === 0) clock = 2.4;
        draw();
      }
    };

    const onMove = (e: PointerEvent) => {
      hoverX = e.clientX - canvas.getBoundingClientRect().left;
      if (!running) draw();
    };
    const onLeave = () => {
      hoverX = -1;
      if (!running) draw();
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onMotion = () => {
      if (motion.matches) {
        stop();
        draw();
      } else start();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      if (onscreen) start();
      else stop();
    });
    io.observe(canvas);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);
    resize();
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
    };
  }, [tone, color]);

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={`${label}, ${bpm} beats per minute`}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ height }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <div
        ref={tipRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1 left-0 rounded-md px-2 py-1 font-mono text-xs opacity-0 transition-opacity",
          tone === "dark" ? "bg-white/10 text-white" : "bg-foreground text-background",
        )}
      />
    </div>
  );
}
