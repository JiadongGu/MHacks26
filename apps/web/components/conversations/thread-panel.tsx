"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareDashed, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, ErrorNote, ListSkeleton } from "@/components/ui-bits";
import { me } from "@/lib/api-client";
import { chronological, toolChipLabel, type ThreadMessage } from "@/lib/conversations";
import { formatDateTime } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;

function Bubble({ m, timeZone }: { m: ThreadMessage; timeZone: string }) {
  const fromUser = m.direction === "in";
  return (
    <li className={cn("flex flex-col gap-1", fromUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-[1.15rem] px-3.5 py-2 text-[0.9375rem] leading-snug",
          fromUser
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-secondary text-secondary-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words">
          <span className="sr-only">{fromUser ? "You said: " : "Pulse said: "}</span>
          {m.text}
        </p>
      </div>
      {m.tools.length > 0 && (
        <ul aria-label="Tools Pulse used" className="flex max-w-[82%] flex-wrap gap-1">
          {m.tools.map((t, i) => (
            <li key={`${t.name}-${i}`}>
              <Chip icon={Wrench} className="font-mono">
                {toolChipLabel(t.name)}
              </Chip>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 text-xs text-muted-foreground">
        {fromUser ? "You" : "Pulse"}
        {" \u00b7 "}
        <time className="num" dateTime={m.created_at}>{formatDateTime(m.created_at, timeZone)}</time>
      </p>
    </li>
  );
}

/** One thread. It reloads every 10 seconds. When a new message arrives, it asks the page to refresh the thread list. */
export function ThreadPanel({
  channel,
  label,
  initial,
  timeZone,
}: {
  channel: string;
  label: string;
  /** Newest first, as the route returns it. */
  initial?: ThreadMessage[];
  timeZone: string;
}) {
  const router = useRouter();
  const { data, error, loading, refresh } = usePolling(
    async () =>
      (await me<{ messages: ThreadMessage[] }>(`/messages?channel=${encodeURIComponent(channel)}&limit=100`)).messages,
    { label: "Messages", intervalMs: POLL_MS, initial },
  );
  const scroller = useRef<HTMLDivElement>(null);
  const newestSeen = useRef<string | null>(initial?.[0]?.id ?? null);

  const messages = data ? chronological(data) : [];
  const lastId = messages.at(-1)?.id ?? null;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (lastId !== newestSeen.current) {
      newestSeen.current = lastId;
      router.refresh();
    }
  }, [lastId, router]);

  if (loading) return <div className="p-4"><ListSkeleton rows={4} label={`Loading ${label} messages`} /></div>;
  if (error && !data) {
    return (
      <div className="p-4">
        <ErrorNote
          action={
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          }
        >
          Could not load the {label} thread. {error}
        </ErrorNote>
      </div>
    );
  }
  if (messages.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={MessageSquareDashed} title={`No ${label} messages yet`}>
          Messages appear here a moment after you text Pulse. The thread checks for new messages every 10 seconds.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <ErrorNote className="m-4 mb-0">Could not refresh. Pulse will try again in 10 seconds.</ErrorNote>
      )}
      <div
        ref={scroller}
        role="log"
        aria-label={`${label} messages, oldest first`}
        aria-live="polite"
        tabIndex={0}
        className="max-h-[60vh] min-h-48 overflow-y-auto p-4 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <ol className="space-y-4">
          {messages.map((m) => (
            <Bubble key={m.id} m={m} timeZone={timeZone} />
          ))}
        </ol>
      </div>
    </div>
  );
}
