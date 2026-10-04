// The left column: one row per channel. A Server Component.
import Link from "next/link";
import { Bot, Clock, Globe, Link2, Link2Off, Smartphone, Webhook, type LucideIcon } from "lucide-react";
import { snippet, type ThreadRow } from "@/lib/conversations";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICON: Record<string, LucideIcon> = {
  imessage: Smartphone,
  asi_one: Bot,
  web: Globe,
  relay: Webhook,
};

/** Link state as an icon and words. The web channel is the site itself, so it has no link. */
export function LinkStatus({ row }: { row: Pick<ThreadRow, "channel" | "link"> }) {
  if (row.channel === "web") {
    return (
      <span className="inline-flex items-center gap-1">
        <Globe className="size-3" aria-hidden="true" />
        Built in
      </span>
    );
  }
  if (row.link.status === "linked") {
    return (
      <span className="inline-flex items-center gap-1">
        <Link2 className="size-3" aria-hidden="true" />
        Linked
        {row.link.masked && <span className="font-mono">{row.link.masked}</span>}
      </span>
    );
  }
  if (row.link.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3" aria-hidden="true" />
        Link pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Link2Off className="size-3" aria-hidden="true" />
      Not linked
    </span>
  );
}

export function ThreadList({ threads, selected }: { threads: ThreadRow[]; selected: string | null }) {
  return (
    <nav aria-label="Conversations">
      <ul className="divide-y divide-border border-y border-border">
        {threads.map((t) => {
          const active = t.channel === selected;
          const Icon = ICON[t.channel] ?? Globe;
          return (
            <li key={t.channel}>
              <Link
                href={`/conversations?channel=${t.channel}`}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cn(
                  "block px-3 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
                  active && "border-l-4 border-l-foreground bg-muted pl-2",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4" aria-hidden="true" />
                    {t.label}
                  </span>
                  {t.last && (
                    <time
                      dateTime={t.last.created_at}
                      className="shrink-0 text-xs text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {timeAgo(t.last.created_at)}
                    </time>
                  )}
                </span>
                <span className="mt-1 block truncate text-sm text-muted-foreground">
                  {t.last ? snippet(t.last.text, t.last.direction) : "No messages yet"}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  <LinkStatus row={t} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
