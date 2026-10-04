// The left column: one row per channel. A Server Component.
import Link from "next/link";
import { Bot, Clock, Globe, Link2, Link2Off, Smartphone, Webhook, type LucideIcon } from "lucide-react";
import { Chip, stagger } from "@/components/ui-bits";
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
      <ul className="overflow-hidden rounded-lg border border-border bg-card [&>li+li]:border-t [&>li+li]:border-border">
        {threads.map((t, i) => {
          const active = t.channel === selected;
          const Icon = ICON[t.channel] ?? Globe;
          return (
            <li key={t.channel} style={stagger(i)} className="reveal">
              <Link
                href={`/conversations?channel=${t.channel}`}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cn(
                  "relative flex gap-3 px-3 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
                  active && "bg-primary/[0.07] hover:bg-primary/[0.07]",
                )}
              >
                {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" />}
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full",
                    active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{t.label}</span>
                    {t.last && (
                      <time
                        dateTime={t.last.created_at}
                        className="num shrink-0 text-xs text-muted-foreground"
                        suppressHydrationWarning
                      >
                        {timeAgo(t.last.created_at)}
                      </time>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {t.last ? snippet(t.last.text, t.last.direction) : "No messages yet"}
                  </span>
                  <Chip className="mt-1.5">
                    <LinkStatus row={t} />
                  </Chip>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
