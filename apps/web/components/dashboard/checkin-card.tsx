"use client";

import { useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Moon, Pause, Play, Sparkles, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import { audioErrorText } from "@/lib/briefing";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import "@/components/vitals/vitals.css";

/** Bar heights in percent for the waveform. A fixed pattern, so the server and browser render the same. */
const WAVE = [30, 55, 40, 75, 50, 90, 60, 35, 70, 45, 85, 55, 30, 65, 95, 50, 40, 75, 60, 35, 80, 50, 65, 40, 55, 30, 70, 45];

const AUDIO_SRC = "/api/me/briefing-audio";

type Kind = "morning" | "evening" | "checkin";
type PlayState = "idle" | "loading" | "playing" | "error";

const COPY: Record<Kind, { title: string; endpoint: string | null; empty: string; busy: string; done: string }> = {
  morning: {
    title: "Morning check",
    endpoint: null,
    empty: "Pulse writes it and texts it every morning at 7.",
    busy: "",
    done: "",
  },
  evening: {
    title: "Evening check",
    endpoint: null,
    empty: "Around 9 pm Pulse looks at tomorrow and tells you when to wind down and what the day holds.",
    busy: "",
    done: "",
  },
  checkin: {
    title: "Check-in",
    endpoint: "/demo/checkin",
    empty: "Make one any time. It is not texted and does not replace the morning or evening check.",
    busy: "Could not make the check-in.",
    done: "Check-in ready.",
  },
};

/** One look for both check-ins. The morning one can also be read aloud. */
export function CheckinCard({
  kind,
  text,
  createdAt,
}: {
  kind: Kind;
  text: string | null;
  createdAt: string | null;
}) {
  const copy = COPY[kind];
  const Icon = kind === "morning" ? Sun : kind === "evening" ? Moon : Sparkles;
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [play, setPlay] = useState<PlayState>("idle");
  const [playError, setPlayError] = useState<string>(audioErrorText(null));
  const [running, setRunning] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = running || refreshing;

  async function run() {
    if (!copy.endpoint) return;
    setRunning(true);
    try {
      const res = await agent<{ ran: boolean }>(copy.endpoint, { method: "POST", body: {} });
      if (!res?.ran) {
        toast.error(`${copy.busy} Try again.`);
        return;
      }
      toast.success(copy.done);
      startRefresh(() => router.refresh());
    } catch (err) {
      toast.error(`${copy.busy} ${errorText(err)}`);
    } finally {
      setRunning(false);
    }
  }

  /** The audio element cannot tell why a load failed. One small request reads the status code. */
  async function failPlayback() {
    setPlay("error");
    try {
      const res = await fetch(AUDIO_SRC, {
        headers: { Range: "bytes=0-0" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      setPlayError(audioErrorText(res.ok ? null : res.status));
    } catch {
      setPlayError(audioErrorText(null));
    }
  }

  async function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (play === "playing") {
      el.pause();
      setPlay("idle");
      return;
    }
    setPlay("loading");
    // The browser loads the audio only now, so the page load never calls the voice service.
    if (!el.src || el.ended || el.error) el.src = `${AUDIO_SRC}?t=${Date.now()}`;
    try {
      await el.play();
    } catch {
      setPlay((s) => (s === "loading" ? "error" : s));
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4 md:p-5" aria-label={copy.title}>
      <header className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-sm font-semibold">
          <span
            className="grid size-8 place-items-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground"
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
          {copy.title}
        </h3>
        {createdAt && (
          <time dateTime={createdAt} suppressHydrationWarning className="text-xs text-muted-foreground">
            {timeAgo(createdAt)}
          </time>
        )}
      </header>

      {text === null ? (
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <p className="mt-3 max-w-[65ch] whitespace-pre-line text-base">{text}</p>
      )}

      {kind === "morning" && text !== null && (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted p-2 pr-4">
          {/* The audio element has no visible controls. The button drives it. */}
          <audio
            ref={audioRef}
            preload="none"
            onPlaying={() => setPlay("playing")}
            onEnded={() => setPlay("idle")}
            onPause={() => setPlay((s) => (s === "playing" ? "idle" : s))}
            onError={() => void failPlayback()}
          />
          <Button
            size="icon-lg"
            className="size-10 rounded-full"
            onClick={() => void toggle()}
            disabled={play === "loading"}
            aria-label={play === "playing" ? "Pause the morning check" : "Play the morning check"}
          >
            {play === "loading" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : play === "playing" ? (
              <Pause className="size-4" aria-hidden="true" />
            ) : (
              <Play className="size-4 translate-x-px" aria-hidden="true" />
            )}
          </Button>
          <div className="flex h-8 min-w-0 flex-1 items-center gap-[3px]" aria-hidden="true">
            {WAVE.map((h, i) => (
              <span
                key={i}
                className={cn(
                  "w-[3px] flex-1 rounded-full",
                  play === "playing" ? "wave-bar bg-primary" : "bg-muted-foreground/40",
                )}
                style={{ height: `${h}%`, "--b": i % 8 } as CSSProperties}
              />
            ))}
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {play === "loading" ? "Loading audio..." : play === "playing" ? "Playing" : "Listen"}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {copy.endpoint && (
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={busy} aria-busy={busy}>
            {busy ? "Working..." : text === null ? "Make one now" : "Make another"}
          </Button>
        )}
        <p className="sr-only" role="status">
          {play === "loading" ? "Loading audio" : play === "playing" ? "Playing" : ""}
        </p>
      </div>
      {play === "error" && <ErrorNote className="mt-4">{playError}</ErrorNote>}
    </article>
  );
}
