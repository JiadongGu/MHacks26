// Pure helpers for the /conversations page: channel names, thread grouping, id masking, tool chips.
// No I/O, so vitest can test them.
import { humanize } from "@/lib/format";

export type Channel = "imessage" | "asi_one" | "web" | "relay";

/** Order of the channels in the thread list when two threads have no messages. */
export const CHANNELS: Channel[] = ["imessage", "asi_one", "web", "relay"];

const LABEL: Record<Channel, string> = {
  imessage: "iMessage",
  asi_one: "ASI:One",
  web: "Web",
  relay: "Relay",
};

export function isChannel(value: string | null | undefined): value is Channel {
  return typeof value === "string" && (CHANNELS as string[]).includes(value);
}

export function channelLabel(channel: string): string {
  return isChannel(channel) ? LABEL[channel] : humanize(channel);
}

/** Keeps the last four characters. "+13135550123" becomes "••••••••0123". Short ids stay short. */
export function maskExternalId(id: string | null | undefined): string | null {
  const value = id?.trim();
  if (!value) return null;
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

export type LinkRow = {
  channel: string;
  external_id: string | null;
  status: "pending" | "linked";
  linked_at: string | null;
  created_at: string;
};

export type LinkState = { status: "linked" | "pending" | "none"; masked: string | null };

/** One state per channel. A linked row wins over a pending one. The newest row wins inside a status. */
export function linkStateFor(channel: string, links: LinkRow[]): LinkState {
  const mine = links.filter((l) => l.channel === channel);
  const stamp = (l: LinkRow) => new Date(l.linked_at ?? l.created_at).getTime();
  const newest = (rows: LinkRow[]) => [...rows].sort((a, b) => stamp(b) - stamp(a))[0];
  const linked = newest(mine.filter((l) => l.status === "linked"));
  if (linked) return { status: "linked", masked: maskExternalId(linked.external_id) };
  const pending = newest(mine.filter((l) => l.status === "pending"));
  if (pending) return { status: "pending", masked: null };
  return { status: "none", masked: null };
}

export type ThreadSummary = {
  channel: string;
  count: number;
  last: { text: string; direction: "in" | "out"; created_at: string } | null;
};

export type ThreadRow = ThreadSummary & { link: LinkState; label: string };

/**
 * One row per channel that has messages or a link. Newest message first. A channel without messages goes last.
 * Pending-only links do not make a thread: the person has not linked anything yet.
 */
export function buildThreads(summaries: ThreadSummary[], links: LinkRow[]): ThreadRow[] {
  const byChannel = new Map<string, ThreadSummary>();
  for (const s of summaries) byChannel.set(s.channel, s);
  for (const l of links) {
    if (l.status === "linked" && !byChannel.has(l.channel)) {
      byChannel.set(l.channel, { channel: l.channel, count: 0, last: null });
    }
  }
  const rows = [...byChannel.values()].map((s) => ({
    ...s,
    label: channelLabel(s.channel),
    link: linkStateFor(s.channel, links),
  }));
  const rank = (c: string) => {
    const i = (CHANNELS as string[]).indexOf(c);
    return i === -1 ? CHANNELS.length : i;
  };
  return rows.sort((a, b) => {
    const at = a.last ? new Date(a.last.created_at).getTime() : -Infinity;
    const bt = b.last ? new Date(b.last.created_at).getTime() : -Infinity;
    if (at !== bt) return bt > at ? 1 : -1;
    return rank(a.channel) - rank(b.channel);
  });
}

/** The thread to open: the one in `?channel=` if it exists, otherwise the first (newest). */
export function pickChannel(param: string | undefined, threads: ThreadRow[]): string | null {
  if (param && threads.some((t) => t.channel === param)) return param;
  return threads[0]?.channel ?? null;
}

/** One line for the thread list. Pulse replies get a prefix so the list shows who spoke last. */
export function snippet(text: string, direction: "in" | "out", max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const body = flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
  return `${direction === "out" ? "Pulse: " : "You: "}${body}`;
}

// ---------------------------------------------------------------- tool calls

export type ToolCallView = { name: string };

const TOOL_CHIP: Record<string, string> = {
  propose_calendar_block: "proposed calendar block",
  approve_proposal: "approved proposal",
  reject_proposal: "rejected proposal",
  set_goal: "set a goal",
  log_symptom: "logged a symptom",
  emergency_guard: "safety check",
};

/** The text of one chip. Known write tools get a plain phrase. Read tools show as "used <name>". */
export function toolChipLabel(name: string): string {
  return TOOL_CHIP[name] ?? `used ${name}`;
}

/** Reads the stored tool_calls JSON ([{name, args}]). Drops anything odd. Never throws. */
export function parseToolCalls(raw: unknown): ToolCallView[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolCallView[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const name = (r as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) out.push({ name: name.trim() });
  }
  return out;
}

export type ThreadMessage = {
  id: string;
  channel: string;
  direction: "in" | "out";
  text: string;
  created_at: string;
  tools: ToolCallView[];
};

/** Oldest first, the order a chat reads in. The input is not changed. */
export function chronological<T extends { created_at: string }>(messages: T[]): T[] {
  return [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
