import { describe, expect, it } from "vitest";
import {
  buildThreads,
  channelLabel,
  chronological,
  isChannel,
  linkStateFor,
  maskExternalId,
  parseToolCalls,
  pickChannel,
  snippet,
  toolChipLabel,
  type LinkRow,
  type ThreadSummary,
} from "@/lib/conversations";

const link = (channel: string, status: "pending" | "linked", extra: Partial<LinkRow> = {}): LinkRow => ({
  channel,
  external_id: null,
  status,
  linked_at: null,
  created_at: "2026-10-01T10:00:00Z",
  ...extra,
});
const thread = (channel: string, at: string, text = "hi", direction: "in" | "out" = "in"): ThreadSummary => ({
  channel,
  count: 2,
  last: { text, direction, created_at: at },
});

describe("channels", () => {
  it("names channels", () => {
    expect(channelLabel("imessage")).toBe("iMessage");
    expect(channelLabel("asi_one")).toBe("ASI:One");
    expect(channelLabel("web")).toBe("Web");
    expect(channelLabel("sms_gateway")).toBe("Sms gateway");
  });
  it("accepts only known channels", () => {
    expect(isChannel("imessage")).toBe(true);
    expect(isChannel("telegram")).toBe(false);
    expect(isChannel(null)).toBe(false);
  });
});

describe("maskExternalId", () => {
  it("keeps the last four characters", () => {
    expect(maskExternalId("+13135550123")).toBe("••••••••0123");
  });
  it("never shows a short id", () => {
    expect(maskExternalId("abc")).toBe("••••");
  });
  it("gives null for nothing", () => {
    expect(maskExternalId(null)).toBeNull();
    expect(maskExternalId("  ")).toBeNull();
  });
});

describe("linkStateFor", () => {
  it("prefers a linked row over a pending one and masks the id", () => {
    const state = linkStateFor("imessage", [
      link("imessage", "pending", { created_at: "2026-10-02T10:00:00Z" }),
      link("imessage", "linked", { external_id: "+13135550123", linked_at: "2026-10-01T11:00:00Z" }),
    ]);
    expect(state).toEqual({ status: "linked", masked: "••••••••0123" });
  });
  it("reports pending and none", () => {
    expect(linkStateFor("asi_one", [link("asi_one", "pending")]).status).toBe("pending");
    expect(linkStateFor("asi_one", [link("imessage", "linked")]).status).toBe("none");
  });
  it("takes the newest linked row", () => {
    const state = linkStateFor("imessage", [
      link("imessage", "linked", { external_id: "old-1111", linked_at: "2026-09-01T00:00:00Z" }),
      link("imessage", "linked", { external_id: "new-2222", linked_at: "2026-10-01T00:00:00Z" }),
    ]);
    expect(state.masked?.endsWith("2222")).toBe(true);
  });
});

describe("buildThreads", () => {
  it("groups by channel and sorts the newest message first", () => {
    const rows = buildThreads(
      [thread("web", "2026-10-02T10:00:00Z"), thread("imessage", "2026-10-03T10:00:00Z")],
      [link("imessage", "linked", { external_id: "+13135550123" })],
    );
    expect(rows.map((r) => r.channel)).toEqual(["imessage", "web"]);
    expect(rows[0].label).toBe("iMessage");
    expect(rows[0].link.status).toBe("linked");
    expect(rows[1].link.status).toBe("none");
  });
  it("adds a linked channel that has no messages, last", () => {
    const rows = buildThreads([thread("web", "2026-10-02T10:00:00Z")], [link("asi_one", "linked")]);
    expect(rows.map((r) => r.channel)).toEqual(["web", "asi_one"]);
    expect(rows[1].last).toBeNull();
  });
  it("does not add a channel with only a pending link", () => {
    expect(buildThreads([], [link("imessage", "pending")])).toEqual([]);
  });
});

describe("pickChannel", () => {
  const rows = buildThreads([thread("web", "2026-10-02T10:00:00Z"), thread("imessage", "2026-10-03T10:00:00Z")], []);
  it("opens the channel in the URL when it exists", () => {
    expect(pickChannel("web", rows)).toBe("web");
  });
  it("opens the newest thread otherwise", () => {
    expect(pickChannel(undefined, rows)).toBe("imessage");
    expect(pickChannel("asi_one", rows)).toBe("imessage");
  });
  it("gives null when there are no threads", () => {
    expect(pickChannel("web", [])).toBeNull();
  });
});

describe("snippet", () => {
  it("marks who spoke and keeps one line", () => {
    expect(snippet("How did I\nsleep?", "in")).toBe("You: How did I sleep?");
    expect(snippet("Fine.", "out")).toBe("Pulse: Fine.");
  });
  it("cuts a long text", () => {
    const out = snippet("a".repeat(200), "out", 20);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe("Pulse: ".length + 20);
  });
});

describe("tool calls", () => {
  it("parses the stored JSON and drops odd entries", () => {
    expect(parseToolCalls([{ name: "get_status", args: {} }, { name: "" }, null, 4, { args: {} }])).toEqual([
      { name: "get_status" },
    ]);
    expect(parseToolCalls(null)).toEqual([]);
    expect(parseToolCalls({ name: "x" })).toEqual([]);
  });
  it("words the chips", () => {
    expect(toolChipLabel("get_status")).toBe("used get_status");
    expect(toolChipLabel("propose_calendar_block")).toBe("proposed calendar block");
  });
});

describe("chronological", () => {
  it("sorts oldest first without changing the input", () => {
    const input = [{ created_at: "2026-10-03T00:00:00Z" }, { created_at: "2026-10-01T00:00:00Z" }];
    expect(chronological(input).map((m) => m.created_at)).toEqual(["2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z"]);
    expect(input[0].created_at).toBe("2026-10-03T00:00:00Z");
  });
});
