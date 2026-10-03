import { describe, it, expect, vi, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createDeduper, handleInbound, toInboundPayload, TROUBLE_REPLY } from "../src/agent.js";
import { createHttpServer } from "../src/http.js";

const cfg = { agentUrl: "http://agent", internalToken: "tok" };
const msg = { id: "m1", direction: "inbound", sender: { id: "+15551234567" }, content: { type: "text", text: "hi" } };

describe("dedupe", () => {
  it("flags repeats and evicts the oldest", () => {
    const d = createDeduper(2);
    expect(d("a")).toBe(false);
    expect(d("a")).toBe(true);
    d("b");
    d("c");
    expect(d("a")).toBe(false);
  });
});

describe("inbound mapping", () => {
  it("skips outbound, non-text, and sender-less messages", () => {
    expect(toInboundPayload({ ...msg, direction: "outbound" })).toBeNull();
    expect(toInboundPayload({ ...msg, content: { type: "attachment" } })).toBeNull();
    expect(toInboundPayload({ id: "x", content: { type: "text", text: "hi" } })).toBeNull();
  });

  it("posts the mapped payload with the internal token", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ reply: "ok", actions: [] })));
    const reply = await handleInbound(cfg, msg, createDeduper(), f as unknown as typeof fetch);
    expect(reply).toBe("ok");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://agent/agent/inbound");
    expect((init.headers as Record<string, string>)["x-internal-token"]).toBe("tok");
    expect(JSON.parse(init.body as string)).toEqual({
      channel: "imessage", external_id: "+15551234567", text: "hi", message_id: "m1",
    });
  });

  it("returns null for an empty reply and a duplicate", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ reply: "", actions: [] })));
    const dup = createDeduper();
    expect(await handleInbound(cfg, msg, dup, f as unknown as typeof fetch)).toBeNull();
    expect(await handleInbound(cfg, msg, dup, f as unknown as typeof fetch)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("returns the trouble reply on agent error", async () => {
    const f = vi.fn(async () => new Response("boom", { status: 500 }));
    expect(await handleInbound(cfg, msg, createDeduper(), f as unknown as typeof fetch)).toBe(TROUBLE_REPLY);
  });
});

describe("http", () => {
  let server: Server;
  afterEach(() => server?.close());

  async function start(send: (to: string, text: string) => Promise<string | undefined>) {
    server = createHttpServer({ provider: "terminal", gatewaySecret: "s3cret", send });
    await new Promise<void>((r) => server.listen(0, r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const post = (base: string, auth?: string) =>
    fetch(`${base}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify({ to: "+1555", text: "yo" }),
    });

  it("GET /health", async () => {
    const base = await start(async () => "id");
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true, provider: "terminal" });
  });

  it("POST /send returns 401 without a valid bearer token", async () => {
    const send = vi.fn(async () => "id1");
    const base = await start(send);
    expect((await post(base)).status).toBe(401);
    expect((await post(base, "Bearer wrong")).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("POST /send returns 200 with message_id", async () => {
    const send = vi.fn(async () => "id1");
    const base = await start(send);
    const res = await post(base, "Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message_id: "id1" });
    expect(send).toHaveBeenCalledWith("+1555", "yo");
  });

  it("POST /send returns 502 with the sender error text", async () => {
    const base = await start(async () => { throw new Error("Target not allowed for this project"); });
    const res = await post(base, "Bearer s3cret");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "Target not allowed for this project" });
  });
});
