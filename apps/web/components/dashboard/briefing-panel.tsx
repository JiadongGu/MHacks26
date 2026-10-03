"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import { audioErrorText } from "@/lib/briefing";
import type { BriefingView } from "@/lib/queries";

const AUDIO_SRC = "/api/me/briefing-audio";

type PlayState = "idle" | "loading" | "playing" | "error";

export function BriefingPanel({ briefing }: { briefing: BriefingView | null }) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [play, setPlay] = useState<PlayState>("idle");
  const [playError, setPlayError] = useState<string>(audioErrorText(null));
  const [generating, setGenerating] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function generate() {
    setGenerating(true);
    try {
      const res = await agent<{ ran: boolean }>("/demo/briefing", { method: "POST", body: {} });
      if (!res?.ran) {
        toast.error("Could not generate the briefing. Try again.");
        return;
      }
      toast.success("Briefing ready.");
      startRefresh(() => router.refresh());
    } catch (err) {
      toast.error(`Could not generate the briefing: ${errorText(err)}`);
    } finally {
      setGenerating(false);
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
    if (!el.src || el.ended || el.error) {
      el.src = `${AUDIO_SRC}?t=${Date.now()}`;
    }
    try {
      await el.play();
    } catch {
      // An error event sets the error state. A pause during loading ends here.
      setPlay((s) => (s === "loading" ? "error" : s));
    }
  }

  const busy = generating || refreshing;

  return (
    <div>
      {/* The audio element has no visible controls. The button below drives it. */}
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => setPlay("playing")}
        onEnded={() => setPlay("idle")}
        onPause={() => setPlay((s) => (s === "playing" ? "idle" : s))}
        onError={() => void failPlayback()}
      />
      {briefing === null ? (
        <EmptyState
          title="No briefing for today yet"
          action={
            <Button onClick={() => void generate()} disabled={busy} aria-busy={busy}>
              {busy ? "Generating..." : "Generate briefing"}
            </Button>
          }
        >
          Pulse writes it every morning at 7. You can also make one now.
        </EmptyState>
      ) : (
        <div className="rounded-lg border border-border p-4">
          <p className="max-w-[65ch] text-base">{briefing.text}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void toggle()}
              disabled={play === "loading"}
              aria-label={play === "playing" ? "Pause the morning briefing" : "Play the morning briefing"}
            >
              {play === "loading" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : play === "playing" ? (
                <Pause className="size-4" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
              {play === "loading" ? "Loading audio..." : play === "playing" ? "Pause" : "Play"}
            </Button>
            <p className="sr-only" role="status">
              {play === "loading" ? "Loading audio" : play === "playing" ? "Playing" : ""}
            </p>
          </div>
          {play === "error" && (
            <ErrorNote className="mt-4">{playError}</ErrorNote>
          )}
        </div>
      )}
    </div>
  );
}
