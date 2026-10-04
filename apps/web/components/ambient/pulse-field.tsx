"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Origin = "center" | "top-right" | "top-left" | "bottom-right" | "bottom-left" | [number, number];

type Props = {
  bpm?: number;
  intensity?: "hero" | "ambient";
  origin?: Origin;
  className?: string;
};

const ORIGINS: Record<string, [number, number]> = {
  center: [0.5, 0.5],
  "top-right": [0.82, 0.3],
  "top-left": [0.18, 0.3],
  "bottom-right": [0.85, 0.85],
  "bottom-left": [0.15, 0.85],
};

const TUNE = {
  hero: { gap: 22, base: 0.2, size: 1.15, lift: 0.55, grow: 1.7, push: 5, band: 70, lens: 130, lensGrow: 2.2, lensPush: 9, pink: 0.85 },
  ambient: { gap: 30, base: 0.11, size: 1.05, lift: 0.14, grow: 0.7, push: 2, band: 90, lens: 100, lensGrow: 0.9, lensPush: 4, pink: 0.5 },
} as const;

const GRAY = [142, 142, 147] as const;
const PINK = [255, 45, 85] as const;
const LIFETIME = 3.2;
const MAX_RIPPLES = 8;

type Ripple = { x: number; y: number; t0: number; amp: number };

export function PulseField({ bpm = 64, intensity = "ambient", origin = "center", className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bpmRef = useRef(bpm);
  const originKey = Array.isArray(origin) ? origin.join(",") : origin;

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const cfg = TUNE[intensity];
    const [ox, oy] = Array.isArray(origin) ? origin : (ORIGINS[origin] ?? ORIGINS.center);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let w = 0;
    let h = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let raf = 0;
    let running = false;
    let onscreen = true;
    let last = 0;
    let nextBeat = 0;
    let dub = -1;
    const ripples: Ripple[] = [];
    const ptr = { x: -999, y: -999, s: 0, target: 0 };

    const emit = (x: number, y: number, t: number, amp: number) => {
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push({ x, y, t0: t, amp });
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(${GRAY[0]},${GRAY[1]},${GRAY[2]},${cfg.base})`;
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cfg.gap + cfg.gap / 2;
          const y = r * cfg.gap + cfg.gap / 2;
          ctx.moveTo(x + cfg.size, y);
          ctx.arc(x, y, cfg.size, 0, 6.2832);
        }
      }
      ctx.fill();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 15) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const t = now / 1000;

      const period = 60 / bpmRef.current;
      if (nextBeat === 0) nextBeat = t;
      if (t >= nextBeat) {
        emit(ox * w, oy * h, t, 1);
        dub = t + period * 0.3;
        nextBeat += period;
      }
      if (dub > 0 && t >= dub) {
        emit(ox * w, oy * h, t, 0.55);
        dub = -1;
      }
      while (ripples.length && t - ripples[0].t0 > LIFETIME) ripples.shift();

      ptr.s += (ptr.target - ptr.s) * Math.min(1, dt * 6);

      const reach = Math.hypot(w, h) * 1.05;
      const live = ripples.map((rp) => {
        const age = (t - rp.t0) / LIFETIME;
        const ease = 1 - (1 - age) * (1 - age);
        return { x: rp.x, y: rp.y, r: ease * reach, fade: (1 - age) * (1 - age) * rp.amp };
      });

      ctx.clearRect(0, 0, w, h);
      const baseStyle = `rgba(${GRAY[0]},${GRAY[1]},${GRAY[2]},${cfg.base})`;
      ctx.fillStyle = baseStyle;
      ctx.beginPath();
      const hot: number[] = [];
      const lensOn = ptr.s > 0.01;
      const lensR2 = cfg.lens * cfg.lens;

      for (let r = 0; r < rows; r++) {
        const by = r * cfg.gap + cfg.gap / 2;
        for (let c = 0; c < cols; c++) {
          const bx = c * cfg.gap + cfg.gap / 2;
          let wave = 0;
          let front = 0;
          let dxs = 0;
          let dys = 0;
          for (let i = 0; i < live.length; i++) {
            const rp = live[i];
            const dx = bx - rp.x;
            const dy = by - rp.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const k = (d - rp.r) / cfg.band;
            if (k > 2.4 || k < -2.4) continue;
            const a = Math.exp(-k * k) * rp.fade;
            wave += a;
            front += a * (k > -0.3 ? 1 : 0.35);
            if (d > 0.5) {
              dxs += (dx / d) * a;
              dys += (dy / d) * a;
            }
          }
          let lens = 0;
          let lx = 0;
          let ly = 0;
          if (lensOn) {
            const dx = bx - ptr.x;
            const dy = by - ptr.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < lensR2) {
              const d = Math.sqrt(d2) || 1;
              const q = 1 - d / cfg.lens;
              lens = q * q * ptr.s;
              lx = (dx / d) * lens;
              ly = (dy / d) * lens;
            }
          }
          if (wave < 0.02 && lens < 0.02) {
            ctx.moveTo(bx + cfg.size, by);
            ctx.arc(bx, by, cfg.size, 0, 6.2832);
          } else {
            hot.push(
              bx + dxs * cfg.push + lx * cfg.lensPush,
              by + dys * cfg.push + ly * cfg.lensPush,
              Math.min(wave, 1.2),
              Math.min(front / (wave || 1), 1),
              lens,
            );
          }
        }
      }
      ctx.fill();

      const k = w < 640 ? 0.55 : 1;
      for (let i = 0; i < hot.length; i += 5) {
        const wave = hot[i + 2] * k;
        const mix = hot[i + 3] * Math.min(wave * 1.4, 1) * cfg.pink;
        const lens = hot[i + 4];
        const rad = cfg.size + wave * cfg.grow + lens * cfg.lensGrow;
        const alpha = Math.min(cfg.base + wave * cfg.lift + lens * cfg.lift * 0.6, 0.9);
        const cr = GRAY[0] + (PINK[0] - GRAY[0]) * mix;
        const cg = GRAY[1] + (PINK[1] - GRAY[1]) * mix;
        const cb = GRAY[2] + (PINK[2] - GRAY[2]) * mix;
        ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha})`;
        ctx.beginPath();
        ctx.arc(hot[i], hot[i + 1], rad, 0, 6.2832);
        ctx.fill();
      }
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const start = () => {
      if (running || motion.matches || document.hidden || !onscreen) return;
      running = true;
      last = performance.now();
      nextBeat = 0;
      raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(box.width));
      h = Math.max(1, Math.round(box.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / cfg.gap);
      rows = Math.ceil(h / cfg.gap);
      if (!running) drawStatic();
    };

    const onMove = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      const inside = x >= 0 && y >= 0 && x <= box.width && y <= box.height;
      ptr.target = inside && e.pointerType !== "touch" ? 1 : 0;
      if (inside) {
        ptr.x = x;
        ptr.y = y;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!running) return;
      const box = canvas.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      if (x < 0 || y < 0 || x > box.width || y > box.height) return;
      emit(x, y, performance.now() / 1000, 0.9);
    };
    const onLeave = () => {
      ptr.target = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onMotion = () => {
      if (motion.matches) {
        stop();
        drawStatic();
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

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);
    resize();
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intensity, originKey]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
