export interface AgentConfig {
  agentUrl: string;
  internalToken: string;
  timeoutMs?: number;
}

export interface InboundMsg {
  id: string;
  direction?: string;
  sender?: { id: string };
  content: { type: string; text?: string };
}

export interface InboundPayload {
  channel: "imessage";
  external_id: string;
  text: string;
  message_id: string;
}

export const TROUBLE_REPLY = "Pulse is having trouble, try again in a minute.";

export function createDeduper(max = 1000): (id: string) => boolean {
  const seen = new Set<string>();
  return (id) => {
    if (seen.has(id)) return true;
    seen.add(id);
    if (seen.size > max) seen.delete(seen.values().next().value as string);
    return false;
  };
}

/** Returns the payload for the agent, or null if the message must be skipped. */
export function toInboundPayload(m: InboundMsg): InboundPayload | null {
  if (m.direction === "outbound") return null;
  if (m.content.type !== "text" || !m.content.text) return null;
  if (!m.sender?.id) return null;
  return { channel: "imessage", external_id: m.sender.id, text: m.content.text, message_id: m.id };
}

export async function callAgent(
  cfg: AgentConfig,
  payload: InboundPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(`${cfg.agentUrl}/agent/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": cfg.internalToken },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000),
  });
  if (!res.ok) throw new Error(`agent status ${res.status}`);
  const body = (await res.json()) as { reply?: unknown };
  return typeof body.reply === "string" ? body.reply : "";
}

/** Returns the text to send back, or null for no reply. Never throws. */
export async function handleInbound(
  cfg: AgentConfig,
  m: InboundMsg,
  isDuplicate: (id: string) => boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const payload = toInboundPayload(m);
  if (!payload || isDuplicate(m.id)) return null;
  const started = Date.now();
  try {
    const reply = await callAgent(cfg, payload, fetchImpl);
    log("inbound_ok", { id: m.id, ms: Date.now() - started });
    return reply.trim() ? reply : null;
  } catch (err) {
    log("inbound_error", { id: m.id, ms: Date.now() - started, error: String(err) });
    return TROUBLE_REPLY;
  }
}

export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...fields }));
}
