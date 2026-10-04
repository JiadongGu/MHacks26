// Async Server Component for /conversations. It reads Neon on the server and handles its own error.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { LinkStatus, ThreadList } from "@/components/conversations/thread-list";
import { ThreadPanel } from "@/components/conversations/thread-panel";
import { buildThreads, pickChannel } from "@/lib/conversations";
import { listChannelLinks, listChannelMessages, listThreadSummaries } from "@/lib/queries";

export function ReplyHint({ photonNumber }: { photonNumber: string | null }) {
  return (
    <p className="mt-4 max-w-[60ch] text-sm text-muted-foreground">
      Reply from iMessage or ASI:One.
      {photonNumber ? (
        <>
          {" "}
          Pulse line: <span className="font-mono text-foreground">{photonNumber}</span>.
        </>
      ) : null}{" "}
      This page is a read-only log.
    </p>
  );
}

export async function ConversationsSection({
  userId,
  channelParam,
  timeZone,
  photonNumber,
}: {
  userId: string;
  channelParam: string | undefined;
  timeZone: string;
  photonNumber: string | null;
}) {
  let threads;
  let selected: string | null;
  let initial;
  try {
    const [summaries, links] = await Promise.all([listThreadSummaries(userId), listChannelLinks(userId)]);
    threads = buildThreads(summaries, links);
    selected = pickChannel(channelParam, threads);
    initial = selected ? await listChannelMessages(userId, selected, 100) : undefined;
  } catch (err) {
    console.error("ConversationsSection failed", err);
    return <ErrorNote>Could not load your conversations. Reload the page to try again.</ErrorNote>;
  }

  if (threads.length === 0 || !selected) {
    return (
      <div>
        <EmptyState
          title="No conversations yet"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/onboarding">Link iMessage in setup</Link>
            </Button>
          }
        >
          Link iMessage or ASI:One, then text Pulse. Your messages and Pulse&apos;s replies show here.
        </EmptyState>
        <ReplyHint photonNumber={photonNumber} />
      </div>
    );
  }

  const current = threads.find((t) => t.channel === selected)!;
  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
      <ThreadList threads={threads} selected={selected} />
      <section aria-labelledby="thread-title" className="min-w-0 max-w-3xl">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="thread-title" className="text-xl">
            {current.label}
          </h2>
          <p className="text-xs text-muted-foreground">
            <LinkStatus row={current} />
          </p>
        </div>
        <ThreadPanel key={selected} channel={selected} label={current.label} initial={initial} timeZone={timeZone} />
        <ReplyHint photonNumber={photonNumber} />
      </section>
    </div>
  );
}
